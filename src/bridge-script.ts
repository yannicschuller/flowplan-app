// What the app adds to the instance's pages (and only to those – the script
// checks the origin, the app checks it again for every message):
//
// - window.FlowplanApp: the page tells the app about changes (widgets, badge,
//   Live Activity), hands it files for the share sheet, asks for a haptic
//   tap or the app settings, lists its keyboard shortcuts and – on an iPad
//   or the inner display of iPhone Duo – opens a page in a new window
//   (openWindow is there only while the window can open one); on iPhone and
//   iPad it opens the document scanner for the page (screens/Scan.tsx),
//   opens an address of the instance in the browser (a configuration
//   profile installs only from Safari) and has the app record a voice
//   note (src/voice-bridge.ts; lib/native-app.ts in Flowplan); where the
//   device can (iOS, Vision) it reads the handwriting of the page's ink
//   (recognizeInk, src/ink-bridge.ts) and answers with the event
//   "flowplan:ink-recognized";
// - on iOS the offline copy: window.FlowplanApp.offline, the caches the
//   page's offline module fills, kept by the app, and the loader that runs
//   the stored page without a connection (src/offline/loader.ts);
// - the colours at the page's top and bottom edge, so status bar and home
//   indicator / navigation bar run into the page's header and footer;
// - no zooming into form fields on iOS (it zooms into text below 16px).
import { offlineScript } from "./offline/loader";

export type PageMessage =
  | { type: "edges"; top: string; bottom: string; scrolls: boolean; atTop: boolean; atBottom: boolean; background: string; cover?: boolean }
  | { type: "refresh" }
  | { type: "saveFile"; name: string; base64: string; mime: string }
  | { type: "haptic"; kind: string }
  | { type: "openSettings" }
  | { type: "registered"; status: number; body: unknown }
  | { type: "downloadFailed"; name: string }
  | { type: "signedOut" }
  // Whether "back" would do something in the page (lib/app-back.ts in
  // Flowplan), and what the page did when asked (null: no answer, an
  // instance from before window.FlowplanNavigation).
  | { type: "backState"; canGoBack: boolean }
  | { type: "back"; handled: boolean | null }
  // "Scan document" in the page: its page (and record), checked again by
  // the app (capture.ts pageScanRequest).
  | { type: "scanDocument"; pageId: string; rowId?: string }
  | { type: "openInBrowser"; url: string }
  | { type: "voiceNote"; id: string; summarize: boolean; serverTranscription: boolean }
  // The page's keyboard shortcuts for the key commands (ipad.ts checks the
  // list), and a page of the instance for a new window (iPad, iPhone Duo).
  | { type: "shortcuts"; list: unknown }
  | { type: "openWindow"; url: string }
  // Handwriting to read (ink-bridge.ts inkRequest checks it again).
  | { type: "recognizeInk"; id: string; width: number; height: number; strokes: unknown }
  // A call to the offline copy (src/offline/messages.ts checks it), and the
  // stored page that may give way to the live one (returnScript).
  | { type: "offline"; id: number; op: string; cache?: string | null; key?: string; entry?: unknown }
  | { type: "offlineReturn" };

export function parsePageMessage(data: string): PageMessage | null {
  try {
    const message = JSON.parse(data) as PageMessage;
    if (!message || typeof message !== "object" || typeof message.type !== "string") return null;
    // Without an id there is no one to answer (ink-bridge.ts checks the rest).
    if (message.type === "recognizeInk" && typeof (message as { id?: unknown }).id !== "string") return null;
    return message;
  } catch {
    return null;
  }
}

