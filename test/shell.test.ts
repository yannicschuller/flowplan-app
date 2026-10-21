import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appLink, decide, loadStarted, mayStay, navigationState, pageRendered, pathOfAppLink, safePath, SIGN_IN_WINDOW_MS, type NavigationState } from "../src/navigation";
import { acceptSignIn, base64Url, PendingSignIns, redeemScript, signInUrl } from "../src/sign-in";
import { buildNumber } from "../src/version";
import { bridgeScript, downloadScript, parsePageMessage, pencilScript, registerScript, signOutScript, unregisterScript } from "../src/bridge-script";

const server = "https://flowplan.example.com";
const nav = (url: string, extra: Partial<Parameters<typeof decide>[1]> = {}, state: NavigationState = navigationState()) =>
  decide(url, { server, mainFrame: true, state, now: 1000, ...extra });

test("pages of the instance stay in the app, other sites go to the system", () => {
  assert.deepEqual(nav(`${server}/#inbox`), { kind: "allow" });
  assert.deepEqual(nav("https://github.com/x"), { kind: "external", url: "https://github.com/x" });
  assert.deepEqual(nav("mailto:a@example.com"), { kind: "external", url: "mailto:a@example.com" });
  assert.deepEqual(nav("tel:+49301234"), { kind: "external", url: "tel:+49301234" });
  // Another port or scheme is another site.
  assert.equal(nav("https://flowplan.example.com:8443/").kind, "external");
  assert.equal(nav("http://flowplan.example.com/").kind, "external");
  // Embedded content stays in the page; foreign schemes in frames do nothing.
  assert.deepEqual(nav("https://www.youtube-nocookie.com/embed/x", { mainFrame: false }), { kind: "allow" });
  assert.deepEqual(nav("intent://x", { mainFrame: false }), { kind: "block" });
  assert.deepEqual(nav("about:blank"), { kind: "allow" });
  assert.deepEqual(nav("blob:https://flowplan.example.com/1"), { kind: "allow" });
  // target=_blank on the instance opens in the app's window.
  assert.deepEqual(nav(`${server}/share/x`, { newWindow: true }), { kind: "open", url: `${server}/share/x` });
  assert.equal(nav("https://example.org", { newWindow: true }).kind, "external");
  assert.deepEqual(nav("flowplan://sign-in?x"), { kind: "appLink", url: "flowplan://sign-in?x" });
});

test("passkey and SSO sign-in leave the web view; sign-in in the window may pass the identity provider", () => {
  assert.deepEqual(nav(`${server}/api/auth/desktop`), { kind: "signIn", via: null });
  assert.deepEqual(nav(`${server}/api/auth/desktop?via=sso`), { kind: "signIn", via: "sso" });
  // In a frame it is just a page.
  assert.deepEqual(nav(`${server}/api/auth/desktop`, { mainFrame: false }), { kind: "allow" });
  const state = navigationState();
  nav(`${server}/api/auth/login?returnTo=%2F`, {}, state);
  assert.equal(state.signingInUntil, 1000 + SIGN_IN_WINDOW_MS);
  // The instance redirects to the provider, which may redirect on (another
  // of its hosts) before a page renders.
  assert.deepEqual(nav("https://login.microsoftonline.com/x", {}, state), { kind: "allow" });
  assert.deepEqual(nav("https://login.live.com/y", {}, state), { kind: "allow" });
  assert.deepEqual([...state.identityHosts], ["login.microsoftonline.com", "login.live.com"]);
  pageRendered(state);
  // Links on the provider's page to other sites go to the system; its own
  // pages stay, and what they redirect to as well.
  assert.deepEqual(nav("https://evil.example/", {}, state), { kind: "external", url: "https://evil.example/" });
  assert.deepEqual(nav("https://login.live.com/mfa", {}, state), { kind: "allow" });
  assert.deepEqual(nav("https://device.login.example/", {}, state), { kind: "allow" });
  pageRendered(state);
  // Android: a form POST is not asked about, but its load is; its redirects count.
  assert.equal(nav("https://sso.example/", {}, state).kind, "external");
  loadStarted(state, "https://login.live.com/post", server, 1000);
  assert.deepEqual(nav("https://sso.example/", {}, state), { kind: "allow" });
  pageRendered(state);
  // A page that arrived without being asked about (Android POST) may stay
  // only when it is the instance or a known identity host.
  assert.equal(mayStay(`${server}/x`, server, state, 1000), true);
  assert.equal(mayStay("https://login.live.com/post", server, state, 1000), true);
  assert.equal(mayStay("https://evil.example/", server, state, 1000), false);
  assert.equal(mayStay("about:blank", server, state, 1000), true);
  assert.equal(mayStay("https://login.live.com/post", server, state, 1000 + SIGN_IN_WINDOW_MS), false);
  // Three minutes later the window has closed.
  assert.equal(nav("https://login.live.com/x", { now: 1000 + SIGN_IN_WINDOW_MS }, state).kind, "external");
  // Back on the instance the window closes and the hosts are forgotten.
  nav(`${server}/api/auth/callback?code=1`, {}, state);
  assert.ok(state.signingInUntil > 1000);
  nav(`${server}/`, {}, state);
  assert.equal(state.signingInUntil, 0);
  assert.equal(state.identityHosts.size, 0);
  assert.equal(nav("https://login.microsoftonline.com/x", {}, state).kind, "external");
  loadStarted(state, `${server}/x`, server, 1000);
  assert.equal(state.redirecting, false);
  // Other endpoints under /api/auth/ (logout, verify, …) open no window.
  for (const path of ["/api/auth/logout", "/api/auth/verify?token=x", "/api/auth/password", "/api/auth/login-help"]) {
    nav(`${server}${path}`, {}, state);
    assert.equal(state.signingInUntil, 0, path);
    assert.equal(nav("https://login.microsoftonline.com/x", {}, state).kind, "external", path);
  }
  // Without a redirect from the instance no foreign site is allowed, even in the window.
  const fresh = navigationState();
  nav(`${server}/api/auth/login`, {}, fresh);
  pageRendered(fresh);
  assert.equal(nav("https://evil.example/", {}, fresh).kind, "external");
  // Frames and new windows are not part of the sign-in.
  nav(`${server}/api/auth/login`, {}, fresh);
  assert.equal(nav("https://evil.example/", { newWindow: true }, fresh).kind, "external");
  assert.equal(fresh.identityHosts.size, 0);
});

