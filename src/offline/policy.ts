// What the app keeps of an instance for offline use, checked for every
// request of the page (src/offline/store.ts) – the page could ask for
// anything, the app keeps only what the instance's offline copy is made of
// (components/offline.ts and public/sw.js in Flowplan):
//
// - caches: "flowplan-settings" (the marker: who switched it on, when it was
//   refreshed), "flowplan-data-v1" (the app's page, the workspace, pages,
//   records and files) and "flowplan-static-<build>" (the app's own files);
// - keys: path and query on the instance's own origin, per cache only the
//   kinds of the copy (never a sign-in, an export, a token or the API at
//   large);
// - answers: 200 only, at most MAX_ENTRY bytes, headers from a short list
//   (never a cookie). "Cache-Control: no-store" is respected except for the
//   app's page and the data endpoints the copy is made of – the instance
//   marks every API answer no-store, and these are the ones offline use is
//   for; the sign-in page is never kept as the app's page.
export const SETTINGS_CACHE = "flowplan-settings";
export const DATA_CACHE = "flowplan-data-v1";
export const MARKER_KEY = "/__flowplan-offline";
const STATIC_CACHE = /^flowplan-static-[A-Za-z0-9_-]{1,64}$/;

// One answer, and one profile's copy as a whole.
export const MAX_ENTRY = 25 * 1024 * 1024;
export const MAX_PROFILE = 2 * 1024 * 1024 * 1024;
// Free space the copy never takes.
export const DISK_RESERVE = 300 * 1024 * 1024;
const MAX_KEY = 2048;

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const DATA_KEYS = [
  /^\/$/,
  /^\/api\/bootstrap(\?[^#]*)?$/,
  new RegExp(`^/api/pages/${UUID}(/rows/${UUID})?(\\?[^#]*)?$`),
  new RegExp(`^/api/files/${UUID}(\\?[^#]*)?$`),
];
const STATIC_KEYS = [/^\/_next\/static\/[^?#]+(\?[^#]*)?$/, /^\/fonts\.css$/, /^\/fonts\/[^/?#]+$/, /^\/icons\/[^/?#]+$/];

export type CacheKind = "settings" | "data" | "static";
export function cacheKind(name: unknown): CacheKind | null {
  if (name === SETTINGS_CACHE) return "settings";
  if (name === DATA_CACHE) return "data";
  if (typeof name === "string" && STATIC_CACHE.test(name)) return "static";
  return null;
}

// A key as the page's caches name it: a path with its query, nothing else.
export function cleanKey(key: unknown): string | null {
  if (typeof key !== "string" || !key.startsWith("/") || key.startsWith("//") || key.length > MAX_KEY) return null;
  if (/[\u0000-\u001f\u007f\\#]/.test(key)) return null;
  let path: string;
  try {
    const url = new URL(key, "https://flowplan.invalid");
    if (url.origin !== "https://flowplan.invalid" || url.pathname + url.search !== key) return null;
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (path.split("/").some((part) => part === ".." || part === ".")) return null;
  return key;
}

export function keyAllowed(cache: unknown, key: unknown): boolean {
  const kind = cacheKind(cache);
  const clean = cleanKey(key);
  if (!kind || !clean) return false;
  if (kind === "settings") return clean === MARKER_KEY;
  if (kind === "data") return DATA_KEYS.some((pattern) => pattern.test(clean));
  return STATIC_KEYS.some((pattern) => pattern.test(clean));
}
// What the page may ask for from any cache (the loader's files, pictures).
export const lookupAllowed = (key: unknown) => [SETTINGS_CACHE, DATA_CACHE, "flowplan-static-any"].some((cache) => keyAllowed(cache, key));

// Headers worth keeping; everything else (cookies first) is dropped.
const KEPT_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-disposition",
  "content-language",
  "content-security-policy",
  "cache-control",
  "etag",
  "last-modified",
  "x-content-type-options",
]);
export type Entry = { status: number; statusText: string; headers: [string, string][]; body: string };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
// Bytes of a base64 text (without decoding it).
export const base64Bytes = (text: string) => Math.floor((text.length * 3) / 4) - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0);

const SIGNED_OUT = 'data-signed-out=""';
// The body as Latin-1 text: enough for what is looked for (ASCII markers
// and JSON of ASCII ids), without a text decoder.
function decodeText(base64: string) {
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

export type Refusal = "cache" | "key" | "status" | "body" | "size" | "no-store" | "signed-out" | "marker";
// The entry as the app keeps it, or why it is refused.
export function checkEntry(cache: unknown, key: unknown, input: unknown): { entry: Entry } | { refused: Refusal } {
  const kind = cacheKind(cache);
  if (!kind) return { refused: "cache" };
  if (!keyAllowed(cache, key)) return { refused: "key" };
  const raw = input as Partial<Entry> | null;
  if (!raw || typeof raw !== "object" || raw.status !== 200) return { refused: "status" };
  if (typeof raw.body !== "string" || raw.body.length % 4 !== 0 || !BASE64.test(raw.body)) return { refused: "body" };
  if (base64Bytes(raw.body) > MAX_ENTRY) return { refused: "size" };
  const headers: [string, string][] = [];
  for (const pair of Array.isArray(raw.headers) ? raw.headers : []) {
    if (!Array.isArray(pair) || typeof pair[0] !== "string" || typeof pair[1] !== "string") continue;
    const name = pair[0].toLowerCase().trim();
    if (KEPT_HEADERS.has(name) && pair[1].length <= 8192 && !/[\r\n]/.test(pair[1])) headers.push([name, pair[1]]);
  }
  const control = headers.find(([name]) => name === "cache-control")?.[1] || "";
  // The app's files are cacheable by nature; a no-store one is not ours to keep.
  if (kind === "static" && /(^|,)\s*no-store\b/i.test(control)) return { refused: "no-store" };
  if (kind === "data" && key === "/" && decodeText(raw.body).includes(SIGNED_OUT)) return { refused: "signed-out" };
  if (kind === "settings") {
    try {
      const marker = JSON.parse(decodeText(raw.body)) as { user?: unknown };
      if (!marker || typeof marker.user !== "string" || !marker.user) return { refused: "marker" };
    } catch {
      return { refused: "marker" };
    }
  }
  return { entry: { status: 200, statusText: typeof raw.statusText === "string" ? raw.statusText.slice(0, 100) : "", headers, body: raw.body } };
}

// What the page sees of the device's room: the copy may grow until the
// profile's limit or the disk's reserve, whichever comes first.
export function estimate(usage: number, available: number) {
  const room = Math.max(0, Math.min(MAX_PROFILE - usage, available - DISK_RESERVE));
  return { usage, quota: usage + room };
}
