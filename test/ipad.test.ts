import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { handoffPage, handoffTarget, keyCommandsFrom, pathOn, shortcutScript } from "../src/ipad";
import { windowRegistry } from "../src/windows";
import { bridgeScript, parsePageMessage, windowsScript } from "../src/bridge-script";

const require = createRequire(import.meta.url);
const { patchSceneDelegate } = require("../plugins/with-ipad.js") as { patchSceneDelegate: (contents: string) => string };

const server = "https://flowplan.example.com";
const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";

test("the page's shortcuts become key commands: only with ⌘, ⌃ or ⌥, known keys, once each", () => {
  const commands = keyCommandsFrom([
    { action: "search", title: " Search and commands ", input: "K", modifiers: ["command"] },
    { action: "capture", title: "Quick capture", input: "n", modifiers: ["alternate", "command"] },
    // A second combination of the same action: works, not listed twice.
    { action: "shortcuts", title: "Keyboard shortcuts", input: "/", modifiers: ["command"], hidden: true },
    { action: "present", title: "Present", input: "f5", modifiers: ["shift", "control"] },
    { action: "moveUp", title: "Up", input: "up", modifiers: ["command", "shift"] },
    { action: "send", title: "Send", input: "\r", modifiers: ["command"] },
    // Typing keys stay typing keys.
    { action: "shortcuts", title: "Overview", input: "?", modifiers: [] },
    { action: "sidebar", title: "Sidebar", input: "b", modifiers: ["shift"] },
    // The same combination again, unknown modifiers, keys and actions.
    { action: "newPage", title: "New page", input: "k", modifiers: ["command"] },
    { action: "newPage", title: "New page", input: "n", modifiers: ["hyper"] },
    { action: "newPage", title: "New page", input: "enterKey", modifiers: ["command"] },
    { action: "new-page();", title: "x", input: "x", modifiers: ["command"] },
    { action: "theme", title: "", input: "t", modifiers: ["command"] },
    null,
    "search",
  ]);
  assert.deepEqual(commands, [
    { action: "search", title: "Search and commands", input: "k", modifiers: ["command"] },
    { action: "capture", title: "Quick capture", input: "n", modifiers: ["alternate", "command"] },
    { action: "shortcuts", title: "Keyboard shortcuts", input: "/", modifiers: ["command"], hidden: true },
    { action: "present", title: "Present", input: "f5", modifiers: ["control", "shift"] },
    { action: "moveUp", title: "Up", input: "up", modifiers: ["command", "shift"] },
    { action: "send", title: "Send", input: "\r", modifiers: ["command"] },
  ]);
  assert.deepEqual(keyCommandsFrom("search"), []);
  assert.equal(keyCommandsFrom(Array.from({ length: 60 }, (_, i) => ({ action: `a${i}`, title: "x", input: String.fromCharCode(97 + (i % 26)), modifiers: i < 26 ? ["command"] : i < 52 ? ["alternate"] : ["control"] }))).length, 40);
  // The page runs the action; older instances without FlowplanShortcuts do nothing.
  assert.match(shortcutScript("search"), /window\.FlowplanShortcuts/);
  assert.match(shortcutScript('x"); alert(1); ("'), /run\("x\\"\); alert\(1\); \(\\""\)/);
});

test("Handoff hands over pages of the instance and opens them only on a known instance", () => {
  assert.equal(pathOn(`${server}/#page=${PAGE}`, server), `/#page=${PAGE}`);
  assert.equal(pathOn("https://other.example/#page=1", server), null);
  assert.equal(pathOn(`${server}/#inbox`, null), null);
  assert.deepEqual(handoffPage(`${server}/#page=${PAGE}`, server, " Plan – Flowplan "), { url: `${server}/#page=${PAGE}`, title: "Plan – Flowplan" });
  assert.deepEqual(handoffPage(`${server}/`, server, undefined), { url: `${server}/`, title: "Flowplan" });
  // Endpoints, sign-in pages of the identity provider and other sites are not handed over.
  assert.equal(handoffPage(`${server}/api/auth/login`, server, "x"), null);
  assert.equal(handoffPage("https://login.example/authorize", server, "x"), null);

  const profiles = {
    profiles: [
      { id: "work", name: "Work", server },
      { id: "home", name: "Home", server: "https://notes.example" },
    ],
    active: "work",
  };
  assert.deepEqual(handoffTarget(`https://notes.example/#page=${PAGE}`, profiles), { profileId: "home", path: `/#page=${PAGE}` });
  assert.deepEqual(handoffTarget(`${server}/#tasks`, profiles), { profileId: "work", path: "/#tasks" });
  assert.equal(handoffTarget("https://unknown.example/#page=1", profiles), null);
  assert.equal(handoffTarget(`${server}/api/export`, profiles), null);
  assert.equal(handoffTarget("javascript:alert(1)", profiles), null);
  assert.equal(handoffTarget("flowplan://open?path=/", profiles), null);
});

