// The page's side of the offline copy (iOS), part of the bridge script
// (src/bridge-script.ts; runs before the page's own scripts):
//
// - window.FlowplanApp.offline: the caches of the copy, kept by the app
//   (src/offline/store.ts) – what the page's offline module uses instead of
//   Cache Storage (lib/offline-store.ts in Flowplan). Every call is a
//   message to the app, answered with the event "flowplan:offline-answer".
// - The loader: the stored page (src/offline/document.ts) has placeholders
//   instead of its scripts; the loader runs them from the copy as blob:
//   scripts whose src attribute still reads as the original path (Turbopack
//   identifies a chunk by it). Scripts and style sheets the page adds later
//   (parts of the app opened offline) are taken from the copy before they
//   are inserted. In a page loaded online, a script or style sheet of the
//   app that fails to load (the connection went) is taken from the copy
//   once offline use is on – what a service worker would do. Style sheets
//   from the copy are put inline (style-src allows inline styles, not blob:).
//
// Only paths of the instance's own app files (/_next/static, /fonts.css,
// /fonts, /icons) are looked up; the app checks them again.
export const ANSWER_EVENT = "flowplan:offline-answer";
export const REACHED_EVENT = "flowplan:offline-reached";
export const REFRESH_EVENT = "flowplan:offline-refresh";

