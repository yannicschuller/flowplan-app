// "Back" in the window on the instance (src/back.ts, backScript): the page
// decides when it can, the history only for older instances and foreign
// pages, and the start page leaves back to the system.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import { afterAnswer, backAction, parseBackProgress, previewsBack, type BackState } from "../src/back";
import { backProgressScript, backScript, bridgeScript, parsePageMessage } from "../src/bridge-script";

const state = (extra: Partial<BackState> = {}): BackState => ({ offline: false, onServer: true, pageCanGoBack: null, historyCanGoBack: false, ...extra });

test("the page decides when it reports; the history only without it", () => {
  assert.equal(backAction(state({ pageCanGoBack: true })), "page");
  // The start page with nothing open: back is the system's, even when the
  // history has entries (sign-in redirects, replaced filters).
  assert.equal(backAction(state({ pageCanGoBack: false, historyCanGoBack: true })), "system");
  // An instance from before window.FlowplanNavigation, or its sign-in page.
  assert.equal(backAction(state({ historyCanGoBack: true })), "history");
  assert.equal(backAction(state()), "system");
  // The identity provider's page during a sign-in: its history.
  assert.equal(backAction(state({ onServer: false, pageCanGoBack: true, historyCanGoBack: true })), "history");
  assert.equal(backAction(state({ offline: true, pageCanGoBack: true, historyCanGoBack: true })), "system");
});

test("what follows the page's answer", () => {
  assert.equal(afterAnswer(true, true), "done");
  assert.equal(afterAnswer(null, true), "history");
  assert.equal(afterAnswer(null, false), "system");
  assert.equal(afterAnswer(false, true), "system");
});

const run = (script: string, window: Record<string, unknown>) => {
  const posted: unknown[] = [];
  window.ReactNativeWebView = { postMessage: (data: string) => posted.push(parsePageMessage(data)) };
  new Function("window", script)(window);
  return posted;
};

test("backScript asks the page and reports its answer", () => {
  let backs = 0;
  assert.deepEqual(run(backScript, { FlowplanNavigation: { back: () => (++backs, true) } }), [{ type: "back", handled: true }]);
  assert.equal(backs, 1);
  assert.deepEqual(run(backScript, { FlowplanNavigation: { back: () => false } }), [{ type: "back", handled: false }]);
  assert.deepEqual(run(backScript, { FlowplanNavigation: { back: () => { throw new Error("x"); } } }), [{ type: "back", handled: false }]);
  // Older instances: no answer, the app uses the history.
  assert.deepEqual(run(backScript, {}), [{ type: "back", handled: null }]);
});

test("the page reports whether back does something through FlowplanApp.backState", () => {
  const script = bridgeScript({ server: "https://flowplan.example.com", platform: "ios", version: "1.0.0" });
  const posted: unknown[] = [];
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) } };
  window.top = window;
  // Only the part up to FlowplanApp matters here; the rest needs a document.
  const head = script.slice(0, script.indexOf("// Vibrations")) + "})();";
  new Function("window", "location", "navigator", head)(window, { origin: "https://flowplan.example.com" }, {});
  (window.FlowplanApp as { backState: (value: unknown) => void }).backState(true);
  (window.FlowplanApp as { backState: (value: unknown) => void }).backState("yes");
  assert.deepEqual(posted, [{ type: "backState", canGoBack: true }, { type: "backState", canGoBack: false }]);
});

test("the predictive back gesture's events are checked before they reach the page", () => {
  assert.deepEqual(parseBackProgress({ phase: "start", progress: 0, edge: "left" }), { phase: "start", progress: 0, edge: "left" });
  assert.deepEqual(parseBackProgress({ phase: "progress", progress: 0.4567, edge: "right" }), { phase: "progress", progress: 0.457, edge: "right" });
  // Out of range and odd values are clamped or fall back.
  assert.deepEqual(parseBackProgress({ phase: "progress", progress: 3, edge: "top" }), { phase: "progress", progress: 1, edge: "left" });
  assert.deepEqual(parseBackProgress({ phase: "commit", progress: Number.NaN }), { phase: "commit", progress: 0, edge: "left" });
  assert.equal(parseBackProgress({ phase: "jump", progress: 0.5 }), null);
  assert.equal(parseBackProgress(null), null);
  assert.equal(parseBackProgress("start"), null);
});

test("only the page's own step back is previewed", () => {
  assert.equal(previewsBack(state({ pageCanGoBack: true })), true);
  // Older instances go back in the history: nothing to preview.
  assert.equal(previewsBack(state({ historyCanGoBack: true })), false);
  assert.equal(previewsBack(state({ pageCanGoBack: false })), false);
  assert.equal(previewsBack(state({ offline: true, pageCanGoBack: true })), false);
});

test("backProgressScript hands the gesture to FlowplanNavigation.backProgress", () => {
  const calls: unknown[][] = [];
  const window: Record<string, unknown> = { FlowplanNavigation: { backProgress: (...args: unknown[]) => calls.push(args) } };
  new Function("window", backProgressScript({ phase: "progress", progress: 0.5, edge: "right" }))(window);
  assert.deepEqual(calls, [["progress", 0.5, "right"]]);
  // A page that throws or has no backProgress (older instances) is left alone.
  new Function("window", backProgressScript({ phase: "start", progress: 0, edge: "left" }))({ FlowplanNavigation: { backProgress: () => { throw new Error("x"); } } });
  new Function("window", backProgressScript({ phase: "start", progress: 0, edge: "left" }))({});
  // Values are data, never code.
  const odd: unknown[][] = [];
  let ran = false;
  new Function("window", "mark", backProgressScript({ phase: '"); mark(); ("', progress: Number.NaN, edge: "</script>" }))(
    { FlowplanNavigation: { backProgress: (...args: unknown[]) => odd.push(args) } },
    () => (ran = true),
  );
  assert.equal(ran, false);
  assert.deepEqual(odd, [['"); mark(); ("', 0, "left"]]);
});

test("Android: predictive back is switched on and the module reports the gesture", () => {
  assert.equal((config as { android?: { predictiveBackGestureEnabled?: boolean } }).android?.predictiveBackGestureEnabled, true);
  const kotlin = readFileSync(join(__dirname, "../modules/flowplan-android/android/src/main/java/app/flowplan/androidshell/FlowplanAndroidModule.kt"), "utf8");
  for (const name of ["handleOnBackStarted", "handleOnBackProgressed", "handleOnBackCancelled", "handleOnBackPressed", '"onBackProgress"', 'Function("setPredictiveBack")']) assert.ok(kotlin.includes(name), name);
  for (const phase of ["start", "progress", "cancel", "commit"]) assert.ok(kotlin.includes(`sendBack("${phase}"`), phase);
  assert.match(readFileSync(join(__dirname, "../modules/flowplan-android/android/build.gradle"), "utf8"), /androidx\.activity:activity:1\.(9|1\d)/);
});
