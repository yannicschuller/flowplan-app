import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { decide, isMainFrame, missedSignIn, navigationState } from "../src/navigation";
import { beginSignIn, PendingSignIns, signInAnswerScript, SignInStarts, signInVia, type SignInOpeners } from "../src/sign-in";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";

// #109: "Mit SSO anmelden" did nothing in the Android app.
const server = "https://flowplan.example.com";

// What react-native-webview 14 hands onShouldStartLoadWithRequest on each
// platform (RNCWebViewClient.createWebViewEvent on Android, RNCWebViewImpl.m
// on iOS) for a tap on <a href="/api/auth/desktop?via=sso">.
const androidRequest = (url: string) => ({ url, loading: true, title: "Flowplan", canGoBack: false, canGoForward: false, lockIdentifier: 7 });
const iosRequest = (url: string, isTopFrame = true) => ({
  url,
  loading: false,
  title: "Flowplan",
  canGoBack: false,
  canGoForward: false,
  lockIdentifier: 0,
  navigationType: "click" as const,
  mainDocumentURL: url,
  isTopFrame,
  hasTargetFrame: true,
});

test("an Android request (no isTopFrame) is the main frame and starts the sign-in", () => {
  for (const url of [`${server}/api/auth/desktop?via=sso`, `${server}/api/auth/desktop`]) {
    const request = androidRequest(url);
    assert.equal("isTopFrame" in request, false);
    assert.equal(isMainFrame(request), true);
    const decision = decide(request.url, { server, mainFrame: isMainFrame(request), state: navigationState(), now: 1 });
    assert.deepEqual(decision, { kind: "signIn", via: url.endsWith("sso") ? "sso" : null });
  }
  assert.equal(isMainFrame({ url: server, isTopFrame: null }), true);
});

test("iOS keeps telling frames apart", () => {
  const url = `${server}/api/auth/desktop?via=sso`;
  assert.equal(isMainFrame(iosRequest(url)), true);
  assert.equal(isMainFrame(iosRequest(url, false)), false);
  assert.deepEqual(decide(url, { server, mainFrame: isMainFrame(iosRequest(url)), state: navigationState(), now: 1 }), { kind: "signIn", via: "sso" });
  assert.deepEqual(decide(url, { server, mainFrame: isMainFrame(iosRequest(url, false)), state: navigationState(), now: 1 }), { kind: "allow" });
});

test("a hand-off that loads anyway is caught at the load (missedSignIn)", () => {
  assert.deepEqual(missedSignIn(`${server}/api/auth/desktop?via=sso`, server), { via: "sso" });
  assert.deepEqual(missedSignIn(`${server}/api/auth/desktop`, server), { via: null });
  // The browser's part (with a challenge), other pages and other sites: no.
  assert.equal(missedSignIn(`${server}/api/auth/desktop?challenge=${"a".repeat(43)}`, server), null);
  assert.equal(missedSignIn(`${server}/api/auth/login`, server), null);
  assert.equal(missedSignIn(`${server}/`, server), null);
  assert.equal(missedSignIn("https://other.example.com/api/auth/desktop", server), null);
  assert.equal(missedSignIn("about:blank", server), null);
  assert.equal(missedSignIn(`${server}/api/auth/desktop`, null), null);
});

const opened: SignInOpeners = {
  platform: "android",
  authSession: async () => ({ type: "dismiss" }),
  customTab: async () => undefined,
  browser: async () => undefined,
};
const sha256Base64 = async (value: string) => createHash("sha256").update(value).digest("base64");

test("beginSignIn: the challenge goes to the sheet and is kept for the answer", async () => {
  const pending = new PendingSignIns();
  const urls: string[] = [];
  const out = await beginSignIn(server, "sso", {
    verifier: () => "v".repeat(43),
    sha256Base64,
    pending,
    open: { ...opened, customTab: async (url) => void urls.push(url) },
  });
  assert.deepEqual(out, { opened: true, link: null });
  const challenge = new URL(urls[0]).searchParams.get("challenge")!;
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(urls[0]).searchParams.get("via"), "sso");
  assert.equal(pending.take(challenge), "v".repeat(43));
});

test("beginSignIn: no failure is swallowed – the step is named", async () => {
  const pending = new PendingSignIns();
  const random = await beginSignIn(server, null, {
    verifier: () => {
      throw new Error("ExpoCrypto unavailable");
    },
    sha256Base64,
    pending,
    open: opened,
  });
  assert.deepEqual(random, { opened: false, stage: "challenge", error: "ExpoCrypto unavailable" });
  const digest = await beginSignIn(server, null, { verifier: () => "v", sha256Base64: async () => Promise.reject(new Error("digest")), pending, open: opened });
  assert.deepEqual(digest, { opened: false, stage: "challenge", error: "digest" });
  const garbled = await beginSignIn(server, null, { verifier: () => "v", sha256Base64: async () => "short", pending, open: opened });
  assert.equal(garbled.opened, false);
  const none = await beginSignIn(server, null, {
    verifier: () => "v",
    sha256Base64,
    pending,
    open: {
      ...opened,
      customTab: async () => Promise.reject(new Error("no tab")),
      browser: async () => Promise.reject(new Error("no browser")),
    },
  });
  assert.deepEqual(none, { opened: false, stage: "open", error: "no tab; no browser" });
});

test("one tap starts one sign-in, a second tap later starts another", () => {
  const starts = new SignInStarts();
  assert.equal(starts.begin(10_000), true);
  assert.equal(starts.begin(10_500), false, "navigation and load of the same tap");
  assert.equal(starts.begin(12_000), true);
});

test("the bridge offers signIn and the app hears it; the page hears the outcome", () => {
  for (const platform of ["android", "ios"] as const) {
    const script = bridgeScript({ server, platform, version: "1.0.6" });
    assert.match(script, /signIn: \(via\) => post\(\{ type: "signIn", via: via === "sso" \? "sso" : null \}\)/);
  }
  const message = parsePageMessage(JSON.stringify({ type: "signIn", via: "sso" }));
  assert.deepEqual(message, { type: "signIn", via: "sso" });
  assert.equal(signInVia({ via: "sso" }), "sso");
  assert.equal(signInVia({ via: "javascript:alert(1)" }), null);
  assert.equal(signInVia({}), null);
  assert.equal(
    signInAnswerScript({ status: "opened" }),
    `window.dispatchEvent(new CustomEvent("flowplan:sign-in", { detail: {"status":"opened"} })); true;`,
  );
  const failed = signInAnswerScript({ status: "failed", stage: "bridge/open", error: `</script>"${"x".repeat(400)}` });
  assert.match(failed, /"status":"failed","stage":"bridge\/open"/);
  assert.ok(failed.length < 500, "the error is cut short");
});
