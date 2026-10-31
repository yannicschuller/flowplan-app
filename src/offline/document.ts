// The stored copy as a page the web view can open without a connection
// (iOS). The app's page ("/" in flowplan-data-v1) is loaded with the
// instance's address as its base (react-native-webview's html source,
// WKWebView loadHTMLString): the page keeps the instance's origin, so its
// sign-in cookie, IndexedDB (documents) and localStorage (record changes
// made offline) are the ones it has online. What it would load from the
// network is taken from the copy instead:
//
// - the instance's Content-Security-Policy, which came as a header, becomes
//   a <meta> at the top of <head> (frame-ancestors, sandbox and reporting
//   are not allowed there); blob: is added for scripts, which only the
//   page's own scripts can create (the loader, src/offline/loader.ts) and
//   which 'strict-dynamic' allows anyway;
// - <script src="/_next/static/…"> become empty placeholders the loader
//   (src/offline/loader.ts) fills from the copy – Turbopack identifies a
//   chunk by its script's src attribute, which the loader keeps;
// - style sheets of the app's files and fonts.css follow their (inert)
//   <link> inline, the fonts and pictures they name as data: addresses
//   (font-src allows data:);
// - preloads, the manifest and icons keep their tags without an address:
//   React hydrates against every tag it rendered, so none is removed.
export type Lookup = (path: string) => Promise<{ body: string; type: string } | null>;

const STATIC_PATH = /^\/(?:_next\/static\/[^"'?#\s]+|fonts\.css|fonts\/[^"'?#\s/]+|icons\/[^"'?#\s/]+)(?:\?[^"'#\s]*)?$/;
export const COPY_META = '<meta name="flowplan-offline-copy" content="1">';

// &amp; last, so "&amp;lt;" stays the text "&lt;".
const unescapeAttr = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The attributes of a start tag (React writes them double-quoted; bare and
// single-quoted ones are read as well).
export function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  const body = tag.replace(/^<[a-zA-Z]+/, "").replace(/\/?>$/, "");
  for (const match of body.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
    result.set(match[1].toLowerCase(), unescapeAttr(match[2] ?? match[3] ?? match[4] ?? ""));
  return result;
}

// A same-origin path of the app's files (the copy's static part), or null.
export function staticPath(value: string | undefined, origin = "https://flowplan.invalid"): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin + "/");
    if (url.origin !== origin) return null;
    const path = url.pathname + url.search;
    return STATIC_PATH.test(path) ? path : null;
  } catch {
    return null;
  }
}

// The policy for the copy: the instance's, as far as a <meta> can carry it.
export function metaPolicy(header: string | null | undefined): string | null {
  if (!header) return null;
  const directives = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(frame-ancestors|report-uri|report-to|sandbox)\b/i.test(part))
    .map((part) => (/^script-src\s/i.test(part) && !/\sblob:/.test(part) ? `${part} blob:` : part));
  return directives.length ? directives.join("; ") : null;
}

const MIME: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
export const mimeOf = (path: string, stored = "") =>
  stored.split(";")[0].trim() || MIME[(path.split("?")[0].split(".").pop() || "").toLowerCase()] || "application/octet-stream";

// url(…) in a style sheet, relative to the sheet: what the copy holds
// becomes a data: address, the rest an absolute path (it loads once there
// is a connection; fonts fall back to the next format or font).
export async function inlineCss(css: string, sheet: string, lookup: Lookup): Promise<string> {
  const refs = new Map<string, string>();
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/g;
  for (const match of css.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    if (!raw || /^(data|blob):/i.test(raw) || raw.startsWith("#")) continue;
    let absolute: URL;
    try {
      absolute = new URL(raw, "https://flowplan.invalid" + sheet);
    } catch {
      continue;
    }
    if (absolute.origin !== "https://flowplan.invalid") continue;
    const path = absolute.pathname + absolute.search;
    if (refs.has(raw)) continue;
    const found = staticPath(path) ? await lookup(path) : null;
    refs.set(raw, found ? `data:${mimeOf(path, found.type)};base64,${found.body}` : path + absolute.hash);
  }
  return css.replace(pattern, (whole, a: string | undefined, b: string | undefined, c: string | undefined) => {
    const raw = a ?? b ?? c ?? "";
    const target = refs.get(raw);
    return target ? `url("${target.replace(/"/g, "%22")}")` : whole;
  });
}

