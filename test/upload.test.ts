// Files with the platform's uploader (src/upload.ts, yannicschuller/flowplan#403):
// fields, headers, the Idempotency-Key and its retry, 401, the error detail
// and the timeout – with a fake native uploader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanDetail, detailOf, errorDetail, platformUploader, uploadFile, type NativeUploadRequest } from "../src/upload";
import { uploadCapture, widgetAction } from "../src/widgets/api";
import { saveScan } from "../src/capture";
import { strings } from "../src/i18n";

const SERVER = "https://notes.example.com";
const FILE = { uri: "file:///data/user/0/app.flowplan.mobile/cache/shared/0-a.pdf", name: "a.pdf", type: "application/pdf" };
const base = { url: `${SERVER}/api/mobile/capture/save?lang=en`, server: SERVER, token: "fpd_secret123", file: FILE, fields: { targetId: "p", place: "append" }, timeoutMs: 5000 };

// Answers in turn: a status and body, or an error to throw.
function fakeUploader(answers: ({ status: number; body: unknown } | Error)[]) {
  const calls: NativeUploadRequest[] = [];
  const uploader = async (request: NativeUploadRequest) => {
    calls.push(request);
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return { status: answer.status, body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body) };
  };
  return { calls, uploader };
}

const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

test("the file, its fields and the headers go to the uploader", async () => {
  const { calls, uploader } = fakeUploader([{ status: 200, body: { pageId: "p", url: "/#page=p" } }]);
  const result = await uploadFile<{ url: string }>({ ...base, idempotencyKey: "key-1" }, uploader, 0);
  assert.deepEqual(result, { ok: true, value: { pageId: "p", url: "/#page=p" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, base.url);
  assert.deepEqual(calls[0].file, FILE);
  assert.deepEqual(calls[0].fields, { targetId: "p", place: "append" });
  assert.deepEqual(calls[0].headers, { Authorization: "Bearer fpd_secret123", Accept: "application/json", "Idempotency-Key": "key-1" });
  assert.ok(calls[0].signal && !calls[0].signal.aborted);
});

test("with a key: no answer or a gateway error goes once more with the same key; refusals do not", async () => {
  const network = fakeUploader([coded("ERR_UNABLE_TO_UPLOAD", "Unable to upload a file: timeout"), { status: 200, body: { ok: true } }]);
  assert.ok((await uploadFile({ ...base, idempotencyKey: "k" }, network.uploader, 0)).ok);
  assert.equal(network.calls.length, 2);
  assert.equal(network.calls[1].headers["Idempotency-Key"], "k");
  const gateway = fakeUploader([{ status: 503, body: "<html>" }, { status: 200, body: { ok: true } }]);
  assert.ok((await uploadFile({ ...base, idempotencyKey: "k" }, gateway.uploader, 0)).ok);
  assert.equal(gateway.calls.length, 2);
  const busy = fakeUploader([{ status: 409, body: { code: "idempotency_in_progress", error: "still" } }, { status: 200, body: { ok: true } }]);
  assert.ok((await uploadFile({ ...base, idempotencyKey: "k" }, busy.uploader, 0)).ok);
  assert.equal(busy.calls.length, 2);
  // At most twice.
  const down = fakeUploader([{ status: 502, body: "" }]);
  assert.deepEqual(await uploadFile({ ...base, idempotencyKey: "k" }, down.uploader, 0), { ok: false, status: 502, error: "", detail: "HTTP 502" });
  assert.equal(down.calls.length, 2);
  // A refusal with the instance's sentence: once, its text, its status.
  const big = fakeUploader([{ status: 413, body: { error: "At most 10 MB per file." } }]);
  assert.deepEqual(await uploadFile({ ...base, idempotencyKey: "k" }, big.uploader, 0), { ok: false, status: 413, error: "At most 10 MB per file.", detail: "HTTP 413" });
  assert.equal(big.calls.length, 1);
  // Without a key nothing is sent twice.
  const once = fakeUploader([new Error("x")]);
  await uploadFile(base, once.uploader, 0);
  assert.equal(once.calls.length, 1);
});

test("401 is signed out, without a retry", async () => {
  const { calls, uploader } = fakeUploader([{ status: 401, body: { error: "Unauthorized" } }]);
  assert.deepEqual(await uploadFile({ ...base, idempotencyKey: "k" }, uploader, 0), { ok: false, signedOut: true });
  assert.equal(calls.length, 1);
});

test("an error says what happened – without the server's address, queries, tokens or paths", async () => {
  const failing = fakeUploader([
    coded("ERR_UNABLE_TO_UPLOAD", "Unable to upload a file: Failed to connect to notes.example.com/203.0.113.7:443 (https://notes.example.com/api/mobile/capture/save?lang=en&token=fpd_secret123)"),
  ]);
  const result = await uploadFile(base, failing.uploader, 0);
  assert.equal(result.ok, false);
  const detail = detailOf(result);
  assert.equal(detail, "ERR_UNABLE_TO_UPLOAD: Unable to upload a file: Failed to connect to <server>/<ip>:443 (<url>)");
  for (const secret of ["notes.example.com", "203.0.113.7", "fpd_secret123", "lang=en", "?"]) assert.ok(!detail.includes(secret), secret);
  // A file that cannot be read: its path does not show.
  assert.equal(
    errorDetail(coded("ERR_UNABLE_TO_UPLOAD", "Unable to upload a file: /data/user/0/app.flowplan.mobile/cache/shared/0-a.pdf (No such file or directory)"), SERVER),
    "ERR_UNABLE_TO_UPLOAD: Unable to upload a file: <path> (No such file or directory)",
  );
  assert.equal(errorDetail(new Error("open failed: file:///data/x/y.pdf"), SERVER), "open failed: <file>");
  assert.equal(errorDetail(new TypeError("Network request failed")), "TypeError: Network request failed");
  assert.equal(errorDetail(coded("ERR_UPLOAD_CANCELLED", "")), "ERR_UPLOAD_CANCELLED");
  assert.equal(errorDetail(null), "unknown error");
  assert.equal(cleanDetail("Authorization: Bearer abc.def failed for [2001:db8::1]:443"), "Authorization: Bearer <token> failed for <ip>:443");
  assert.equal(cleanDetail("HTTP/1.1 header application/pdf at 12:30"), "HTTP/1.1 header application/pdf at 12:30");
  assert.ok(cleanDetail("x".repeat(500)).length <= 300);
  // An HTTP answer that is not JSON.
  const html = fakeUploader([{ status: 200, body: "<html>proxy login</html>" }]);
  assert.deepEqual(await uploadFile(base, html.uploader, 0), { ok: false, status: 200, error: "", detail: "HTTP 200: no JSON answer" });
});

test("an upload that takes longer than its timeout is aborted and says so", async () => {
  let aborted = false;
  const hanging = async (request: NativeUploadRequest) =>
    new Promise<{ status: number; body: string }>((_, reject) => {
      request.signal?.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        reject(error);
      });
    });
  const result = await uploadFile({ ...base, timeoutMs: 30 }, hanging, 0);
  assert.equal(aborted, true);
  assert.deepEqual(result, { ok: false, status: 0, error: "", detail: "timeout (30 ms)" });
  // An uploader that ignores the signal ends at the timeout as well.
  const deaf = () => new Promise<{ status: number; body: string }>(() => {});
  assert.deepEqual(await uploadFile({ ...base, timeoutMs: 30 }, deaf, 0), { ok: false, status: 0, error: "", detail: "timeout (30 ms)" });
  assert.equal(errorDetail(new Error("x"), "", 120_000), "timeout (120 s)");
});

