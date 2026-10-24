// What the app adds to the instance's pages (and only to those – the script
// checks the origin, the app checks it again for every message):
//
// - window.FlowplanApp: the page tells the app about changes (widgets, badge,
//   Live Activity), hands it files for the share sheet, asks for a haptic
//   tap or the app settings, opens an address of the instance in the
//   browser (a configuration profile installs only from Safari) and has the
//   app record a voice note (src/voice-bridge.ts; lib/native-app.ts in
//   Flowplan);
// - the colours at the page's top and bottom edge, so status bar and home
//   indicator / navigation bar run into the page's header and footer;
// - no zooming into form fields on iOS (it zooms into text below 16px).
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
  | { type: "openInBrowser"; url: string }
  | { type: "voiceNote"; id: string; summarize: boolean; serverTranscription: boolean };

export function parsePageMessage(data: string): PageMessage | null {
  try {
    const message = JSON.parse(data) as PageMessage;
    return message && typeof message.type === "string" ? message : null;
  } catch {
    return null;
  }
}

export function bridgeScript(options: { server: string; platform: "ios" | "android"; version: string }) {
  return `(() => {
  if (window.top !== window || location.origin !== ${JSON.stringify(options.server)} || window.FlowplanApp) return;
  const post = (message) => {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {}
  };
  window.FlowplanApp = Object.freeze({
    platform: ${JSON.stringify(options.platform)},
    version: ${JSON.stringify(options.version)},
    refresh: () => post({ type: "refresh" }),
    saveFile: (name, base64, mime) => post({ type: "saveFile", name: String(name), base64: String(base64), mime: String(mime || "") }),
    haptic: (kind) => post({ type: "haptic", kind: String(kind || "light") }),
    openSettings: () => post({ type: "openSettings" }),
    backState: (canGoBack) => post({ type: "backState", canGoBack: canGoBack === true }),
    openInBrowser: (url) => post({ type: "openInBrowser", url: String(url) }),
    recordVoiceNote: (request) => post({ type: "voiceNote", id: String(request && request.id), summarize: !!(request && request.summarize), serverTranscription: !!(request && request.serverTranscription) }),
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
