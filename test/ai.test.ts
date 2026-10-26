// On-device AI for the page: the bridge's window.FlowplanApp.ai, the app's
// checks (src/ai-bridge.ts), the answers handed back, what goes to and
// comes from the native module (modules/flowplan-ai), and its wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { aiCall, aiFailure, aiScript } from "../src/ai-bridge";
import { AI_LIMITS, aiAvailability, aiErrorCode, aiPayload, aiRequest, aiResult, aiSchema } from "../modules/flowplan-ai/src/ai";

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

type Ai = {
  version: number;
  availability(): Promise<unknown>;
  generate(request: unknown): Promise<unknown>;
  stream(request: unknown, onChunk: (text: string) => void): Promise<unknown>;
  cancel(id: unknown): void;
};

// Runs the bridge script in a minimal page with real event listeners;
// answer() runs an app script (aiScript) in it.
function page(options: { ai?: boolean; platform?: "ios" | "android" }) {
  const posted: Record<string, unknown>[] = [];
  const listeners = new Map<string, ((event: FakeEvent) => void)[]>();
  const addEventListener = (type: string, listener: (event: FakeEvent) => void) => listeners.set(type, [...(listeners.get(type) || []), listener]);
  const window: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
    dispatchEvent: (event: FakeEvent) => (listeners.get(event.type) || []).forEach((listener) => listener(event)),
  };
  window.top = window;
  const script = bridgeScript({ server, platform: options.platform || "ios", version: "1", ...options });
  const style = { textContent: "" };
  new Function("window", "location", "navigator", "document", "addEventListener", "matchMedia", "requestAnimationFrame", "MutationObserver", "getComputedStyle", script)(
    window,
    { origin: server },
    {},
    { documentElement: { append() {} }, head: { append() {} }, body: null, createElement: () => style },
    addEventListener,
    () => ({ addEventListener() {} }),
    () => 1,
    class {},
    () => ({}),
  );
  const answer = (script: string) => new Function("window", "CustomEvent", script)(window, FakeEvent);
  return { app: window.FlowplanApp as Record<string, unknown>, posted, answer };
}

test("the bridge offers ai only where the app has the module", () => {
  assert.doesNotMatch(bridgeScript({ server, platform: "ios", version: "1" }), /flowplan:ai/);
  for (const options of [{}, { ai: true }, { ai: true, inkRecognition: true, windows: true, scanner: true, offline: true }])
    assert.doesNotThrow(() => new Function(bridgeScript({ server, platform: "ios", version: "1", ...options })));
  assert.equal(page({}).app.ai, undefined);
  const ai = page({ ai: true }).app.ai as Ai;
  assert.equal(ai.version, 1);
  assert.ok(Object.isFrozen(ai));
  for (const name of ["availability", "generate", "stream", "cancel"]) assert.equal(typeof (ai as Record<string, unknown>)[name], "function");
  // Another origin or a frame gets nothing at all.
  const script = bridgeScript({ server, platform: "ios", version: "1", ai: true });
  assert.match(script, /window\.top !== window \|\| location\.origin !== "https:\/\/flowplan\.example\.com"/);
});

test("generate, stream and availability post a call and settle on the app's answer", async () => {
  const { app, posted, answer } = page({ ai: true });
  const ai = app.ai as Ai;

  const available = ai.availability();
  assert.deepEqual(posted[0], { type: "ai", op: "availability", id: "#a1" });
  answer(aiScript({ id: "#a1", kind: "done", result: { available: false, reason: "apple-intelligence-off" } }));
  assert.deepEqual(await available, { available: false, reason: "apple-intelligence-off" });

  const generated = ai.generate({ id: "g1", prompt: "Hallo", schema: { type: "object", properties: { a: { type: "string" } } }, temperature: 0.2 });
  assert.deepEqual(posted[1], { type: "ai", op: "generate", id: "g1", request: { id: "g1", prompt: "Hallo", schema: { type: "object", properties: { a: { type: "string" } } }, temperature: 0.2 } });
  answer(aiScript({ id: "g1", kind: "done", result: { json: { a: "b" } } }));
  assert.deepEqual(await generated, { json: { a: "b" } });

  const chunks: string[] = [];
  const streamed = ai.stream({ id: "s1", prompt: "Hallo", schema: { type: "string" } }, (text) => chunks.push(text));
  // A stream never carries a schema.
  assert.deepEqual(posted[2], { type: "ai", op: "stream", id: "s1", request: { id: "s1", prompt: "Hallo" } });
  answer(aiScript({ id: "s1", kind: "chunk", text: "Hal" }));
  answer(aiScript({ id: "other", kind: "chunk", text: "nicht meins" }));
  answer(aiScript({ id: "s1", kind: "chunk", text: "Hallo Welt" }));
  answer(aiScript({ id: "s1", kind: "done", result: { text: "Hallo Welt" } }));
  assert.deepEqual(chunks, ["Hal", "Hallo Welt"]);
  assert.deepEqual(await streamed, { text: "Hallo Welt" });
  // Settled: later answers for the id change nothing.
  answer(aiScript({ id: "s1", kind: "chunk", text: "später" }));
  assert.equal(chunks.length, 2);
});

