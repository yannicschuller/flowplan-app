// Which addresses the app accepts: only a Flowplan instance, over HTTPS (HTTP
// only for local development), that does not redirect to another site. Pure
// functions – the app passes in the HTTP client, the tests a fake one.

export const DEFAULT_SERVER = "https://app.flowplan.org";

export type ServerErrorCode = "empty" | "invalid" | "https" | "unreachable" | "redirect" | "notFlowplan";

export class ServerError extends Error {
  code: ServerErrorCode;
  detail: string;
  constructor(code: ServerErrorCode, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

// 10.0.2.2 is the development machine as seen from the Android emulator.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"];

export function normalizeServer(input: unknown): string {
  let value = String(input ?? "").trim();
  if (!value) throw new ServerError("empty");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServerError("invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ServerError("invalid");
  if (!url.hostname || /\s/.test(url.hostname)) throw new ServerError("invalid");
  const local = LOCAL_HOSTS.includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !local) throw new ServerError("https");
  return url.origin;
}

// The origin of an address, or null for anything that is not http(s).
export function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

// The health check names the service; older versions are recognised by the
// fields of their answer (like the desktop app).
export function isFlowplanHealth(data: unknown): boolean {
  const value = data as { service?: unknown; checks?: unknown; searchBacklog?: unknown } | null;
  return (
    value?.service === "flowplan" ||
    Boolean(value && typeof value.checks === "object" && value.checks && "database" in value.checks && "searchBacklog" in value)
  );
}

export type HttpResponse = { status: number; headers?: Record<string, string>; data?: unknown };
export type HttpRequest = (options: { url: string }) => Promise<HttpResponse>;

// Redirects within the same origin (e.g. a trailing slash) are followed, a
// redirect to another origin is refused with that origin.
export async function checkServer(origin: string, request: HttpRequest) {
  let url = `${origin}/api/health`;
  for (let hop = 0; hop < 4; hop++) {
    let response: HttpResponse;
    try {
      response = await request({ url });
    } catch (error) {
      throw new ServerError("unreachable", String((error as Error)?.message || error || ""));
    }
    const status = Number(response?.status) || 0;
    if (status >= 300 && status < 400) {
      const location = header(response.headers, "location");
      if (!location) throw new ServerError("notFlowplan");
      const next = new URL(location, url);
      if (next.origin !== origin) throw new ServerError("redirect", next.origin);
      url = next.href;
      continue;
    }
    let data = response?.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    if (!isFlowplanHealth(data)) throw new ServerError("notFlowplan");
    return true;
  }
  throw new ServerError("notFlowplan");
}

function header(headers: Record<string, string> | undefined, name: string) {
  if (!headers) return "";
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return String(value);
  return "";
}

// A signal that aborts after `ms` (Hermes has no AbortSignal.timeout).
export function timeoutSignal(ms: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// The address without "https://", for texts.
export const shortServer = (origin: string) => origin.replace(/^https:\/\//, "");
