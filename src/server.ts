// Which addresses the app accepts: only a Flowplan instance, over HTTPS (plain
// HTTP only in the local network, #62), that does not redirect to another
// site. Pure functions – the app passes in the HTTP client, the tests a fake
// one.

export const DEFAULT_SERVER = "https://app.flowplan.org";

export type ServerErrorCode = "empty" | "invalid" | "https" | "httpName" | "unreachable" | "redirect" | "notFlowplan";

export class ServerError extends Error {
  code: ServerErrorCode;
  detail: string;
  constructor(code: ServerErrorCode, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

// Where plain HTTP is allowed: addresses of the local network only, never a
// public domain or address – there a password would cross the internet
// unencrypted. The kinds, because iOS allows less than Android:
// - "ip": loopback (127/8, ::1), private (10/8, 172.16/12, 192.168/16, IPv6
//   ULA fc00::/7), link-local (169.254/16, fe80::/10) and shared/CGNAT
//   addresses (100.64/10: Tailscale, carrier NAT; 10.0.2.2 is the
//   development machine as seen from the Android emulator);
// - "name": a name without dots ("nas", "localhost");
// - "local": mDNS/Bonjour names (".local");
// - "domain": names under the suffixes for home and internal networks
//   (".lan", ".home.arpa", ".internal", ".localhost").
// Tailscale's MagicDNS names (*.ts.net) can have HTTPS certificates and stay
// HTTPS-only like every other domain.
export type LocalKind = "ip" | "name" | "local" | "domain";

const LOCAL_SUFFIXES = [".lan", ".home.arpa", ".internal", ".localhost"];

function ipv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null;
  return parts.map(Number);
}

function localIpv4([a, b]: number[]) {
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// IPv6 as the URL parser writes it: compressed, lower case, in brackets.
function localIpv6(host: string) {
  if (host === "::1") return true;
  const first = /^([0-9a-f]{1,4}):/.exec(host);
  if (!first) return false;
  const word = parseInt(first[1], 16);
  return (word & 0xfe00) === 0xfc00 || (word & 0xffc0) === 0xfe80;
}

// The kind of local address a host name (URL.hostname) is, or null for a
// public one.
export function localKind(hostname: string): LocalKind | null {
  // A trailing dot ("nas.") makes any name fully qualified: not local.
  const host = hostname.toLowerCase();
  if (!host || host.endsWith(".")) return null;
  if (host.startsWith("[")) return host.endsWith("]") && localIpv6(host.slice(1, -1)) ? "ip" : null;
  const v4 = ipv4(host);
  if (v4) return localIpv4(v4) ? "ip" : null;
  // The URL parser turns every all-numeric host into an IPv4 address; what
  // is left with only digits and dots is no name.
  if (/^[\d.]+$/.test(host)) return null;
  if (!host.includes(".")) return "name";
  if (host.endsWith(".local")) return "local";
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "domain";
  return null;
}

// Whether a host may be reached over plain HTTP on this platform. iOS (App
// Transport Security, NSAllowsLocalNetworking) lets only IP addresses, names
// without dots and .local names through; a name like "nas.lan" is a
// fully qualified domain there and would only show an empty page.
export function plainHttpAllowed(hostname: string, platform: "ios" | "android" = "android") {
  const kind = localKind(hostname);
  if (!kind) return false;
  return platform !== "ios" || kind !== "domain";
}

export function normalizeServer(input: unknown, platform: "ios" | "android" = "android"): string {
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
  if (url.protocol === "http:" && !plainHttpAllowed(url.hostname, platform))
    throw new ServerError(localKind(url.hostname) ? "httpName" : "https");
  return url.origin;
}

// Whether an address the person is typing will connect without encryption
// (the warning on the setup screen).
export function isPlainHttp(input: unknown, platform: "ios" | "android" = "android") {
  try {
    return normalizeServer(input, platform).startsWith("http:");
  } catch {
    return false;
  }
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
