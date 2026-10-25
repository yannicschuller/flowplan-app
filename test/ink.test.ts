// Handwriting recognition for the page's ink: the bridge's recognizeInk,
// the app's checks (src/ink-bridge.ts), the answer handed back, the native
// module's wiring (modules/flowplan-ink).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { INK_LIMITS, inkFailure, inkId, inkRequest, InkRuns, inkScript, safeJson } from "../src/ink-bridge";
import { inkPayload, inkResult } from "../modules/flowplan-ink/src/ink";

const root = join(__dirname, "..");
const server = "https://flowplan.example.com";
const read = (path: string) => readFileSync(join(root, path), "utf8");

class FakeEvent {
  type: string;
  detail: unknown;
  constructor(type: string, init: { detail: unknown }) {
    this.type = type;
    this.detail = init.detail;
  }
}

// Runs the bridge script in a minimal page; returns its FlowplanApp and what
// it posted.
function page(options: { inkRecognition?: boolean }) {
  const posted: unknown[] = [];
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) } };
  window.top = window;
  const script = bridgeScript({ server, platform: "android", version: "1", ...options });
  new Function("window", "location", "navigator", "document", "addEventListener", "matchMedia", "requestAnimationFrame", "MutationObserver", "getComputedStyle", script)(
    window,
    { origin: server },
    {},
    { documentElement: {}, body: null },
    () => {},
    () => ({ addEventListener() {} }),
    () => 1,
    class {},
    () => ({}),
  );
  return { app: window.FlowplanApp as Record<string, unknown>, posted };
}

test("the bridge offers recognizeInk only where the app can recognise", () => {
  assert.doesNotMatch(bridgeScript({ server, platform: "ios", version: "1" }), /recognizeInk/);
  assert.doesNotMatch(bridgeScript({ server, platform: "ios", version: "1", scanner: true, windows: true }), /recognizeInk/);
  for (const options of [{}, { inkRecognition: true }, { inkRecognition: true, windows: true, scanner: true }])
    assert.doesNotThrow(() => new Function(bridgeScript({ server, platform: "ios", version: "1", ...options })));
  assert.equal(page({}).app.recognizeInk, undefined);
  assert.equal(typeof page({ inkRecognition: true }).app.recognizeInk, "function");
});

test("recognizeInk posts finite points only, rounded, within the limits", () => {
  const { app, posted } = page({ inkRecognition: true });
  const recognize = app.recognizeInk as (request: unknown) => void;
  recognize({
    id: "ink-1",
    width: 800,
    height: "600",
    strokes: [
      { points: [[1.23456, 2], [NaN, 1], [Infinity, 2], null, [3, null], ["4", 5], 7, [10, 20, 30]] },
      { points: [] },
      { nothing: true },
      null,
      { points: [[0, 0]] },
    ],
  });
  assert.deepEqual(posted, [
    { type: "recognizeInk", id: "ink-1", width: 800, height: 600, strokes: [{ points: [[1.23, 2], [10, 20]] }, { points: [[0, 0]] }] },
  ]);
  posted.length = 0;
  recognize(null);
  assert.deepEqual(posted, [{ type: "recognizeInk", id: "", width: null, height: null, strokes: [] }]);
  posted.length = 0;
  // 6000 strokes of 50 points: 4000 strokes reach the 200000 points.
  recognize({ id: "big", width: 10, height: 10, strokes: Array.from({ length: 6000 }, () => ({ points: Array.from({ length: 50 }, () => [1, 1]) })) });
  const big = posted[0] as { strokes: { points: unknown[] }[] };
  assert.equal(big.strokes.length, 4000);
  assert.equal(big.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0), 200_000);
  posted.length = 0;
  recognize({ id: "many", width: 10, height: 10, strokes: Array.from({ length: 6000 }, () => ({ points: [[1, 1]] })) });
  assert.equal((posted[0] as { strokes: unknown[] }).strokes.length, 5000);
});