test("errors reject with their code; one call per id; cancel posts the id", async () => {
  const { app, posted, answer } = page({ ai: true });
  const ai = app.ai as Ai;
  const first = ai.generate({ id: "x", prompt: "a" });
  await assert.rejects(ai.generate({ id: "x", prompt: "b" }), (error: Error & { code?: string }) => error.code === "busy");
  await assert.rejects(ai.generate({ prompt: "ohne id" }), (error: Error & { code?: string }) => error.code === "error");
  ai.cancel("x");
  assert.deepEqual(posted.at(-1), { type: "ai", op: "cancel", id: "x" });
  answer(aiScript(aiFailure("x", "cancelled")));
  await assert.rejects(first, (error: Error & { code?: string }) => error.code === "cancelled" && error.message === "Cancelled.");
  for (const code of ["unavailable", "context-too-long", "guardrail", "busy", "error"] as const) {
    const call = ai.stream({ id: code, prompt: "a" }, () => {});
    answer(aiScript(aiFailure(code, code)));
    await assert.rejects(call, (error: Error & { code?: string }) => error.code === code && error.message.length > 3);
  }
  // A throwing onChunk does not break the bridge.
  const call = ai.stream({ id: "t", prompt: "a" }, () => {
    throw new Error("page");
  });
  answer(aiScript({ id: "t", kind: "chunk", text: "a" }));
  answer(aiScript({ id: "t", kind: "done", result: { text: "a" } }));
  assert.deepEqual(await call, { text: "a" });
});

test("parsePageMessage takes ai calls with an id; aiCall checks the rest", () => {
  const message = { type: "ai", op: "generate", id: "a", request: { id: "a", prompt: "Hallo" } };
  assert.deepEqual(parsePageMessage(JSON.stringify(message)), message);
  assert.equal(parsePageMessage(JSON.stringify({ ...message, id: 3 })), null);
  assert.deepEqual(aiCall(message), { op: "generate", id: "a", request: { id: "a", prompt: "Hallo" } });
  // The message's id counts, whatever the request says.
  assert.deepEqual(aiCall({ ...message, request: { id: "b", prompt: "x" } }), { op: "generate", id: "a", request: { id: "a", prompt: "x" } });
  assert.deepEqual(aiCall({ op: "availability", id: "#a1" }), { op: "availability", id: "#a1" });
  assert.deepEqual(aiCall({ op: "cancel", id: "a" }), { op: "cancel", id: "a" });
  assert.equal(aiCall({ op: "delete", id: "a" }), null);
  assert.equal(aiCall({ op: "generate", id: "" }), null);
  assert.equal(aiCall({ op: "generate", id: "x".repeat(200) }), null);
  assert.deepEqual(aiCall({ op: "generate", id: "a", request: { prompt: "  " } }), { op: "failed", id: "a", code: "error" });
  assert.deepEqual(aiCall({ op: "stream", id: "a", request: null }), { op: "failed", id: "a", code: "error" });
  assert.deepEqual(aiCall({ op: "stream", id: "a", request: { prompt: "x".repeat(AI_LIMITS.prompt + 1) } }), { op: "failed", id: "a", code: "context-too-long" });
  // A stream ignores a schema; generate refuses one it cannot use.
  assert.deepEqual(aiCall({ op: "stream", id: "a", request: { prompt: "x", schema: { type: "date" } } }), { op: "stream", id: "a", request: { id: "a", prompt: "x" } });
  assert.deepEqual(aiCall({ op: "generate", id: "a", request: { prompt: "x", schema: { type: "date" } } }), { op: "failed", id: "a", code: "error" });
});