export function bridgeScript(options: {
  server: string;
  platform: "ios" | "android";
  version: string;
  scanner?: boolean;
  windows?: boolean;
  inkRecognition?: boolean;
  // iOS: the app keeps the offline copy (src/offline/loader.ts).
  offline?: boolean;
}) {
  return `(() => {
  if (window.top !== window || location.origin !== ${JSON.stringify(options.server)} || window.FlowplanApp) return;
  const post = (message) => {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  };${options.offline ? offlineScript() : ""}${
    options.windows
      ? `
  // Whether this window can open another one now (windowsScript: the app
  // tells after loading and after every resize – iPhone Duo can on the inner
  // display only). The page asks for FlowplanApp.openWindow when it shows
  // its menu, and finds it only then.
  let windowsOpen = false;
  addEventListener("flowplan:windows", (event) => { windowsOpen = event.detail === true; });
  const openWindow = (url) => post({ type: "openWindow", url: String(url) });`
      : ""
  }${
    options.inkRecognition
      ? `
  // Handwriting to read: { id, width, height, strokes: [{ points: [[x, y]] }] }
  // in points, origin top left. Only finite points, at most 5000 strokes and
  // 200000 points, two decimals; the answer is the event
  // "flowplan:ink-recognized" with { id, text, lines } (or error).
  const recognizeInk = (request) => {
    const source = request && Array.isArray(request.strokes) ? request.strokes : [];
    const strokes = [];
    let count = 0;
    for (const stroke of source) {
      if (strokes.length >= 5000 || count >= 200000) break;
      const points = [];
      for (const point of (stroke && Array.isArray(stroke.points) ? stroke.points : [])) {
        if (count >= 200000) break;
        const x = point && point[0], y = point && point[1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
        count++;
      }
      if (points.length) strokes.push({ points });
    }
    post({ type: "recognizeInk", id: String((request && request.id) || "").slice(0, 200), width: request ? Number(request.width ?? NaN) : NaN, height: request ? Number(request.height ?? NaN) : NaN, strokes });
  };`
      : ""
  }
  window.FlowplanApp = Object.freeze({
    platform: ${JSON.stringify(options.platform)},
    version: ${JSON.stringify(options.version)},
    refresh: () => post({ type: "refresh" }),
    saveFile: (name, base64, mime) => post({ type: "saveFile", name: String(name), base64: String(base64), mime: String(mime || "") }),
    haptic: (kind) => post({ type: "haptic", kind: String(kind || "light") }),
    openSettings: () => post({ type: "openSettings" }),
    backState: (canGoBack) => post({ type: "backState", canGoBack: canGoBack === true }),${
      options.scanner
        ? `
    scanDocument: (target) => post({ type: "scanDocument", pageId: String((target && target.pageId) || ""), rowId: target && target.rowId ? String(target.rowId) : undefined }),`
        : ""
    }${options.inkRecognition ? `\n    recognizeInk,` : ""}
    openInBrowser: (url) => post({ type: "openInBrowser", url: String(url) }),
    recordVoiceNote: (request) => post({ type: "voiceNote", id: String(request && request.id), summarize: !!(request && request.summarize), serverTranscription: !!(request && request.serverTranscription) }),
    shortcuts: (list) => post({ type: "shortcuts", list: Array.isArray(list) ? list.slice(0, 40) : [] }),${options.offline ? `\n    offline,` : ""}${
      options.windows ? `\n    get openWindow() { return windowsOpen ? openWindow : undefined; },` : ""
    }
  });
  // Vibrations of the page become haptic taps.
  try {
    navigator.vibrate = () => { post({ type: "haptic", kind: "light" }); return true; };
  } catch (e) {}
  ${
    options.platform === "ios"
      ? `const style = document.createElement("style");
  style.textContent = "input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{font-size:max(16px,1em)!important}";
  const addStyle = () => (document.head || document.documentElement).append(style);
  document.documentElement ? addStyle() : addEventListener("DOMContentLoaded", addStyle);`
      : ""
  }
  const opaque = (color) => color && color !== "transparent" && !color.replace(/ /g, "").endsWith(",0)") ? color : "";
  const background = (el) => {
    for (; el && el.nodeType === 1; el = el.parentElement) {
      const color = opaque(getComputedStyle(el).backgroundColor);
      if (color) return color;
    }
    return "";
  };
  // The colour most of a row of points has (icons and text do not count).
  const row = (y) => {
    const counts = new Map();
    for (const share of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const color = background(document.elementFromPoint(innerWidth * share, y));
      if (color) counts.set(color, (counts.get(color) || 0) + 1);
    }
    let best = "", most = 0;
    for (const [color, count] of counts) if (count > most) { best = color; most = count; }
    return best;
  };
  // Reported once per animation frame at most, and only when something
  // changed: elementFromPoint ×14 is the most expensive thing the app does.
  let frame = 0, last = "";
  const report = () => {
    const page = document.scrollingElement || document.documentElement;
    const base = opaque(getComputedStyle(document.body || page).backgroundColor) || opaque(getComputedStyle(page).backgroundColor);
    const message = JSON.stringify({
      type: "edges",
      top: row(1) || base,
      bottom: row(innerHeight - 2) || base,
      scrolls: page.scrollHeight > innerHeight + 2,
      atTop: page.scrollTop <= 1,
      atBottom: page.scrollTop + innerHeight >= page.scrollHeight - 2,
      background: base,
      // The page keeps clear of the system bars itself (viewport-fit=cover):
      // the app shows it full screen.
      cover: /viewport-fit\s*=\s*cover/.test(document.querySelector('meta[name="viewport"]')?.content || ""),
    });
    if (message === last) return;
    last = message;
    try { window.ReactNativeWebView.postMessage(message); } catch (e) {}
  };
  const changed = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; report(); });
  };
  for (const type of ["scroll", "resize", "hashchange", "popstate", "transitionend", "animationend", "click", "touchend", "keyup", "load", "pageshow"])
    addEventListener(type, changed, { capture: true, passive: true });
  const watch = () => {
    new MutationObserver(changed).observe(document.documentElement, { attributes: true });
    if (document.body) new MutationObserver(changed).observe(document.body, { attributes: true, childList: true });
  };
  document.body ? watch() : addEventListener("DOMContentLoaded", watch);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", changed);
  changed();
})();
true;`;
}

// Registers this installation for the page's session (lib/mobile-devices.ts
// in Flowplan); the answer comes back as a "registered" message. Instances
// without the endpoint answer 404 – the app then simply has no widgets data.
export function registerScript(body: Record<string, unknown>) {
  return `(async () => {
  try {
    const response = await fetch("/api/mobile/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(${JSON.stringify(body)}),
    });
    const answer = await response.json().catch(() => null);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "registered", status: response.status, body: answer }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "registered", status: 0, body: null }));
  }
})();
true;`;
}

// Whether the window can open another one now (bridgeScript's openWindow).
export function windowsScript(available: boolean) {
  return `window.dispatchEvent(new CustomEvent("flowplan:windows", { detail: ${available === true} })); true;`;
}

// Apple Pencil double-tap or squeeze (iPad) for the whiteboard and the image
// markup (lib/stylus.ts in Flowplan).
export function pencilScript(action: { gesture: string; preferred: string }) {
  const detail = { gesture: action.gesture === "squeeze" ? "squeeze" : "tap", preferred: String(action.preferred) };
  return `window.dispatchEvent(new CustomEvent("flowplan:pencil", { detail: ${JSON.stringify(detail)} })); true;`;
}

// Signs the web view out of the instance (Settings → forget the server).
export const signOutScript = `fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
  .catch(() => {})
  .then(() => window.ReactNativeWebView.postMessage(JSON.stringify({ type: "signedOut" })));
true;`;

export function unregisterScript(installationId: string) {
  return `fetch("/api/mobile/unregister", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify({ installationId })}) }).catch(() => {}); true;`;
}

// A download the web view cannot do itself (iOS): the page fetches it with its
// cookies and hands it to the share sheet.
export function downloadScript(url: string) {
  return `(async () => {
  const name = decodeURIComponent((${JSON.stringify(url)}.split("?")[0].split("/").pop()) || "download");
  try {
    const response = await fetch(${JSON.stringify(url)}, { credentials: "same-origin" });
    if (!response.ok) throw new Error(String(response.status));
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename\\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
    const file = match ? decodeURIComponent(match[1] || match[2]) : name;
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = () => window.FlowplanApp.saveFile(file, String(reader.result).split(",")[1] || "", blob.type);
    reader.readAsDataURL(blob);
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "downloadFailed", name }));
  }
})();
true;`;
}

// "Back" (iOS edge swipe, Android's back): the page goes one step back the
// way its interface is built and says whether it did (lib/app-back.ts in
// Flowplan). Instances without it answer null; the app then uses the web
// view's history.
export const backScript = `(() => {
  const nav = window.FlowplanNavigation;
  let handled = null;
  if (nav && typeof nav.back === "function") {
    try { handled = nav.back() === true; } catch (e) { handled = false; }
  }
  try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "back", handled })); } catch (e) {}
})();
true;`;