test("parsePageMessage takes ink requests with an id; the app checks and clamps the rest", () => {
  const message = { type: "recognizeInk", id: "a", width: 100, height: 50, strokes: [{ points: [[1, 2]] }] };
  assert.deepEqual(parsePageMessage(JSON.stringify(message)), message);
  assert.equal(parsePageMessage(JSON.stringify({ ...message, id: 5 })), null);
  assert.equal(parsePageMessage(JSON.stringify({ type: "recognizeInk" })), null);
  assert.equal(parsePageMessage("null"), null);

  assert.deepEqual(inkRequest(message), { id: "a", width: 100, height: 50, strokes: [{ points: [[1, 2]] }] });
  // Points stay on the canvas; the canvas is 1…20000 points.
  assert.deepEqual(inkRequest({ ...message, width: 0.2, height: 1e9, strokes: [{ points: [[-5, 3e9], [7, 8]] }] }), {
    id: "a",
    width: 1,
    height: 20_000,
    strokes: [{ points: [[0, 20_000], [1, 8]] }],
  });
  // Unusable points and strokes are left out.
  assert.deepEqual(inkRequest({ ...message, strokes: [{ points: [[1], ["1", 2], [null, 2], [1, 2, 3]] }, { points: "x" }, 5] })?.strokes, [{ points: [[1, 2]] }]);
  for (const bad of [
    { ...message, id: "" },
    { ...message, id: "x".repeat(101) },
    { ...message, id: 1 },
    { ...message, width: Number.NaN },
    { ...message, height: null },
    { ...message, width: "100" },
    { ...message, strokes: {} },
  ])
    assert.equal(inkRequest(bad as never), null, JSON.stringify(bad));
  assert.equal(inkId({ id: "x".repeat(100) }), "x".repeat(100));
  assert.equal(inkId({ id: "x".repeat(101) }), null);
  // At most 5000 strokes and 200000 points.
  const many = inkRequest({ ...message, strokes: Array.from({ length: 6000 }, () => ({ points: [[1, 1]] })) });
  assert.equal(many?.strokes.length, INK_LIMITS.strokes);
  const long = inkRequest({ ...message, strokes: Array.from({ length: 3 }, () => ({ points: Array.from({ length: 90_000 }, () => [1, 1]) })) });
  assert.deepEqual(
    long?.strokes.map((stroke) => stroke.points.length),
    [90_000, 90_000, 20_000],
  );
});

test("the answer reaches the page as data, whatever the text holds", () => {
  const events: { type: string; detail: unknown }[] = [];
  const dispatch = (script: string) =>
    new Function("window", "CustomEvent", script)({ dispatchEvent: (event: FakeEvent) => events.push({ type: event.type, detail: event.detail }) }, FakeEvent);
  const tricky = `"); alert(1); ("</script><script>alert(2)</script>\u2028\u2029 Grüße 漢字 😀 \\ '`;
  const detail = { id: 'i"d</script>', text: tricky, lines: [{ text: tricky, box: [1, 2, 3, 4] as [number, number, number, number] }] };
  const script = inkScript(detail);
  assert.doesNotMatch(script, /<\/script>/i);
  assert.doesNotMatch(script, /[\u2028\u2029<>]/);
  dispatch(script);
  assert.deepEqual(events, [{ type: "flowplan:ink-recognized", detail }]);
  events.length = 0;
  dispatch(inkScript(inkFailure("x", "unavailable")));
  dispatch(inkScript(inkFailure("y", "failed")));
  dispatch(inkScript({ ...inkFailure("z", "failed"), error: "<b>" as never }));
  assert.deepEqual(
    events.map((event) => event.detail),
    [
      { id: "x", text: "", lines: [], error: "unavailable" },
      { id: "y", text: "", lines: [], error: "failed" },
      { id: "z", text: "", lines: [], error: "failed" },
    ],
  );
  assert.equal(JSON.parse(safeJson({ a: "<&>\u2028" })).a, "<&>\u2028");
});

test("a newer request for the same id replaces the older one; at most 16 at once", () => {
  const runs = new InkRuns(2);
  const first = runs.start("a")!;
  const second = runs.start("a")!;
  assert.equal(runs.finish("a", first), false);
  assert.equal(runs.finish("a", second), true);
  assert.equal(runs.finish("a", second), false);
  const b = runs.start("b")!;
  const c = runs.start("c")!;
  assert.equal(runs.start("d"), null);
  // The same id may always ask again.
  assert.ok(runs.start("b"));
  assert.equal(runs.finish("b", b), false);
  assert.equal(runs.finish("c", c), true);
  assert.ok(runs.start("d"));
  assert.equal(new InkRuns().pending, 0);
});