test("requests are clamped: temperature 0…2, 1…4096 tokens, instructions only when given", () => {
  assert.deepEqual(aiRequest({ id: "a", prompt: "p", instructions: " ", temperature: 9, maxTokens: 1e9 }, true), { id: "a", prompt: "p", temperature: 2, maxTokens: 4096 });
  assert.deepEqual(aiRequest({ id: "a", prompt: "p", instructions: "Kurz.", temperature: -1, maxTokens: 0.2 }, true), { id: "a", prompt: "p", instructions: "Kurz.", temperature: 0, maxTokens: 1 });
  assert.deepEqual(aiRequest({ id: "a", prompt: "p", temperature: "1", maxTokens: Number.NaN }, true), { id: "a", prompt: "p" });
  assert.equal(aiRequest({ id: "a", prompt: "p", instructions: "x".repeat(AI_LIMITS.instructions + 1) }, false), "context-too-long");
  assert.equal(aiRequest(null, false), "error");
  assert.equal(aiPayload({ id: "a", prompt: "p" }), '{"id":"a","prompt":"p"}');
});

test("the JSON Schema subset becomes an ordered schema for guided generation", () => {
  const tasks = {
    type: "object",
    description: "Aufgaben",
    properties: {
      summary: { type: "string", description: "Kurz" },
      tasks: { type: "array", maxItems: 10, items: { type: "object", properties: { title: { type: "string" }, due: { type: "string" }, priority: { enum: ["low", "high", 3] } }, required: ["title"] } },
      count: { type: "integer" },
      score: { type: "number" },
      done: { type: "boolean" },
    },
    required: ["summary", "tasks"],
  };
  assert.deepEqual(aiSchema(tasks), {
    type: "object",
    description: "Aufgaben",
    properties: [
      { name: "summary", description: "Kurz", optional: false, schema: { type: "string", description: "Kurz" } },
      {
        name: "tasks",
        optional: false,
        schema: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            properties: [
              { name: "title", optional: false, schema: { type: "string" } },
              { name: "due", optional: true, schema: { type: "string" } },
              { name: "priority", optional: true, schema: { type: "string", enum: ["low", "high", "3"] } },
            ],
          },
        },
      },
      { name: "count", optional: true, schema: { type: "integer" } },
      { name: "score", optional: true, schema: { type: "number" } },
      { name: "done", optional: true, schema: { type: "boolean" } },
    ],
  });
  for (const bad of [
    null,
    [],
    { type: "date" },
    { type: "object" },
    { type: "object", properties: {} },
    { type: "array" },
    { type: "array", items: { type: "string" }, minItems: 3, maxItems: 1 },
    { enum: [] },
    { enum: ["a", null] },
    { enum: Array.from({ length: 65 }, (_, i) => `v${i}`) },
  ])
    assert.equal(aiSchema(bad), null, JSON.stringify(bad));
  // Too deep, too big.
  let deep: Record<string, unknown> = { type: "string" };
  for (let i = 0; i < 8; i++) deep = { type: "array", items: deep };
  assert.equal(aiSchema(deep), null);
  const wide = { type: "object", properties: Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`p${i}`, { type: "string" }])) };
  assert.equal(aiSchema(wide), null);
});

test("availability, results and error codes from the native side are checked", () => {
  assert.deepEqual(aiAvailability({ available: true, languages: ["de", "en", "fr", "de", "<x>", 5] }), { available: true, languages: ["de", "en", "fr"] });
  assert.deepEqual(aiAvailability({ available: false, reason: "device-not-eligible" }), { available: false, reason: "device-not-eligible" });
  assert.deepEqual(aiAvailability({ available: false, reason: "whatever" }), { available: false, reason: "error" });
  assert.deepEqual(aiAvailability(null), { available: false, reason: "error" });
  assert.deepEqual(aiAvailability({ available: "yes" }), { available: false, reason: "error" });

  assert.deepEqual(aiResult({ text: "Hallo" }, false), { text: "Hallo" });
  assert.deepEqual(aiResult({}, false), { text: "" });
  assert.deepEqual(aiResult({ json: '{"tasks":["a"]}' }, true), { json: { tasks: ["a"] } });
  assert.throws(() => aiResult({ json: "{kaputt" }, true), (error: Error & { code?: string }) => error.code === "error");
  assert.throws(() => aiResult({ text: "x" }, true), (error: Error & { code?: string }) => error.code === "error");

  assert.equal(aiErrorCode({ code: "ERR_AI_CONTEXT_TOO_LONG" }), "context-too-long");
  assert.equal(aiErrorCode({ code: "ERR_AI_GUARDRAIL" }), "guardrail");
  assert.equal(aiErrorCode({ code: "ERR_AI_CANCELLED" }), "cancelled");
  assert.equal(aiErrorCode({ code: "ERR_AI_BUSY" }), "busy");
  assert.equal(aiErrorCode({ code: "ERR_AI_UNAVAILABLE" }), "unavailable");
  assert.equal(aiErrorCode({ code: "ERR_SOMETHING" }), "error");
  assert.equal(aiErrorCode(new Error("x")), "error");
});

