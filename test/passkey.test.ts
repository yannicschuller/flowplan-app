import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { openPasskeySheet, passkeyAnswerScript, passkeySheetUrl, passkeyState, PendingPasskey } from "../src/passkey";

// "Passkey hinzufügen" (src/passkey.ts): the instance's one-time link opens in
// the system's sign-in sheet, which comes back to flowplan://passkey.
const server = "https://flowplan.example.test";
const token = "A".repeat(40) + "b_-";
const state = "s".repeat(32);

test("only this instance's /passkey-add?token=… opens, with the app's callback", () => {
  const url = new URL(passkeySheetUrl(`${server}/passkey-add?token=${token}`, server, state)!);
  assert.equal(url.origin, server);
  assert.equal(url.pathname, "/passkey-add");
  assert.equal(url.searchParams.get("token"), token);
  assert.equal(url.searchParams.get("return"), `flowplan://passkey?state=${state}`);
  for (const bad of [
    `https://evil.example/passkey-add?token=${token}`,
    `http://flowplan.example.test/passkey-add?token=${token}`,
    `${server}/api/auth/desktop?token=${token}`,
    `${server}/passkey-add?token=short`,
    `${server}/passkey-add?token=${token}&return=https://evil.example`,
    `${server}/passkey-add?token=${token}#x`,
    `https://user:pw@flowplan.example.test/passkey-add?token=${token}`,
    "javascript:alert(1)",
    "",
    42,
    undefined,
  ])
    assert.equal(passkeySheetUrl(bad, server, state), null, String(bad));
  assert.equal(passkeySheetUrl(`${server}/passkey-add?token=${token}`, null, state), null, "no instance, no sheet");
});

test("the callback counts once, for the state the app waits for", () => {
  const pending = new PendingPasskey();
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=added`), null, "nothing started");
  pending.start(state, 1000);
  assert.equal(pending.waiting(1000), true);
  assert.equal(pending.accept(`flowplan://passkey?state=other&status=added`, 1000), null, "another state");
  assert.equal(pending.accept(`flowplan://sign-in?state=${state}&status=added`, 1000), null, "another link");
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=added`, 1000), "added");
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=added`, 1000), null, "once");
  pending.start(state, 1000);
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=cancelled`, 1000), "cancelled");
  pending.start(state, 1000);
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=nonsense`, 1000), "failed");
  pending.start(state, 1000);
  assert.equal(pending.accept(`flowplan://passkey?state=${state}&status=added`, 1000 + 11 * 60_000), null, "too late");
  pending.start(state);
  assert.equal(pending.end(), true);
  assert.equal(pending.end(), false);
  assert.equal(pending.waiting(), false);
});

test("iOS: the auth session with the callback; Android: a Custom Tab, else the browser", async () => {
  const calls: string[] = [];
  const openers = (platform: string, session: { type: string; url?: string }, tab = true) => ({
    platform,
    authSession: async (_url: string, redirect: string) => (calls.push(`session ${redirect}`), session),
    customTab: async () => {
      calls.push("tab");
      if (!tab) throw new Error("no tab");
    },
    browser: async () => calls.push("browser"),
  });
  const link = `flowplan://passkey?state=${state}&status=added`;
  assert.deepEqual(await openPasskeySheet("https://x/passkey-add", openers("ios", { type: "success", url: link })), { opened: true, link, closed: true });
  assert.deepEqual(await openPasskeySheet("https://x/passkey-add", openers("ios", { type: "cancel" })), { opened: true, link: null, closed: true });
  assert.deepEqual(calls.splice(0), ["session flowplan://passkey", "session flowplan://passkey"]);
  assert.deepEqual(await openPasskeySheet("https://x/passkey-add", openers("android", { type: "dismiss" })), { opened: true, link: null, closed: false });
  assert.deepEqual(await openPasskeySheet("https://x/passkey-add", openers("android", { type: "dismiss" }, false)), { opened: true, link: null, closed: false });
  assert.deepEqual(calls.splice(0), ["tab", "tab", "browser"]);
  const failing = await openPasskeySheet("https://x/a", {
    platform: "ios",
    authSession: async () => {
      throw new Error("busy");
    },
    customTab: async () => {},
    browser: async () => {},
  });
  assert.deepEqual(failing, { opened: false, error: "busy" });
});

test("the page hears the answer; the bridge offers addPasskey", () => {
  for (const status of ["added", "cancelled", "failed"] as const) {
    const seen: unknown[] = [];
    new Function("window", "CustomEvent", passkeyAnswerScript(status))(
      { dispatchEvent: (event: { type: string; detail: unknown }) => seen.push([event.type, event.detail]) },
      class {
        constructor(
          public type: string,
          init: { detail: unknown },
        ) {
          Object.assign(this, init);
        }
      },
    );
    assert.deepEqual(seen, [["flowplan:passkey", { status }]]);
  }
  assert.match(passkeyAnswerScript("nonsense" as never), /"status":"failed"/);
  assert.match(passkeyState(new Uint8Array(24).fill(251)), /^[A-Za-z0-9_-]{32}$/);

  const posted: string[] = [];
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (m: string) => posted.push(m) } };
  window.top = window;
  new Function("window", "location", "navigator", "document", "addEventListener", "matchMedia", "requestAnimationFrame", "MutationObserver", "getComputedStyle", bridgeScript({ server, platform: "ios", version: "1.0.18" }))(
    window,
    { origin: server },
    {},
    { documentElement: { append() {}, hasAttribute: () => false }, head: { append() {} }, body: null, createElement: () => ({ textContent: "" }) },
    () => {},
    () => ({ addEventListener() {} }),
    () => 1,
    class {},
    () => ({}),
  );
  (window.FlowplanApp as { addPasskey: (url: unknown) => void }).addPasskey(`${server}/passkey-add?token=${token}`);
  const message = parsePageMessage(posted.find((m) => m.includes("addPasskey"))!);
  assert.deepEqual(message, { type: "addPasskey", url: `${server}/passkey-add?token=${token}` });
});

test("the shell and App.tsx route the callback, and iOS keeps the sheet's keychain", () => {
  const shell = readFileSync(new URL("../src/screens/Shell.tsx", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(shell, /message\.type === "addPasskey"\) void addPasskey\(message\.url\)/);
  assert.match(shell.slice(shell.indexOf("const addPasskey")), /preferEphemeralSession: false/);
  assert.match(appSource, /flowplan:\/\/passkey"\)\) return shell\.current\?\.passkeyLink\(link\)/);
});