test("strokes go flat to the native side; lines come back in reading order", () => {
  assert.equal(
    inkPayload({ id: "a", width: 10, height: 20, strokes: [{ points: [[1, 2], [3, 4]] }, { points: [[5, 6]] }] }),
    '{"id":"a","width":10,"height":20,"strokes":[[1,2,3,4],[5,6]]}',
  );
  const result = inkResult({
    lines: [
      { text: "rechts", box: [300, 104, 80, 30] },
      { text: " zweite Zeile ", box: [10, 160.04, 200, 30] },
      { text: "links", box: [10, 100, 80, 30] },
      { text: "", box: [0, 0, 1, 1] },
      { text: "kaputt", box: [0, 0, 1] },
      { text: "NaN", box: [0, Number.NaN, 1, 1] },
      null,
      { text: "oben", box: [50, 20, 100, -3] },
    ],
  });
  assert.equal(result.text, "oben\nlinks\nrechts\nzweite Zeile");
  assert.deepEqual(result.lines[0], { text: "oben", box: [50, 20, 100, 0] });
  assert.deepEqual(result.lines[3].box, [10, 160, 200, 30]);
  assert.deepEqual(inkResult(null), { text: "", lines: [] });
  assert.deepEqual(inkResult({ lines: "x" }), { text: "", lines: [] });
});

test("the native module is autolinked for iOS and matches its JavaScript side", () => {
  const config = JSON.parse(read("modules/flowplan-ink/expo-module.config.json"));
  assert.deepEqual(config, { platforms: ["apple"], apple: { modules: ["FlowplanInkModule"] } });
  const resolved = JSON.parse(
    execFileSync(process.execPath, [require.resolve("expo/bin/autolinking"), "resolve", "--platform", "apple", "--json"], { cwd: root, encoding: "utf8" }),
  ) as { modules: { packageName: string; pods: { podName: string; podspecDir: string }[]; modules: { class: string }[] }[] };
  const ink = resolved.modules.find((module) => module.packageName === "flowplan-ink");
  assert.ok(ink, "flowplan-ink is not autolinked");
  assert.deepEqual(ink!.pods.map((pod) => pod.podName), ["FlowplanInk"]);
  assert.ok(ink!.pods[0].podspecDir.endsWith(join("modules", "flowplan-ink", "ios")));
  assert.deepEqual(ink!.modules.map((module) => module.class), ["FlowplanInkModule"]);

  const podspec = read("modules/flowplan-ink/ios/FlowplanInk.podspec");
  assert.match(podspec, /s\.name\s+= 'FlowplanInk'/);
  assert.match(podspec, /:ios => '16\.4'/);
  assert.match(podspec, /'Vision'/);
  const module = read("modules/flowplan-ink/ios/FlowplanInkModule.swift");
  const recognizer = read("modules/flowplan-ink/ios/FlowplanInkRecognizer.swift");
  assert.match(module, /public class FlowplanInkModule: Module \{/);
  assert.match(module, /Name\("FlowplanInk"\)/);
  assert.match(module, /Function\("isAvailable"\)/);
  assert.match(module, /AsyncFunction\("recognize"\) \{ \(json: String, promise: Promise\)/);
  const js = read("modules/flowplan-ink/src/index.ts");
  assert.match(js, /requireOptionalNativeModule<NativeModule>\("FlowplanInk"\)/);
  assert.match(js, /Platform\.OS === "ios"/);
  // The same limits on both sides.
  assert.match(recognizer, /maxStrokes = 5000\b/);
  assert.match(recognizer, /maxPoints = 200_000\b/);
  assert.match(recognizer, /maxSize: CGFloat = 20_000\b/);
  assert.match(recognizer, /id\.count <= 100\b/);
  assert.deepEqual(INK_LIMITS, { strokes: 5000, points: 200_000, size: 20_000, id: 100 });
  // Vision as asked: accurate, language correction, detected languages,
  // German, English and French where supported; the box flipped to top left.
  for (const part of [
    "recognitionLevel = .accurate",
    "usesLanguageCorrection = true",
    "automaticallyDetectsLanguage = true",
    "supportedRecognitionLanguages()",
    '["de-DE", "en-US", "fr-FR"]',
    "(1 - box.maxY)",
    "DispatchQueue(label:",
  ])
    assert.ok(recognizer.includes(part), part);
  // The window offers it only when the module says so.
  const shell = read("src/screens/Shell.tsx");
  assert.match(shell, /const inkRecognition = inkRecognitionAvailable\(\);/);
  assert.match(shell, /windows: features\.windows,\s*inkRecognition,/);
  assert.match(shell, /message\.type === "recognizeInk"\) handleInk\(message\)/);
});
