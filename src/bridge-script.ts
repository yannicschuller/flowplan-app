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
//   "flowplan:ink-recognized"; on iOS with the on-device AI module
//   (modules/flowplan-ai) window.FlowplanApp.ai – Apple's on-device model
//   for the page's light AI actions (src/ai-bridge.ts), answering with the
//   event "flowplan:ai"; and it opens the app's profiles (openProfiles: switch
//   to or add another instance, or – for a profile never signed in – change
//   its address; the sign-in pages' "Other server?", #69), with the page's
//   path to come back to; and it starts the sign-in with passkeys or SSO
//   (signIn, #109), answering with the event "flowplan:sign-in";
// - on iOS the offline copy: window.FlowplanApp.offline, the caches the
//   page's offline module fills, kept by the app, and the loader that runs
//   the stored page without a connection (src/offline/loader.ts);
// - the colours at the page's top and bottom edge, so status bar and home
//   indicator / navigation bar run into the page's header and footer;
// - Android: the safe areas the web view reports, and whether the page keeps
//   clear of the system bars itself (src/safe-areas.ts; the attribute
//   data-app-safe-areas="page" on <html>) or the app does;
// - no zooming into form fields on iOS (it zooms into text below 16px).
import { offlineScript } from "./offline/loader";

export type PageMessage =
  // insets: what the web view reports as env(safe-area-inset-*); safeAreas:
  // who keeps the page clear of the system bars as the page has it now
  // (both Android only, src/safe-areas.ts).
  | { type: "edges"; top: string; bottom: string; scrolls: boolean; atTop: boolean; atBottom: boolean; background: string; cover?: boolean; insets?: unknown; safeAreas?: string }
  | { type: "refresh" }
  | { type: "saveFile"; name: string; base64: string; mime: string }
  | { type: "haptic"; kind: string }
  | { type: "openSettings" }
  // The app's profiles from the sign-in pages (#69): the path of the page
  // to come back to (profile-picker.ts profilesRequest checks it).
  | { type: "openProfiles"; path?: string }
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
  // "Mit Passkey anmelden" / "Mit SSO anmelden" (#109): the sign-in through
  // the system's sheet, without the detour of a navigation the app has to
  // catch; the answer is the event "flowplan:sign-in" (sign-in.ts).
  | { type: "signIn"; via?: string | null }
  | { type: "voiceNote"; id: string; summarize: boolean; serverTranscription: boolean }
  // The page's keyboard shortcuts for the key commands (ipad.ts checks the
  // list), and a page of the instance for a new window (iPad, iPhone Duo).
  | { type: "shortcuts"; list: unknown }
  | { type: "openWindow"; url: string }
  // Handwriting to read (ink-bridge.ts inkRequest checks it again).
  | { type: "recognizeInk"; id: string; width: number; height: number; strokes: unknown }
  // A call of the on-device AI (ai-bridge.ts aiCall checks it).
  | { type: "ai"; op: string; id: string; request?: unknown }
  // A call to the offline copy (src/offline/messages.ts checks it), and the
  // stored page that may give way to the live one (returnScript).
  | { type: "offline"; id: number; op: string; cache?: string | null; key?: string; entry?: unknown }
  | { type: "offlineReturn" }
  // The page's files did not load: a copy of an older build (src/offline/stale.ts).
  | { type: "staleCopy"; build?: unknown; clear?: unknown; copy?: unknown };