test("app links only ever open paths of the instance", () => {
  assert.equal(pathOfAppLink(appLink("/#inbox")), "/#inbox");
  assert.equal(pathOfAppLink(appLink("/#page=1&row=2")), "/#page=1&row=2");
  assert.equal(pathOfAppLink("flowplan://open?path=//evil.example/"), null);
  assert.equal(pathOfAppLink("flowplan://open?path=https://evil.example/"), null);
  assert.equal(pathOfAppLink("flowplan://elsewhere?path=/"), null);
  assert.equal(pathOfAppLink("https://open?path=/"), null);
  assert.equal(safePath("/\\evil"), null);
  assert.equal(safePath("/ok"), "/ok");
});

test("only a sign-in this app started, for its instance, is redeemed – once", () => {
  const pending = new PendingSignIns();
  const verifier = base64Url(new Uint8Array(32).fill(7));
  const challenge = base64Url(new Uint8Array(createHash("sha256").update(verifier).digest()));
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(signInUrl(server, challenge, "sso"), `${server}/api/auth/desktop?challenge=${challenge}&via=sso`);
  assert.equal(signInUrl(server, challenge, "other"), `${server}/api/auth/desktop?challenge=${challenge}`);
  pending.add(challenge, verifier, 0);
  const link = (s: string, c: string, code = "abc") =>
    `flowplan://sign-in?${new URLSearchParams({ server: s, challenge: c, code })}`;
  assert.deepEqual(acceptSignIn(link("https://evil.example", challenge), server, pending, 1), { error: "foreign" });
  assert.deepEqual(acceptSignIn(link(server, "unknown"), server, pending, 1), { error: "foreign" });
  assert.equal(acceptSignIn("flowplan://open?path=/", server, pending, 1), null);
  // The foreign attempts above did not use up the real one.
  pending.add(challenge, verifier, 0);
  assert.deepEqual(acceptSignIn(link(server, challenge), server, pending, 1), { code: "abc", verifier });
  // The same link a second time (Android delivers it twice) is ignored quietly.
  assert.equal(acceptSignIn(link(server, challenge), server, pending, 2), null);
  // Ten minutes later a code is too late.
  const late = base64Url(new Uint8Array(32).fill(9));
  pending.add(late, verifier, 0);
  assert.deepEqual(acceptSignIn(link(server, late), server, pending, 10 * 60_000), { error: "foreign" });
  // The script quotes what it embeds.
  const script = redeemScript('a"b', "v</script>", "Failed", "Again");
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /"code":"a\\"b"/);
});

test("version and build number", () => {
  assert.equal(buildNumber("1.2.3"), 1020300);
  assert.equal(buildNumber("1.2.3", "1"), 1020301);
  assert.equal(buildNumber("0.9.0", 0), 90000);
  assert.throws(() => buildNumber("1.2"));
  assert.throws(() => buildNumber("1.2.3", 100));
  assert.throws(() => buildNumber("1.100.0"));
});

test("the page scripts are valid and stay on the instance", () => {
  for (const platform of ["ios", "android"] as const) {
    const script = bridgeScript({ server, platform, version: "1.0.0" });
    assert.doesNotThrow(() => new Function(script));
    assert.ok(script.includes(`location.origin !== ${JSON.stringify(server)}`));
    assert.equal(script.includes("font-size:max(16px"), platform === "ios");
  }
  for (const script of [registerScript({ installationId: "x", pushToken: null }), unregisterScript("x"), downloadScript(`${server}/api/files/1?x="y"`)])
    assert.doesNotThrow(() => new Function(script));
  assert.doesNotThrow(() => new Function(signOutScript));
  // Apple Pencil: the page gets a "flowplan:pencil" event with the action.
  const events: { type: string; detail: unknown }[] = [];
  new Function("window", "CustomEvent", pencilScript({ gesture: "squeeze", preferred: "switchEraser" }))(
    { dispatchEvent: (e: { type: string; detail: unknown }) => events.push({ type: e.type, detail: e.detail }) },
    class {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  );
  assert.deepEqual(events, [{ type: "flowplan:pencil", detail: { gesture: "squeeze", preferred: "switchEraser" } }]);
  assert.deepEqual(parsePageMessage('{"type":"refresh"}'), { type: "refresh" });
  assert.equal(parsePageMessage("nonsense"), null);
  assert.equal(parsePageMessage("{}"), null);
});