// A fragment of the bridge script: `post` sends a message to the app.
export function offlineScript() {
  return `
  const offlineWaiting = new Map();
  let offlineSeq = 0;
  addEventListener(${JSON.stringify(ANSWER_EVENT)}, (event) => {
    const answer = event.detail;
    const waiting = answer && offlineWaiting.get(answer.id);
    if (!waiting) return;
    offlineWaiting.delete(answer.id);
    clearTimeout(waiting.timer);
    if (answer.ok) waiting.resolve(answer.value);
    else waiting.reject(new Error(String(answer.error || "failed")));
  });
  const offlineCall = (op, args) => new Promise((resolve, reject) => {
    const id = ++offlineSeq;
    const timer = setTimeout(() => { if (offlineWaiting.delete(id)) reject(new Error("timeout")); }, 120000);
    offlineWaiting.set(id, { resolve, reject, timer });
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: "offline", id, op }, args)));
    } catch (e) {
      // No app to ask (yet): no answer will come.
      offlineWaiting.delete(id);
      clearTimeout(timer);
      reject(e);
    }
  });
  // The stored copy names itself (src/offline/document.ts); known for good
  // once the page is parsed.
  let copyMode = null;
  const isCopy = () => {
    if (copyMode !== null) return copyMode;
    const found = !!document.querySelector('meta[name="flowplan-offline-copy"]');
    if (found || document.readyState !== "loading") copyMode = found;
    return found;
  };
  let reached = false;
  addEventListener(${JSON.stringify(REACHED_EVENT)}, () => { reached = true; });
  const offline = Object.freeze({
    version: 1,
    get copy() { return isCopy(); },
    get unreachable() { return isCopy() && !reached; },
    names: () => offlineCall("names", {}),
    keys: (cache) => offlineCall("keys", { cache: String(cache) }),
    match: (cache, key) => offlineCall("match", { cache: cache == null ? null : String(cache), key: String(key) }),
    put: (cache, key, entry) => offlineCall("put", { cache: String(cache), key: String(key), entry: {
      status: Number(entry && entry.status),
      statusText: String((entry && entry.statusText) || ""),
      headers: Array.isArray(entry && entry.headers) ? entry.headers.map((pair) => [String(pair[0]), String(pair[1])]) : [],
      body: String((entry && entry.body) || ""),
    } }),
    delete: (cache, key) => offlineCall("delete", { cache: String(cache), key: String(key) }),
    remove: (cache) => offlineCall("remove", { cache: String(cache) }),
    estimate: () => offlineCall("estimate", {}),
  });

  // The loader.
  const STATIC = /^\\/(?:_next\\/static\\/|fonts\\.css$|fonts\\/|icons\\/)/;
  const staticPath = (value) => {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin && STATIC.test(url.pathname) ? url.pathname + url.search : null;
    } catch (e) {
      return null;
    }
  };
  const native = {
    appendChild: Node.prototype.appendChild,
    getAttribute: Element.prototype.getAttribute,
    src: Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src"),
  };
  const MIME = { js: "text/javascript", mjs: "text/javascript", css: "text/css", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", svg: "image/svg+xml", png: "image/png", webp: "image/webp", ico: "image/x-icon", wasm: "application/wasm" };
  const typeOf = (path, entry) => {
    for (const pair of entry.headers || []) if (String(pair[0]).toLowerCase() === "content-type") return String(pair[1]).split(";")[0].trim();
    return MIME[(path.split("?")[0].split(".").pop() || "").toLowerCase()] || "application/octet-stream";
  };
  const bytesOf = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };
  const entryOf = (path) => offline.match(null, path).then((entry) => {
    if (!entry) throw new Error("missing");
    return entry;
  });
  // url(…) of a style sheet: from the copy as data: (fonts allow data:).
  const inlineCss = async (css, sheet) => {
    const pattern = /url\\(\\s*(?:"([^"]*)"|'([^']*)'|([^)'"\\s]*))\\s*\\)/g;
    const targets = new Map();
    for (const match of css.matchAll(pattern)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? "";
      if (!raw || targets.has(raw) || /^(data|blob):/i.test(raw) || raw.startsWith("#")) continue;
      const path = staticPath(new URL(raw, location.origin + sheet).href);
      if (!path) continue;
      const entry = await offline.match(null, path).catch(() => null);
      targets.set(raw, entry ? "data:" + typeOf(path, entry) + ";base64," + entry.body : path);
    }
    return css.replace(pattern, (whole, a, b, c) => {
      const target = targets.get(a ?? b ?? c ?? "");
      return target ? 'url("' + target.replace(/"/g, "%22") + '")' : whole;
    });
  };
  // Scripts as blob: addresses, style sheets as text (their fonts inline).
  const loaded = new Map();
  const once = (key, make) => {
    let promise = loaded.get(key);
    if (!promise) {
      promise = make();
      loaded.set(key, promise);
      promise.catch(() => { if (loaded.get(key) === promise) loaded.delete(key); });
    }
    return promise;
  };
  const assetUrl = (path) => once("url " + path, () => entryOf(path).then((entry) => URL.createObjectURL(new Blob([bytesOf(entry.body)], { type: typeOf(path, entry) }))));
  const cssText = (path) => once("css " + path, () => entryOf(path).then((entry) => inlineCss(new TextDecoder().decode(bytesOf(entry.body)), path)));
  // A style sheet of the copy right after its <link> (same place in the
  // cascade), inline: style-src allows that, the link then counts as loaded.
  const styleAfter = (link, path, failed) => cssText(path).then((css) => {
    const style = document.createElement("style");
    style.setAttribute("data-flowplan-href", path);
    if (link.nonce) style.nonce = link.nonce;
    style.textContent = css;
    if (link.isConnected && link.parentNode) link.parentNode.insertBefore(style, link.nextSibling);
    else native.appendChild.call(document.head || document.documentElement, style);
    link.dispatchEvent(new Event("load"));
  }, failed);
  const handled = new WeakSet();
  // A script that runs from the copy: its src reads as the path – the
  // attribute (Turbopack names chunks by it) and the property (Next.js
  // finds its asset prefix by it).
  const fill = (script, path, failed) => {
    handled.add(script);
    const address = new URL(path, location.href).href;
    Object.defineProperty(script, "getAttribute", {
      configurable: true,
      value(name) { return String(name).toLowerCase() === "src" ? path : native.getAttribute.call(this, name); },
    });
    Object.defineProperty(script, "src", {
      configurable: true,
      get() { return address; },
      set(value) { native.src.set.call(this, value); },
    });
    assetUrl(path).then((url) => { native.src.set.call(script, url); }, () => (failed || (() => script.dispatchEvent(new Event("error"))))());
  };
  const startPlaceholders = () => {
    for (const placeholder of document.querySelectorAll("script[data-flowplan-src]")) {
      if (handled.has(placeholder)) continue;
      handled.add(placeholder);
      const path = staticPath(placeholder.getAttribute("data-flowplan-src"));
      if (!path) continue;
      const script = document.createElement("script");
      script.async = true;
      if (placeholder.nonce) script.nonce = placeholder.nonce;
      fill(script, path);
      native.appendChild.call(document.head || document.documentElement, script);
    }
  };
  const watcher = new MutationObserver(startPlaceholders);
  watcher.observe(document, { childList: true, subtree: true });
  addEventListener("DOMContentLoaded", () => { watcher.disconnect(); startPlaceholders(); }, { once: true });

  // Scripts and style sheets the stored page adds: from the copy. They are
  // inserted all the same (React places later style sheets after them),
  // without the address they would load from.
  const take = (node) => {
    if (!node || node.nodeType !== 1 || handled.has(node)) return;
    const tag = node.localName;
    if ((tag !== "script" && tag !== "link") || !isCopy()) return;
    if (tag === "script") {
      const path = staticPath(native.getAttribute.call(node, "src"));
      if (!path) return;
      node.removeAttribute("src");
      node.setAttribute("data-flowplan-src", path);
      fill(node, path);
      return;
    }
    const rel = (node.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    const path = staticPath(node.getAttribute("href"));
    if (!path) return;
    handled.add(node);
    node.removeAttribute("href");
    node.setAttribute("data-flowplan-href", path);
    // A preload counts as done when the copy has the file (React waits for
    // the preload of a style sheet before it shows the page).
    if (!rel.includes("stylesheet")) {
      offlineCall("has", { cache: null, key: path }).then(
        (found) => node.dispatchEvent(new Event(found ? "load" : "error")),
        () => node.dispatchEvent(new Event("error")),
      );
      return;
    }
    // Already in the page (the stored page has its style sheets inline).
    if (document.querySelector('style[data-flowplan-href="' + CSS.escape(path) + '"]')) setTimeout(() => node.dispatchEvent(new Event("load")));
    else styleAfter(node, path, () => node.dispatchEvent(new Event("error")));
  };
  const wrap = (target, name, single) => {
    const original = target && target[name];
    if (typeof original !== "function") return;
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value: single
        ? function (node, ...rest) { take(node); return original.call(this, node, ...rest); }
        : function (...nodes) { nodes.forEach(take); return original.apply(this, nodes); },
    });
  };
  wrap(Node.prototype, "appendChild", true);
  wrap(Node.prototype, "insertBefore", true);
  for (const target of [Element.prototype, CharacterData.prototype, DocumentFragment.prototype])
    for (const name of ["append", "prepend", "before", "after", "replaceWith"]) if (Object.prototype.hasOwnProperty.call(target, name)) wrap(target, name, false);

  // A page loaded online whose app file fails to load: from the copy, when
  // offline use is on (asked once, again after the page switched it).
  let offlineEnabled = null;
  const askEnabled = () => offlineCall("state", {}).then((state) => (offlineEnabled = !!(state && state.enabled)), () => false);
  askEnabled();
  addEventListener("flowplan:offline-changed", () => { offlineEnabled = null; });
  addEventListener("error", (event) => {
    const element = event.target;
    if (!element || element.nodeType !== 1 || handled.has(element) || (offlineEnabled === false && !isCopy())) return;
    const tag = element.localName;
    const sheet = tag === "link" && /(^|\\s)stylesheet(\\s|$)/i.test(element.getAttribute("rel") || "");
    if (tag !== "script" && !sheet) return;
    const path = staticPath(native.getAttribute.call(element, tag === "script" ? "src" : "href"));
    if (!path) return;
    // The page hears of the failure only if the copy lacks the file too.
    event.stopImmediatePropagation();
    handled.add(element);
    const failed = () => element.dispatchEvent(new Event("error"));
    const fromCopy = () => {
      if (sheet) return void styleAfter(element, path, failed);
      const script = document.createElement("script");
      script.async = true;
      if (element.nonce) script.nonce = element.nonce;
      fill(script, path, failed);
      native.appendChild.call(document.head || document.documentElement, script);
    };
    if (offlineEnabled || isCopy()) fromCopy();
    else askEnabled().then((on) => (on ? fromCopy() : failed()));
  }, true);`;
}

// The app's answer to one call of the page.
export function answerScript(id: number, answer: { ok: true; value: unknown } | { ok: false; error: string }) {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(ANSWER_EVENT)}, { detail: ${JSON.stringify({ id, ...answer })} })); true;`;
}

// The instance answers again: the stored page counts as online, and the
// page hears it ("online" re-reads the state; lib/offline-store.ts).
export const reachedScript = `window.dispatchEvent(new Event(${JSON.stringify(REACHED_EVENT)})); window.dispatchEvent(new Event("online")); true;`;

// Asks the page to bring its copy up to date (components/offline-refresh.tsx).
export const refreshScript = `window.dispatchEvent(new Event(${JSON.stringify(REFRESH_EVENT)})); true;`;

// Back online on the stored page: the app loads the live page once nobody
// is typing (what is typed offline is kept by the page – IndexedDB and the
// queue of record changes – and sent after the reload).
export const returnScript = `(() => {
  const busy = () => {
    const active = document.activeElement;
    return !!active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
  };
  const check = () => {
    if (busy() || document.visibilityState !== "visible") return void setTimeout(check, 3000);
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "offlineReturn" })); } catch (e) {}
  };
  setTimeout(check, 4000);
})();
true;`;
