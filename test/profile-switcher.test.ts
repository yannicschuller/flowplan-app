import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { keyCommandsFrom } from "../src/ipad";
import { decide, navigationState } from "../src/navigation";
import { mayOpenSwitcher, SWITCHER_ACTION, SWITCHER_LINK, SWITCHER_PAUSE_MS, switcherChoice, switcherRequest, withSwitcherCommand } from "../src/profile-picker";
import { addProfile, type ProfileState } from "../src/profiles";
import { shortcutList } from "../src/android/shortcut-list";
import { t, setLocale } from "../src/i18n";

// The profile switcher: Flowplan's "Instanz wechseln …" and the long press
// on the account row (window.FlowplanApp.openProfileSwitcher), the icon's
// quick action and ⇧⌘P open the app's own sheet of its profiles. The page
// asks with nothing and hears nothing back.
const server = "https://flowplan.example.com";
const token = "tokentokentokentokentoken";

function runBridge(options: { origin?: string; top?: boolean; switcherToken?: string } = {}) {
  const posted: unknown[] = [];
  const page: Record<string, unknown> = {
    location: { origin: options.origin ?? server, pathname: "/", search: "", hash: "#home" },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(parsePageMessage(data)) },
    addEventListener: () => {},
    navigator: {},
    document: { documentElement: {}, head: { append() {} }, body: null, createElement: () => ({}), querySelector: () => null },
    getComputedStyle: () => ({ backgroundColor: "" }),
    matchMedia: () => ({ addEventListener() {} }),
    requestAnimationFrame: () => 1,
    MutationObserver: class {
      observe() {}
    },
    innerWidth: 400,
    innerHeight: 800,
  };
  page.window = page;
  page.top = options.top === false ? {} : page;
  vm.runInNewContext(bridgeScript({ server, platform: "ios", version: "1.1.0", switcherToken: options.switcherToken }), page);
  return { app: page.FlowplanApp as { openProfileSwitcher?: (...args: unknown[]) => unknown } | undefined, posted };
}

test("the bridge offers openProfileSwitcher on the instance's top frame only: no data in, nothing out, the token kept inside", () => {
  const { app, posted } = runBridge({ switcherToken: token });
  assert.equal(typeof app?.openProfileSwitcher, "function");
  // Whatever the page passes, the message carries the type and the token only.
  assert.equal(app!.openProfileSwitcher!({ profiles: "please" }, "x"), undefined);
  assert.deepEqual(posted, [{ type: "openProfileSwitcher", token }]);
  assert.equal(switcherRequest(posted[0], token), true);
  // The function's text does not show the token.
  assert.doesNotMatch(String(app!.openProfileSwitcher), new RegExp(token));
  // Another origin, a frame below the top, or a window without a token: no function.
  assert.equal(runBridge({ origin: "https://evil.example", switcherToken: token }).app, undefined);
  assert.equal(runBridge({ top: false, switcherToken: token }).app, undefined);
  assert.equal(runBridge().app?.openProfileSwitcher, undefined);
  for (const platform of ["ios", "android"] as const) assert.match(bridgeScript({ server, platform, version: "1", switcherToken: token }), /openProfileSwitcher: \(\) => \{ post\(\{ type: "openProfileSwitcher", token: switcherToken \}\); \}/);
});

test("switcherRequest: only the top frame's bridge, with its token", () => {
  assert.equal(switcherRequest({ type: "openProfileSwitcher", token }, token), true);
  // A frame posting to the app itself does not know the token.
  for (const message of [{ type: "openProfileSwitcher" }, { type: "openProfileSwitcher", token: "guess" }, { type: "openProfileSwitcher", token: 1 }, { type: "openProfiles", token }, null, "openProfileSwitcher"])
    assert.equal(switcherRequest(message, token), false, JSON.stringify(message));
  // A missing or short token of the window never matches.
  assert.equal(switcherRequest({ type: "openProfileSwitcher", token: "" }, ""), false);
  assert.equal(switcherRequest({ type: "openProfileSwitcher", token: "short" }, "short"), false);
});