test("answers reach the page as data, whatever the text holds", () => {
  const events: { type: string; detail: unknown }[] = [];
  const dispatch = (script: string) =>
    new Function("window", "CustomEvent", script)({ dispatchEvent: (event: FakeEvent) => events.push({ type: event.type, detail: event.detail }) }, FakeEvent);
  const tricky = `"); alert(1); ("</script><script>alert(2)</script>\u2028\u2029 Grüße 漢字 😀 \\ '`;
  for (const detail of [
    { id: 'i"d</script>', kind: "chunk" as const, text: tricky },
    { id: "a", kind: "done" as const, result: { text: tricky } },
    { id: "b", kind: "done" as const, result: { json: { tasks: [tricky] } } },
  ]) {
    const script = aiScript(detail);
    assert.doesNotMatch(script, /<\/script>/i);
    assert.doesNotMatch(script, /[\u2028\u2029<>]/);
    dispatch(script);
    assert.deepEqual(events.pop(), { type: "flowplan:ai", detail });
  }
  dispatch(aiScript({ id: "c", kind: "error", code: "<b>" as never, message: "<i>" }));
  assert.deepEqual(events.pop()?.detail, { id: "c", kind: "error", code: "error", message: "The on-device model failed." });
});

test("the native module is autolinked for iOS, guarded for older systems and matches its JavaScript side", () => {
  const config = JSON.parse(read("modules/flowplan-ai/expo-module.config.json"));
  assert.deepEqual(config, { platforms: ["apple"], apple: { modules: ["FlowplanAIModule"], appDelegateSubscribers: ["FlowplanWritingToolsSubscriber"] } });
  const resolved = JSON.parse(
    execFileSync(process.execPath, [require.resolve("expo/bin/autolinking"), "resolve", "--platform", "apple", "--json"], { cwd: root, encoding: "utf8" }),
  ) as { modules: { packageName: string; pods: { podName: string; podspecDir: string }[]; modules: { class: string }[]; appDelegateSubscribers?: string[] }[] };
  const ai = resolved.modules.find((module) => module.packageName === "flowplan-ai");
  assert.ok(ai, "flowplan-ai is not autolinked");
  assert.deepEqual(ai!.pods.map((pod) => pod.podName), ["FlowplanAI"]);
  assert.ok(ai!.pods[0].podspecDir.endsWith(join("modules", "flowplan-ai", "ios")));
  assert.deepEqual(ai!.modules.map((module) => module.class), ["FlowplanAIModule"]);
  assert.deepEqual(ai!.appDelegateSubscribers, ["FlowplanWritingToolsSubscriber"]);

  const podspec = read("modules/flowplan-ai/ios/FlowplanAI.podspec");
  assert.match(podspec, /s\.name\s+= 'FlowplanAI'/);
  assert.match(podspec, /:ios => '16\.4'/);
  // Weakly linked: the app starts where the framework does not exist.
  assert.match(podspec, /s\.weak_frameworks = 'FoundationModels'/);
  assert.doesNotMatch(podspec, /s\.frameworks = .*FoundationModels/);

  const module = read("modules/flowplan-ai/ios/FlowplanAIModule.swift");
  const model = read("modules/flowplan-ai/ios/FlowplanAIModel.swift");
  const tools = read("modules/flowplan-ai/ios/FlowplanWritingTools.swift");
  assert.match(module, /public class FlowplanAIModule: Module \{/);
  assert.match(module, /Name\("FlowplanAI"\)/);
  assert.match(module, /Events\("onChunk"\)/);
  for (const name of ["availability", "generate", "stream"]) assert.match(module, new RegExp(`AsyncFunction\\("${name}"\\)`));
  assert.match(module, /Function\("cancel"\) \{ \(id: String\)/);
  assert.match(module, /"ERR_AI_" \+ code\.uppercased\(\)\.replacingOccurrences\(of: "-", with: "_"\)/);
  // Everything of FoundationModels behind both guards.
  assert.equal(model.match(/^import FoundationModels$/m)?.index, model.indexOf("#if canImport(FoundationModels)\nimport FoundationModels") + "#if canImport(FoundationModels)\n".length);
  const guarded = model.slice(model.indexOf("#if canImport(FoundationModels)\n@available(iOS 26.0, *)\nenum FPFoundationModel"));
  assert.ok(guarded.length > 0 && guarded.trimEnd().endsWith("#endif"));
  for (const name of ["SystemLanguageModel", "LanguageModelSession", "GenerationOptions", "DynamicGenerationSchema", "GenerationSchema("])
    assert.equal(model.indexOf(name) >= model.indexOf("@available(iOS 26.0, *)\nenum FPFoundationModel"), true, name);
  assert.match(model, /if #available\(iOS 26\.0, \*\) \{\n\s+return FPFoundationModel\.availability\(\)/);
  assert.match(model, /return \["available": false, "reason": "unsupported-os"\]/);
  for (const part of [
    "case .deviceNotEligible:\n        code = \"device-not-eligible\"",
    "case .appleIntelligenceNotEnabled:\n        code = \"apple-intelligence-off\"",
    "case .modelNotReady:\n        code = \"model-not-ready\"",
    "case .exceededContextWindowSize:\n        return .failed(\"context-too-long\"",
    "case .guardrailViolation, .refusal:\n        return .failed(\"guardrail\"",
    "case .rateLimited, .concurrentRequests:\n        return .failed(\"busy\"",
    "error is CancellationError",
    "options.temperature = temperature",
    "options.maximumResponseTokens = tokens",
    "session.streamResponse(to: Prompt { prompt }, options: options)",
    "includeSchemaInPrompt: true",
    "response.content.jsonString",
    "completion(.failed(\"busy\"",
    "guides: [.anyOf(choices)]",
  ])
    assert.ok(model.includes(part), part);
  // The same limits on both sides.
  assert.match(model, /maxPrompt = 40_000\b/);
  assert.match(model, /maxInstructions = 8_000\b/);
  assert.match(model, /maxTokens = 4096\b/);
  assert.match(model, /id\.count <= 100\b/);
  assert.match(model, /maxDepth = 6\b/);
  assert.deepEqual([AI_LIMITS.prompt, AI_LIMITS.instructions, AI_LIMITS.maxTokens, AI_LIMITS.id, AI_LIMITS.schemaDepth], [40_000, 8_000, 4096, 100, 6]);
  // Writing Tools: the complete experience in the web view, from iOS 18.
  assert.match(tools, /guard #available\(iOS 18\.0, \*\) else \{ return \}/);
  assert.match(tools, /configuration\.writingToolsBehavior = \.complete/);
  assert.match(tools, /NSClassFromString\("RNCWebViewImpl"\)/);
  assert.match(tools, /NSSelectorFromString\("setUpWkWebViewConfig"\)/);
  const webview = readFileSync(require.resolve("react-native-webview/apple/RNCWebViewImpl.m"), "utf8");
  assert.match(webview, /- \(WKWebViewConfiguration \*\)setUpWkWebViewConfig\b/);
  assert.match(webview, /initWithFrame:self\.bounds configuration: ?wkWebViewConfig\]/);

  const js = read("modules/flowplan-ai/src/index.ts");
  assert.match(js, /requireOptionalNativeModule<NativeModule>\("FlowplanAI"\)/);
  assert.match(js, /Platform\.OS === "ios"/);
  // The window offers ai only with the module, and hands calls to handleAi.
  const shell = read("src/screens/Shell.tsx");
  assert.match(shell, /const deviceAi = deviceAiLinked\(\);/);
  assert.match(shell, /inkRecognition,\s*ai: deviceAi,/);
  assert.match(shell, /message\.type === "ai"\) handleAi\(message\)/);
  assert.match(shell, /if \(onServer\(\)\) run\(aiScript\(detail\)\)/);
});