test("the first window is the main window; the next takes over when it closes", () => {
  const windows = windowRegistry();
  let changes = 0;
  windows.subscribe(() => changes++);
  windows.add("a");
  windows.add("b");
  windows.add("b");
  assert.equal(windows.main(), "a");
  assert.equal(windows.count(), 2);
  // A window next to the main one changes nothing for it.
  assert.equal(changes, 1);
  windows.setUrl("b", `${server}/#page=${PAGE}`);
  windows.remove("a");
  assert.equal(windows.main(), "b");
  assert.equal(changes, 2);
  // It keeps its page when it becomes the main window.
  assert.equal(windows.url("b"), `${server}/#page=${PAGE}`);
  windows.remove("b");
  assert.equal(windows.main(), null);
  assert.equal(windows.url("b"), null);
});

test("the bridge offers new windows only where the app has them, and the shortcuts everywhere", () => {
  const ipad = bridgeScript({ server, platform: "ios", version: "1.0.0", windows: true });
  const phone = bridgeScript({ server, platform: "ios", version: "1.0.0" });
  assert.match(ipad, /get openWindow\(\)/);
  assert.doesNotMatch(phone, /openWindow/);
  assert.match(phone, /shortcuts: \(list\) => post\(\{ type: "shortcuts"/);
  assert.deepEqual(parsePageMessage(JSON.stringify({ type: "openWindow", url: `${server}/#inbox` })), { type: "openWindow", url: `${server}/#inbox` });
});

// The bridge in a minimal page: FlowplanApp and what the page posts.
function runBridge(script: string) {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const posted: unknown[] = [];
  const page: Record<string, unknown> = {
    location: { origin: server },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, [...(listeners.get(type) || []), listener]),
    dispatchEvent: (event: { type: string }) => (listeners.get(event.type) || []).forEach((listener) => listener(event)),
    CustomEvent: class {
      constructor(
        public type: string,
        init: { detail: unknown },
        public detail = init.detail,
      ) {}
    },
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
  page.top = page;
  vm.runInNewContext(script, page);
  return { app: page.FlowplanApp as Record<string, unknown>, posted, run: (code: string) => vm.runInNewContext(code, page) };
}

test("new windows: offered while the window can open one (iPad, the open iPhone Duo), not on the closed one", () => {
  const { app, posted, run } = runBridge(bridgeScript({ server, platform: "ios", version: "1.0.0", windows: true }));
  // Until the app says so (after loading), the page has no "Open in new window".
  assert.equal(app.openWindow, undefined);
  run(windowsScript(true));
  assert.equal(typeof app.openWindow, "function");
  (app.openWindow as unknown as (url: string) => void)(`${server}/#inbox`);
  assert.deepEqual(posted.at(-1), { type: "openWindow", url: `${server}/#inbox` });
  // Closed: the menu item goes away again.
  run(windowsScript(false));
  assert.equal(app.openWindow, undefined);
  assert.ok(Object.isFrozen(app));
  // Without windows (Android, a build without scenes) there is none at all.
  const phone = runBridge(bridgeScript({ server, platform: "ios", version: "1.0.0" }));
  phone.run(windowsScript(true));
  assert.equal(phone.app.openWindow, undefined);
  assert.equal(typeof phone.app.shortcuts, "function");
});

test("the scene delegate gives every window its id and page", () => {
  const template = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;
  const patched = patchSceneDelegate(template);
  assert.match(patched, /^internal import Expo\nimport UIKit\n/);
  assert.match(patched, /override var initialProperties/);
  assert.match(patched, /super\.scene\(scene, willConnectTo: session, options: connectionOptions\)/);
  assert.match(patched, /@objc\(stateRestorationActivityForScene:\)/);
  // A quick action that starts the app reaches the main window (scenes get it, not the launch options).
  assert.match(patched, /if let item = connectionOptions\.shortcutItem \{/);
  assert.match(patched, /window\["shortcut"\] = shortcut/);
  // The extension point stays for other plugins; a second run changes nothing.
  assert.match(patched, /\/\/ Extension point for config plugins\./);
  assert.equal(patchSceneDelegate(patched), patched);
  assert.throws(() => patchSceneDelegate("class SceneDelegate {}"), /not Expo's template/);
});
