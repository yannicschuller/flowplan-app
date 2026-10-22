// "Back" in the window on the instance (src/back.ts, backScript): the page
// decides when it can, the history only for older instances and foreign
// pages, and the start page leaves back to the system.
import { test } from "node:test";
import assert from "node:assert/strict";
import { afterAnswer, backAction, type BackState } from "../src/back";
import { backScript, bridgeScript, parsePageMessage } from "../src/bridge-script";

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
