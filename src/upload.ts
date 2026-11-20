// A file to the instance with the platform's own uploader instead of React
// Native's FormData (yannicschuller/flowplan#403): on some Android devices
// the scan and share uploads never reached the instance while JSON requests
// of the same app did. The native side (src/native/upload.ts, expo-file-
// system's File.upload) builds the multipart body itself, from the file on
// disk, and its errors say what went wrong. One file per request, the other
// form fields as parameters.
//
// Like call() in src/widgets/api.ts and src/capture.ts: a 401 is signed out,
// a JSON error body gives the error text, and with an Idempotency-Key a
// request without an answer (or one the instance still works on) goes once
// more with the same key. Every failure carries `detail` – what actually
// happened (HTTP status, native error code and message), cleaned of the
// server's address, queries, tokens and file paths – which the screens show
// under "Details". Pure apart from the uploader, so the tests run it with a
// fake one.
import { IDEMPOTENCY_HEADER, retryable } from "./idempotency";

export type UploadFile = { uri: string; name: string; type: string };
export type NativeUploadRequest = {
  url: string;
  file: UploadFile;
  // The other multipart fields; the file goes as "file".
  fields: Record<string, string>;
  headers: Record<string, string>;
  signal?: AbortSignal;
};
// Resolves with any HTTP answer (also 4xx/5xx), rejects when nothing came back.
export type NativeUploader = (request: NativeUploadRequest) => Promise<{ status: number; body: string }>;

export type Failure = { ok: false; status: number; error: string; detail: string };
export type UploadResult<T> = { ok: true; value: T } | { ok: false; signedOut: true } | Failure;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A technical message as it may be shown: without the instance's address,
// queries (anything after "?"), tokens, file URIs and paths, IP addresses.
export function cleanDetail(text: string, server = ""): string {
  let out = String(text || "");
  const names = new Set<string>();
  if (server) {
    names.add(server.replace(/\/+$/, ""));
    try {
      const url = new URL(server);
      names.add(url.host);
      names.add(url.hostname);
    } catch {}
  }
  out = out.replace(/\b(?:https?|file|content):\/\/[^\s)"'<>]*/gi, (match) => (/^https?:/i.test(match) ? "<url>" : "<file>"));
  for (const name of [...names].filter(Boolean).sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(escape(name), "gi"), "<server>");
  out = out
    .replace(/\?\S*/g, "")
    .replace(/\bBearer\s+\S+/gi, "Bearer <token>")
    .replace(/\bfp[a-z]?_[A-Za-z0-9_-]+/g, "<token>")
    .replace(/(?:\/[^\s/:]+){2,}\/?/g, "<path>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\[?\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b\]?/gi, (match) => (match.includes("::") || match.split(":").length > 5 ? "<ip>" : match))
    .replace(/\s+/g, " ")
    .trim();
  return out.length > 300 ? `${out.slice(0, 299)}…` : out;
}

const duration = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);

// What a thrown error says: its code (expo's CodedException, e.g.
// "ERR_UNABLE_TO_UPLOAD") or name, and its message. A request that ran into
// its own timeout says so.
export function errorDetail(error: unknown, server = "", timedOutAfter?: number): string {
  if (timedOutAfter !== undefined) return `timeout (${duration(timedOutAfter)})`;
  const e = (error && typeof error === "object" ? error : {}) as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : "";
  const name = typeof e.name === "string" && e.name !== "Error" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : typeof error === "string" ? error : "";
  return cleanDetail([code || name, message].filter(Boolean).join(": "), server) || "unknown error";
}

// An HTTP answer that is not a success: its status and the instance's code.
export function statusDetail(status: number, body: Record<string, unknown> | null): string {
  const code = typeof body?.code === "string" ? ` ${cleanDetail(body.code).slice(0, 60)}` : "";
  return `HTTP ${status}${code}`;
}

// A failure with the detail as the screens show it ("" when there is none).
export const detailOf = (result: { ok: boolean }) => ("detail" in result && typeof result.detail === "string" ? result.detail : "");

export async function uploadFile<T>(
  input: {
    url: string;
    server: string;
    token: string;
    file: UploadFile;
    fields: Record<string, string>;
    idempotencyKey?: string;
    timeoutMs: number;
  },
  uploader: NativeUploader,
  pause = 500,
): Promise<UploadResult<T>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${input.token}`, Accept: "application/json" };
  if (input.idempotencyKey) headers[IDEMPOTENCY_HEADER] = input.idempotencyKey;
  let result: UploadResult<T> = { ok: false, status: 0, error: "", detail: "" };
  for (let attempt = 0; attempt < (input.idempotencyKey ? 2 : 1); attempt++) {
    let body: Record<string, unknown> | null = null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, input.timeoutMs);
    try {
      const answer = await Promise.race([
        uploader({ url: input.url, file: input.file, fields: input.fields, headers: { ...headers }, signal: controller?.signal }),
        // An uploader that does not honour the signal still ends here.
        new Promise<never>((_, reject) => controller?.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
      ]);
      if (answer.status === 401) return { ok: false, signedOut: true };
      try {
        const parsed: unknown = JSON.parse(answer.body);
        body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      if (answer.status >= 200 && answer.status < 300 && body) return { ok: true, value: body as T };
      result = {
        ok: false,
        status: answer.status || 0,
        error: typeof body?.error === "string" ? body.error : "",
        detail: answer.status >= 200 && answer.status < 300 ? `HTTP ${answer.status}: no JSON answer` : statusDetail(answer.status, body),
      };
    } catch (error) {
      result = { ok: false, status: 0, error: "", detail: errorDetail(error, input.server, timedOut ? input.timeoutMs : undefined) };
    } finally {
      clearTimeout(timer);
    }
    if (!retryable(result.status, body) || attempt > 0) break;
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
  return result;
}

// The uploader of this platform, or null where requests keep going through
// fetch and FormData: everywhere but in the Android app (the tests in Node,
// iOS), and on Android for an instance whose certificate the person pinned
// (src/certs/pins.ts) – expo-file-system's OkHttp client does not use React
// Native's CustomClientBuilder, so it would refuse that certificate.
export function platformUploader(server: string): NativeUploader | null {
  if ((globalThis as { navigator?: { product?: string } }).navigator?.product !== "ReactNative") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./native/upload") as typeof import("./native/upload")).nativeUploader(server);
  } catch {
    return null;
  }
}