// UTF-8 bytes (base64) as text.
export function utf8(base64: string): string {
  const binary = atob(base64);
  let out = "";
  for (let i = 0; i < binary.length; ) {
    const a = binary.charCodeAt(i++);
    if (a < 0x80) out += String.fromCharCode(a);
    else if (a >= 0xc0 && a < 0xe0) out += String.fromCharCode(((a & 0x1f) << 6) | (binary.charCodeAt(i++) & 0x3f));
    else if (a >= 0xe0 && a < 0xf0) out += String.fromCharCode(((a & 0x0f) << 12) | ((binary.charCodeAt(i++) & 0x3f) << 6) | (binary.charCodeAt(i++) & 0x3f));
    else if (a >= 0xf0) {
      const code = ((a & 0x07) << 18) | ((binary.charCodeAt(i++) & 0x3f) << 12) | ((binary.charCodeAt(i++) & 0x3f) << 6) | (binary.charCodeAt(i++) & 0x3f);
      out += String.fromCodePoint(code);
    } else out += "�";
  }
  return out;
}

export type CopyDocument = { html: string; scripts: string[]; styles: string[] };

// The page of the copy, or null when it cannot work (the sign-in page, a
// script or style sheet of the page missing from the copy).
export async function offlineDocument(html: string, policy: string | null | undefined, lookup: Lookup): Promise<CopyDocument | null> {
  if (!/<head[\s>]/i.test(html) || html.includes('data-signed-out=""')) return null;
  const scripts: string[] = [];
  const styles: string[] = [];
  let missing = false;
  const replacements = new Map<string, string>();

  // React hydrates the page against these tags: none is removed, each is
  // kept in place without the address it would load (src → data-flowplan-src,
  // href → data-flowplan-href); what the copy adds comes after it.
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, "i");
  const SRC = attr("src"),
    HREF = attr("href");

  // Scripts with a src: placeholders the loader fills (src/offline/loader.ts).
  for (const match of html.matchAll(/<script\b[^>]*>\s*<\/script>/gi)) {
    const tag = match[0];
    const open = tag.slice(0, tag.indexOf(">") + 1);
    const attrs = attributes(open);
    if (!attrs.has("src")) continue;
    // Browsers with modules never run these (polyfills).
    if (attrs.has("nomodule")) {
      replacements.set(tag, tag.replace(SRC, ""));
      continue;
    }
    const path = staticPath(attrs.get("src"));
    if (!path) continue;
    if (!(await lookup(path))) missing = true;
    scripts.push(path);
    replacements.set(tag, tag.replace(SRC, ` data-flowplan-src="${escapeAttr(path)}"`).replace(/\sasync(=("[^"]*"|'[^']*'))?/i, ""));
  }
  if (missing) return null;

  const NOTHING_OFFLINE = ["preload", "modulepreload", "prefetch", "preconnect", "dns-prefetch", "manifest", "icon", "apple-touch-icon"];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const attrs = attributes(tag);
    const rel = (attrs.get("rel") || "").toLowerCase().split(/\s+/);
    const href = attrs.get("href");
    if (!href) continue;
    const neutral = tag.replace(HREF, ` data-flowplan-href="${escapeAttr(href)}"`);
    if (rel.includes("stylesheet")) {
      const path = staticPath(href);
      if (!path) continue;
      const found = await lookup(path);
      if (!found) {
        // A style sheet of the app missing from the copy (one of another
        // build): the page would show without its styles (#61 in Flowplan).
        // Only fonts.css may be missing – the fonts fall back.
        if (path.startsWith("/_next/static/")) return null;
        replacements.set(tag, neutral);
        continue;
      }
      styles.push(path);
      const css = (await inlineCss(utf8(found.body), path, lookup)).replace(/<\/style/gi, "<\\/style");
      const keep = ["nonce", "media"].filter((name) => attrs.has(name)).map((name) => ` ${name}="${escapeAttr(attrs.get(name)!)}"`);
      replacements.set(tag, `${neutral}<style data-flowplan-href="${escapeAttr(path)}"${keep.join("")}>${css}</style>`);
    } else if (rel.some((r) => NOTHING_OFFLINE.includes(r))) replacements.set(tag, neutral);
  }

  let out = html;
  for (const [from, to] of replacements) out = out.split(from).join(to);
  const meta = metaPolicy(policy);
  const head = `${COPY_META}${meta ? `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(meta)}">` : ""}`;
  // After <meta charset> when it opens the head, before everything else.
  out = out.replace(/<head(?:\s[^>]*)?>(\s*<meta\s+charset=[^>]*>)?/i, (tag) => tag + head);
  return { html: out, scripts, styles };
}