test("one sheet at a time; the page's requests only in front and not right after closing", () => {
  const now = 100_000;
  const base = { open: false, front: true, closedAt: 0, now, fromPage: true };
  assert.equal(mayOpenSwitcher(base), true);
  assert.equal(mayOpenSwitcher({ ...base, open: true }), false, "one at a time");
  assert.equal(mayOpenSwitcher({ ...base, open: true, fromPage: false }), false, "one at a time, also for the app's own ways");
  assert.equal(mayOpenSwitcher({ ...base, front: false }), false, "setup, settings or the lock over the window");
  assert.equal(mayOpenSwitcher({ ...base, closedAt: now - 100 }), false, "just closed: the page cannot keep it open");
  assert.equal(mayOpenSwitcher({ ...base, closedAt: now - SWITCHER_PAUSE_MS }), true);
  assert.equal(mayOpenSwitcher({ ...base, closedAt: now + 60_000 }), true, "a clock set back blocks nothing");
  // Quick action and ⇧⌘P: at once, also over the settings.
  assert.equal(mayOpenSwitcher({ ...base, front: false, closedAt: now - 1, fromPage: false }), true);
});

test("a tap switches to another profile; the active one, or one gone meanwhile, only closes", () => {
  let state: ProfileState = { profiles: [], active: null };
  state = addProfile(state, { server: "https://a.example", name: "Work" }, "work").state;
  state = addProfile(state, { server: "https://b.example", name: "Private" }, "private").state;
  assert.equal(state.active, "private");
  assert.deepEqual(switcherChoice(state, "work"), { switchTo: "work" });
  assert.equal(switcherChoice(state, "private"), null);
  assert.equal(switcherChoice(state, "gone"), null);
});

test("⇧⌘P: the app's key command next to the page's; a page shortcut on the same keys gives way", () => {
  const page = keyCommandsFrom([
    { action: "search", title: "Search", input: "k", modifiers: ["command"] },
    { action: "palette", title: "Palette", input: "P", modifiers: ["shift", "command"] },
    { action: SWITCHER_ACTION, title: "Fake", input: "j", modifiers: ["command"] },
  ]);
  const list = withSwitcherCommand(page, "Switch profile");
  assert.deepEqual(list, [
    { action: "search", title: "Search", input: "k", modifiers: ["command"] },
    { action: SWITCHER_ACTION, title: "Switch profile", input: "p", modifiers: ["command", "shift"] },
  ]);
  // Instances without shortcuts get it as well; the list stays within 40.
  assert.equal(withSwitcherCommand([], "x").length, 1);
  const many = Array.from({ length: 40 }, (_, i) => ({ action: `a${i}`, title: `A${i}`, input: String.fromCharCode(97 + (i % 26)), modifiers: [i < 26 ? "command" : "control"] as ("command" | "control")[] }));
  const full = withSwitcherCommand(many, "x");
  assert.equal(full.length, 40);
  assert.equal(full.at(-1)?.action, SWITCHER_ACTION);
});

test("Android's shortcut opens the switcher; a page's link to it is an app link, never from a frame", () => {
  setLocale("en");
  const list = shortcutList({ signedIn: false, profile: null, recent: [] });
  assert.equal(list.find((item) => item.id === "server")?.url, SWITCHER_LINK);
  assert.deepEqual(decide(SWITCHER_LINK, { server, mainFrame: true, state: navigationState(), now: 1 }), { kind: "appLink", url: SWITCHER_LINK });
  assert.deepEqual(decide(SWITCHER_LINK, { server, mainFrame: false, state: navigationState(), now: 1 }), { kind: "block" });
});

test("the switcher's texts exist in German, English, French and Chinese", () => {
  for (const locale of ["de", "en", "fr", "zh"] as const) {
    setLocale(locale);
    for (const key of ["switchProfile", "switcherAdd", "switcherManage", "done"] as const) {
      const text = t(key);
      assert.ok(text && text !== key, `${locale} ${key}`);
    }
  }
  setLocale("de");
  assert.equal(t("switcherAdd"), "Profil hinzufügen …");
  assert.equal(t("switcherManage"), "Profile verwalten");
  setLocale("en");
});
