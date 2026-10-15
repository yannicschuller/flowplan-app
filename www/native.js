// The bridge to the native shell (FlowplanShellPlugin on iOS and Android).
// Only these local pages may use it; the Flowplan web app runs without it.
// In a plain browser (previews, screenshots) a stand-in keeps the pages
// working: the address lives in localStorage and HTTP goes through fetch.
const capacitor = globalThis.Capacitor;
export const isNative = Boolean(capacitor?.isNativePlatform?.());

const PREVIEW_KEY = "flowplan-preview-server";

export function shell(method, options = {}) {
  if (isNative) return capacitor.nativePromise("FlowplanShell", method, options);
  return preview[method](options);
}

// GET without following redirects; the native client also ignores CORS, which
// a Flowplan instance does not need to allow for the app.
export async function request({ url }) {
  if (isNative)
    return capacitor.nativePromise("CapacitorHttp", "request", {
      url,
      method: "GET",
      headers: { Accept: "application/json" },
      responseType: "json",
      disableRedirects: true,
      connectTimeout: 8000,
      readTimeout: 8000,
    });
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  return {
    status: response.type === "opaqueredirect" ? 302 : response.status,
    headers: Object.fromEntries(response.headers),
    data: await response.text(),
  };
}

const preview = {
  async getServer() {
    return { server: localStorage.getItem(PREVIEW_KEY) || "", suggested: "" };
  },
  async setServer({ server }) {
    localStorage.setItem(PREVIEW_KEY, server);
    return {};
  },
  async open() {
    const server = localStorage.getItem(PREVIEW_KEY);
    if (server) location.href = server;
    return {};
  },
};
