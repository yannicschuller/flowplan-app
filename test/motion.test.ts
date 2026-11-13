import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { animatesStatusBar, effectiveMotion, fadeDuration, modalAnimation, parseMotion, showsSpinner } from "../src/motion";

// #260: the app's own motion follows the system's "Reduce motion" always
// and the person's "Animations" in Flowplan as the page reports it.
const server = "https://flowplan.example.com";
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the system's Reduce motion always wins; the person's choice otherwise, normal until known", () => {
  assert.equal(effectiveMotion(null, false), "normal");
  assert.equal(effectiveMotion("reduced", false), "reduced");
  assert.equal(effectiveMotion("off", false), "off");
  for (const pref of [null, "normal", "reduced", "off"] as const) assert.equal(effectiveMotion(pref, true), "off", String(pref));
  assert.equal(parseMotion("reduced"), "reduced");
  for (const value of ["", "fast", null, undefined, 1]) assert.equal(parseMotion(value), null, String(value));
});

test("off: nothing animates; reduced: short fades only; normal: as before", () => {
  assert.deepEqual([modalAnimation("normal"), modalAnimation("reduced"), modalAnimation("off")], ["slide", "fade", "none"]);
  assert.deepEqual([showsSpinner("normal"), showsSpinner("reduced"), showsSpinner("off")], [true, false, false]);
  assert.equal(fadeDuration("off"), 0);
  assert.ok(fadeDuration("reduced") > 0 && fadeDuration("reduced") <= 150);
  assert.ok(fadeDuration("normal") >= fadeDuration("reduced"));
  assert.deepEqual([animatesStatusBar("normal"), animatesStatusBar("reduced"), animatesStatusBar("off")], [true, true, false]);
});

function runBridge(document: Record<string, unknown>) {
  const posted: { type: string; value?: unknown }[] = [];
  const frames: (() => void)[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  const page: Record<string, unknown> = {
    location: { origin: server, pathname: "/", search: "", hash: "" },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(parsePageMessage(data) as { type: string }) },
    addEventListener: (type: string, listener: () => void) => (listeners[type] ||= []).push(listener),
    navigator: {},
    document: { head: { append() {} }, body: null, createElement: () => ({}), elementFromPoint: () => null, ...document },
    getComputedStyle: () => ({ backgroundColor: "" }),
    matchMedia: () => ({ addEventListener() {} }),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    MutationObserver: class {
      observe() {}
    },
    innerWidth: 400,
    innerHeight: 800,
  };
  page.window = page;
  page.top = page;
  vm.runInNewContext(bridgeScript({ server, platform: "ios", version: "1.0.12" }), page);
  const flush = () => {
    while (frames.length) frames.shift()!();
    return posted.filter((message) => message.type === "motion").map((message) => message.value);
  };
  // A touch: the bridge reports once per frame.
  const touch = () => (listeners.touchend || []).forEach((listener) => listener());
  return { flush, touch };
}

const element = (attributes: Record<string, string>) => ({ getAttribute: (name: string) => attributes[name] ?? null });

test("the bridge reports data-motion where the workspace is, once per change", () => {
  const html: Record<string, string> = {};
  let shell: Record<string, string> | null = { "data-motion": "off" };
  const bridge = runBridge({
    documentElement: element(html),
    querySelector: (selector: string) => (selector === ".app-shell" ? (shell ? element(shell) : null) : null),
  });
  // The root's attribute from the first paint, before <html> has it.
  assert.deepEqual(bridge.flush(), ["off"]);
  // Nothing new: nothing sent again.
  bridge.touch();
  assert.deepEqual(bridge.flush(), ["off"]);
  // The person chose "Reduced": <html> carries it.
  html["data-motion"] = "reduced";
  bridge.touch();
  assert.deepEqual(bridge.flush(), ["off", "reduced"]);
  // Back to the default: no attribute anywhere means "normal".
  delete html["data-motion"];
  shell = {};
  bridge.touch();
  assert.deepEqual(bridge.flush(), ["off", "reduced", "normal"]);
  // Signed out (no workspace): nothing.
  shell = null;
  bridge.touch();
  assert.deepEqual(bridge.flush(), ["off", "reduced", "normal"]);
});

test("no workspace (the sign-in page), no report: the remembered choice stays", () => {
  const bridge = runBridge({ documentElement: element({ "data-motion": "off" }), querySelector: () => null });
  assert.deepEqual(bridge.flush(), []);
  assert.match(bridgeScript({ server, platform: "android", version: "1" }), /querySelector\("\.app-shell"\)/);
});

test("the app's sheets, spinners, the Connecting cover and the status bar follow it", () => {
  for (const file of readdirSync(new URL("../src/screens", import.meta.url))) {
    const text = src(`src/screens/${file}`);
    assert.doesNotMatch(text, /animationType="/, `${file}: a fixed modal animation`);
    if (/<Modal\b[^>]*animationType/.test(text)) assert.match(text, /animationType=\{modalAnimation\(motion\)\}/, file);
  }
  const connecting = src("src/screens/Connecting.tsx");
  assert.match(connecting, /showsSpinner\(motion\) \? <ActivityIndicator/);
  assert.match(connecting, /fadeDuration\(motionRef\.current\)/);
  const shell = src("src/screens/Shell.tsx");
  assert.match(shell, /<Connecting server=\{server\} visible=\{connecting && !showingCopy\} \/>/);
  assert.match(shell, /<StatusBar style=\{statusStyle\} animated=\{animatesStatusBar\(motion\)\} \/>/);
  assert.match(src("src/ui.tsx"), /const spinner = busy && showsSpinner\(motion\)/);
  // System setting and its change; the page's report per profile.
  const native = src("src/native/motion.ts");
  assert.match(native, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(native, /addEventListener\("reduceMotionChanged"/);
  const app = src("src/App.tsx");
  assert.match(app, /case "motion":\s*\n\s*reportMotion\(store\.profiles\(\)\.active, message\.value\)/);
  assert.match(app, /setMotionProfile\(profiles\.active\)/);
});

test("iOS edge swipe: the chevron only fades with reduced, appears and goes without animation with off", () => {
  const swift = src("modules/flowplan-native/ios/FlowplanNativeModule.swift");
  assert.match(swift, /Function\("setEdgeSwipeMotion"\)/);
  assert.match(swift, /static var motion = "normal"/);
  assert.match(swift, /if motion == "normal" \{ self\.indicator\?\.transform/);
  assert.match(swift, /if motion == "off" \{\s*\n\s*view\.removeFromSuperview\(\)/);
  assert.match(src("modules/flowplan-native/src/index.ts"), /native\?\.setEdgeSwipeMotion\?\.\(motion\)/);
});