export function parsePageMessage(data: string): PageMessage | null {
  try {
    const message = JSON.parse(data) as PageMessage;
    if (!message || typeof message !== "object" || typeof message.type !== "string") return null;
    // Without an id there is no one to answer (ink-bridge.ts checks the rest).
    if ((message.type === "recognizeInk" || message.type === "ai") && typeof (message as { id?: unknown }).id !== "string") return null;
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
  // iOS: Apple's on-device model (modules/flowplan-ai; availability() says
  // whether it runs on this device).
  ai?: boolean;
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
  }${
    options.ai
      ? `
  // On-device AI (src/ai-bridge.ts): the contract of lib/ai/device.ts in
  // Flowplan, the same as window.FlowplanDesktop.ai. Calls wait for the
  // event "flowplan:ai" { id, kind: "done" | "chunk" | "error", … }; one
  // call per id at a time.
  const aiPending = new Map();
  let aiCount = 0;
  const aiError = (code, message) => Object.assign(new Error(String(message || code)), { code: String(code) });
  addEventListener("flowplan:ai", (event) => {
    const detail = event.detail || {};
    const entry = aiPending.get(detail.id);
    if (!entry) return;
    if (detail.kind === "chunk") {
      if (entry.onChunk && typeof detail.text === "string") try { entry.onChunk(detail.text); } catch (e) {}
      return;
    }
    aiPending.delete(detail.id);
    if (detail.kind === "error") entry.reject(aiError(detail.code || "error", detail.message));
    else entry.resolve(detail.result);
  });
  const aiCall = (op, id, request, onChunk) => new Promise((resolve, reject) => {
    if (!id || aiPending.has(id)) return reject(aiError(id ? "busy" : "error", id ? "busy" : "id"));
    aiPending.set(id, { resolve, reject, onChunk: typeof onChunk === "function" ? onChunk : null });
    post({ type: "ai", op, id, request });
  });
  const aiId = (request) => String((request && request.id) || "").slice(0, 100);
  const ai = Object.freeze({
    version: 1,
    availability: () => aiCall("availability", "#a" + ++aiCount, undefined),
    generate: (request) => aiCall("generate", aiId(request), request),
    stream: (request, onChunk) => aiCall("stream", aiId(request), request && { ...request, schema: undefined }, onChunk),
    cancel: (id) => post({ type: "ai", op: "cancel", id: String(id || "").slice(0, 100) }),
  });`
      : ""
  }
  window.FlowplanApp = Object.freeze({
    platform: ${JSON.stringify(options.platform)},
    version: ${JSON.stringify(options.version)},
    refresh: () => post({ type: "refresh" }),
    saveFile: (name, base64, mime) => post({ type: "saveFile", name: String(name), base64: String(base64), mime: String(mime || "") }),
    haptic: (kind) => post({ type: "haptic", kind: String(kind || "light") }),
    openSettings: () => post({ type: "openSettings" }),
    openProfiles: () => post({ type: "openProfiles", path: String(location.pathname || "") + String(location.search || "") + String(location.hash || "") }),
    backState: (canGoBack) => post({ type: "backState", canGoBack: canGoBack === true }),${
      options.scanner
        ? `
    scanDocument: (target) => post({ type: "scanDocument", pageId: String((target && target.pageId) || ""), rowId: target && target.rowId ? String(target.rowId) : undefined }),`
        : ""
    }${options.inkRecognition ? `\n    recognizeInk,` : ""}${options.ai ? `\n    ai,` : ""}
    openInBrowser: (url) => post({ type: "openInBrowser", url: String(url) }),
    signIn: (via) => post({ type: "signIn", via: via === "sso" ? "sso" : null }),
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
${options.platform === "android" ? androidSafeAreas : ""}
  // Reported once per animation frame at most, and only when something
  // changed: elementFromPoint ×14 is the most expensive thing the app does.
  let frame = 0, last = "";
  const report = () => {${options.platform === "android" ? "\n    showSafeAreas();" : ""}
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
      cover: /viewport-fit\s*=\s*cover/.test(document.querySelector('meta[name="viewport"]')?.content || ""),${
        options.platform === "android" ? `
      insets: safeInsets(),
      safeAreas,` : ""
      }
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

// Android: who keeps the page clear of the system bars (src/safe-areas.ts).
// The page's own insets count only with data-app-safe-areas="page" on <html>
// (app/globals.css in Flowplan; an older instance ignores the attribute). The
// app's last word holds for the next pages of this web view as well, so they
// start the way the app shows them. The probe hangs at <html>, not in <body>,
// whose children are watched for changes (measuring would report again).
const androidSafeAreas = `
  const SAFE_AREAS = "flowplan-app-safe-areas";
  let safeAreas = "app";
  try { if (sessionStorage.getItem(SAFE_AREAS) === "page") safeAreas = "page"; } catch (e) {}
  // Again with every report: before the page's content the document may not
  // have its <html> yet, and the app says nothing new when its decision
  // stays the same.
  const showSafeAreas = () => {
    try {
      const root = document.documentElement;
      if (!root || root.hasAttribute("data-app-safe-areas") === (safeAreas === "page")) return;
      if (safeAreas === "page") root.setAttribute("data-app-safe-areas", "page");
      else root.removeAttribute("data-app-safe-areas");
    } catch (e) {}
  };
  showSafeAreas();
  addEventListener("flowplan:safe-areas", (event) => {
    safeAreas = event.detail === "page" ? "page" : "app";
    try { sessionStorage.setItem(SAFE_AREAS, safeAreas); } catch (e) {}
    showSafeAreas();
  });
  // Not before the page's viewport (viewport-fit=cover) is known.
  const safeInsets = () => {
    const root = document.documentElement;
    if (!root || document.readyState === "loading") return null;
    try {
      const probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
      root.appendChild(probe);
      const style = getComputedStyle(probe);
      const px = (value) => Math.round(parseFloat(value) || 0);
      const insets = { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) };
      probe.remove();
      return insets;
    } catch (e) {
      return null;
    }
  };`;

// Who keeps the page clear of the system bars from now on (Android).
export function safeAreasScript(mode: "app" | "page") {
  return `window.dispatchEvent(new CustomEvent("flowplan:safe-areas", { detail: ${JSON.stringify(mode === "page" ? "page" : "app")} })); true;`;
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

// The predictive back gesture's progress for the page (Android; src/back.ts
// parseBackProgress has checked it). Instances without backProgress ignore it.
export function backProgressScript(event: { phase: string; progress: number; edge: string }) {
  return `(() => {
  const nav = window.FlowplanNavigation;
  if (nav && typeof nav.backProgress === "function") {
    try { nav.backProgress(${JSON.stringify(event.phase)}, ${Number(event.progress) || 0}, ${JSON.stringify(event.edge === "right" ? "right" : "left")}); } catch (e) {}
  }
})();
true;`;
}