test("photos and voice memos (capture.upload) go with the native uploader, with their key", async () => {
  const { calls, uploader } = fakeUploader([new Error("reset"), { status: 200, body: { ok: true, action: "capture.upload", url: "/#page=p" } }]);
  const file = { uri: "file:///cache/recording-1.m4a", name: "voice-1.m4a", type: "audio/m4a" };
  const result = await uploadCapture({ server: SERVER, token: "t", lang: "fr" }, { targetId: "p", type: "voice", title: "Idée", file }, undefined, "voice-key", uploader);
  assert.ok(result.ok);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${SERVER}/api/mobile/widgets/action?lang=fr`);
  assert.deepEqual(calls[0].fields, { action: "capture.upload", targetId: "p", type: "voice", transcribe: "1", title: "Idée" });
  assert.deepEqual(calls[0].file, file);
  assert.ok(calls.every((call) => call.headers["Idempotency-Key"] === "voice-key"));
});

test("the fetch path keeps the error as well (iOS, several files, JSON actions)", async () => {
  const fetcher = async () => {
    throw new TypeError("Network request failed");
  };
  const result = await widgetAction({ server: SERVER, token: "t", lang: "en" }, "timer.stop", {}, fetcher, "k");
  assert.deepEqual(result, { ok: false, status: 0, error: "", detail: "TypeError: Network request failed" });
  const scan = await saveScan({ server: SERVER, token: "t", lang: "en" }, { targetId: "p", title: "S", text: "", file: { uri: "file:///x.pdf", name: "x.pdf" } }, async () => ({
    status: 500,
    ok: false,
    json: async () => ({ error: "Boom", code: "internal" }),
  }), "k", null);
  assert.deepEqual(scan, { ok: false, status: 500, error: "Boom", detail: "HTTP 500 internal" });
});

test("only the app has a native uploader; it is Android's expo-file-system multipart upload", () => {
  // In Node (the tests) – and so wherever navigator.product is not React Native – none.
  assert.equal(platformUploader(SERVER), null);
  const native = readFileSync(join(import.meta.dirname, "..", "src/native/upload.ts"), "utf8");
  assert.match(native, /Platform\.OS !== "android"\) return null/);
  assert.match(native, /uploadType: UploadType\.MULTIPART/);
  assert.match(native, /fieldName: "file"/);
  assert.match(native, /parameters: fields/);
  assert.match(native, /httpMethod: "POST"/);
  // A pinned certificate (src/certs/pins.ts) keeps React Native's client.
  assert.match(native, /certificatePins\(\)/);
});

test("the screens show the detail under a failure, in every language", () => {
  for (const lang of ["de", "en", "fr", "zh"] as const) assert.match(strings[lang].errorDetails, /\{detail\}/, lang);
  for (const screen of ["Scan", "ShareCapture", "Capture"]) {
    const source = readFileSync(join(import.meta.dirname, "..", `src/screens/${screen}.tsx`), "utf8");
    assert.match(source, /detailOf\(/, screen);
    assert.match(source, /t\("errorDetails", \{ detail/, screen);
  }
});
