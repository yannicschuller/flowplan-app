// Idempotency keys of the app's state-changing calls (src/idempotency.ts;
// the instance's side: lib/idempotency.ts in Flowplan).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftKey, newIdempotencyKey, retryable } from "../src/idempotency";
import { widgetAction, widgetData } from "../src/widgets/api";
import { saveShare } from "../src/android/share";
import { saveScan } from "../src/capture";

type Init = { method?: string; headers: Record<string, string>; body?: unknown };
// Answers in turn: a status and body, or "network" for a failed request.
function fakeFetch(answers: ({ status: number; body: unknown } | "network")[]) {
  const calls: { url: string; init: Init }[] = [];
  const fetcher = async (url: string, init: Init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (answer === "network") throw new TypeError("Network request failed");
    return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
  };
  return { calls, fetcher };
}
const connection = { server: "https://flowplan.example", token: "fpd_x", lang: "en" };
const KEY = /^[A-Za-z0-9_-]{8,128}$/;

test("keys: UUIDs in the instance's format; drafts keep theirs while unchanged", () => {
  const a = newIdempotencyKey(),
    b = newIdempotencyKey();
  assert.match(a, KEY);
  assert.notEqual(a, b);
  const first = draftKey(null, "share|text");
  assert.equal(draftKey(first, "share|text").key, first.key);
  assert.notEqual(draftKey(first, "share|other").key, first.key);
  assert.equal(retryable(0, null), true);
  assert.equal(retryable(503, null), true);
  assert.equal(retryable(409, { code: "idempotency_in_progress" }), true);
  assert.equal(retryable(409, { error: "locked" }), false);
  assert.equal(retryable(429, null), false);
});

test("a widget tap sends one key and retries once with it when there was no answer", async () => {
  const { calls, fetcher } = fakeFetch(["network", { status: 200, body: { ok: true, action: "task.complete" } }]);
  const result = await widgetAction(connection, "task.complete", { pageId: "p", rowId: "r" }, fetcher);
  assert.ok(result.ok);
  assert.equal(calls.length, 2);
  const key = calls[0].init.headers["Idempotency-Key"];
  assert.match(key, KEY);
  assert.equal(calls[1].init.headers["Idempotency-Key"], key);
  assert.equal(calls[0].init.body, calls[1].init.body);
  // Each tap its own key.
  const next = fakeFetch([{ status: 200, body: { ok: true } }]);
  await widgetAction(connection, "task.complete", { pageId: "p", rowId: "r" }, next.fetcher);
  assert.notEqual(next.calls[0].init.headers["Idempotency-Key"], key);
  // A key of the caller's (the same tap later) goes as it is.
  const again = fakeFetch([{ status: 200, body: { ok: true } }]);
  await widgetAction(connection, "timer.stop", {}, again.fetcher, "tap-key-123");
  assert.equal(again.calls[0].init.headers["Idempotency-Key"], "tap-key-123");
});

test("refusals are not retried; a still running first attempt is", async () => {
  const limited = fakeFetch([{ status: 429, body: { error: "Too many requests." } }]);
  assert.deepEqual(await widgetAction(connection, "timer.stop", {}, limited.fetcher), { ok: false, status: 429, error: "Too many requests." });
  assert.equal(limited.calls.length, 1);
  const busy = fakeFetch([{ status: 409, body: { error: "still", code: "idempotency_in_progress" } }, { status: 200, body: { ok: true } }]);
  assert.ok((await widgetAction(connection, "timer.stop", {}, busy.fetcher)).ok);
  assert.equal(busy.calls.length, 2);
  assert.equal(busy.calls[0].init.headers["Idempotency-Key"], busy.calls[1].init.headers["Idempotency-Key"]);
});

test("the data refresh only reads: no key, no retry", async () => {
  const { calls, fetcher } = fakeFetch(["network"]);
  const result = await widgetData(connection, [{ id: "1", kind: "time", config: {} }], { today: "2026-10-25", zone: "UTC" }, fetcher);
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers["Idempotency-Key"], undefined);
});

test("shares and scans carry a key; Save again passes the same one", async () => {
  const { calls, fetcher } = fakeFetch(["network", "network"]);
  const draft = { title: "T", text: "Text", url: "", files: [] };
  const first = await saveShare(connection, "page-1", draft, fetcher, "share-key-1");
  assert.equal(first.ok, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.init.headers["Idempotency-Key"] === "share-key-1"));
  const scan = fakeFetch([{ status: 200, body: { pageId: "p", url: "/#page=p", title: "S" } }]);
  await saveScan(connection, { targetId: "p", title: "S", text: "", file: { uri: "file:///x.pdf", name: "x.pdf" } }, scan.fetcher);
  assert.match(scan.calls[0].init.headers["Idempotency-Key"], KEY);
});

test("native callers send the header: widgets, shortcuts, the share extension and notification buttons", () => {
  const root = join(__dirname, "..");
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  for (const path of [
    "modules/flowplan-native/ios/WidgetShared.swift",
    "plugins/capture/ShareModel.swift",
    "modules/flowplan-notify/ios/NotificationActions.swift",
    "src/native/notification-actions.ts",
    "src/native/intents.ts",
  ])
    assert.match(read(path), /Idempotency-Key|IDEMPOTENCY_HEADER/, path);
  // Shortcuts and Focus filters go through FPAPI.call with a key per run.
  assert.match(read("plugins/intents/app/FlowplanIntentEntities.swift"), /idempotencyKey: key/);
  // One key per tap, reused for the retry.
  assert.match(read("modules/flowplan-native/ios/WidgetShared.swift"), /key: String = UUID\(\)\.uuidString/);
});
