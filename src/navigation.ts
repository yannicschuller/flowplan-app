// Where a navigation in the web view goes. Pages of the instance stay in the
// app; the sign-in with passkeys and SSO goes to the system's sign-in sheet;
// other sites, e-mail and phone links open in the system; embedded content
// (videos, maps) stays in the page. Sign-in through the window (e-mail,
// older instances' SSO) may pass the identity provider's pages for a while –
// but only the hosts the instance's /api/auth/ endpoints redirect to.
import { originOf } from "./server";

export const APP_SCHEME = "flowplan";
// How long the identity provider's pages may stay in the window after the
// instance sent the web view there (OIDC sign-in takes a minute or two).
export const SIGN_IN_WINDOW_MS = 3 * 60_000;
// The endpoints of the instance that start or finish a sign-in through
// another site (app/api/auth/[action]/route.ts in Flowplan): "login" sends to
// the identity provider, "callback" takes its answer, "desktop" is the hand-off
// for the apps. Everything else under /api/auth/ (logout, verify, password,
// …) stays on the instance and opens no window.
const SIGN_IN_PATH = /^\/api\/auth\/(login|callback|desktop)(\/|$)/;

export type Decision =
  | { kind: "allow" }
  | { kind: "block" }
  | { kind: "signIn"; via: string | null }
  | { kind: "open"; url: string }
  | { kind: "external"; url: string }
  | { kind: "appLink"; url: string };

export type NavigationState = {
  // Until when the identity provider's pages may load in the window (0: not).
  signingInUntil: number;
  // True from a sign-in endpoint of the instance until a page has rendered:
  // the foreign hosts seen meanwhile are its redirects, the identity provider.
  redirecting: boolean;
  // Hosts the sign-in redirected to; only they may load while signing in.
  identityHosts: Set<string>;
};

export const navigationState = (): NavigationState => ({ signingInUntil: 0, redirecting: false, identityHosts: new Set() });

const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

// A main-frame load begins (onLoadStart) – on Android also one that
// onShouldStartLoadWithRequest never saw (a form POST). While signing in, the
// foreign hosts a load of the instance or of the identity provider passes
// before it renders are redirects of the sign-in.
export function loadStarted(state: NavigationState, url: string, server: string | null, now = Date.now()) {
  if (state.signingInUntil <= now) return;
  if (originOf(url) === server || state.identityHosts.has(hostOf(url))) state.redirecting = true;
}

// Whether a page that is loading may stay in the window: the instance's own,
// or the identity provider's while signing in. Changes nothing, for the
// checks on loads the web view did not ask about (onLoadStart,
// onNavigationStateChange).
export function mayStay(url: string, server: string | null, state: NavigationState, now = Date.now()) {
  if (!/^https?:/i.test(url)) return true;
  if (originOf(url) === server) return true;
  return state.signingInUntil > now && state.identityHosts.has(hostOf(url));
}

// A page has rendered (onLoadEnd): what follows are clicks, not redirects.
export const pageRendered = (state: NavigationState) => {
  state.redirecting = false;
};

// Whether a request of onShouldStartLoadWithRequest is for the main frame.
// Only iOS says (isTopFrame); Android's event carries url, title, loading,
// canGoBack, canGoForward and lockIdentifier and nothing about the frame
// (react-native-webview RNCWebViewClient.createWebViewEvent; its types call
// navigationType "always other on android"). Missing means main frame:
// Android asks about subframes the same way, and those are allowed anyway
// unless they leave the instance (decide).
export const isMainFrame = (request: { url: string; isTopFrame?: boolean | null }) => request.isTopFrame !== false;

// The hand-off for passkeys and SSO (/api/auth/desktop without a challenge,
// as the sign-in page links it) loading in the web view: the app did not
// catch it in onShouldStartLoadWithRequest (an Android web view that did not
// ask, or asked and timed out after 250 ms and loads it anyway). The app
// stops it and starts the sign-in itself (#109). With a challenge it is the
// browser's part of a sign-in, never the app's page.
export function missedSignIn(url: string, server: string | null): { via: string | null } | null {
  if (!server || originOf(url) !== server) return null;
  const target = new URL(url);
  if (target.pathname !== "/api/auth/desktop" || target.searchParams.has("challenge")) return null;
  return { via: target.searchParams.get("via") };
}

export function decide(
  url: string,
  options: { server: string | null; mainFrame: boolean; newWindow?: boolean; state: NavigationState; now?: number },
): Decision {
  const now = options.now ?? Date.now();
  const scheme = (/^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] || "").toLowerCase();
  if (["about", "data", "blob"].includes(scheme)) return options.newWindow ? { kind: "block" } : { kind: "allow" };
  const web = scheme === "http" || scheme === "https";
  const { server, state } = options;
  if (server && web && originOf(url) === server) {
    const path = new URL(url).pathname;
    if (path === "/api/auth/desktop" && options.mainFrame) return { kind: "signIn", via: new URL(url).searchParams.get("via") };
    if (options.mainFrame) {
      if (SIGN_IN_PATH.test(path)) {
        state.signingInUntil = now + SIGN_IN_WINDOW_MS;
        state.redirecting = true;
      } else {
        // Back on the instance: the window closes, the hosts are forgotten.
        state.signingInUntil = 0;
        state.redirecting = false;
        state.identityHosts.clear();
      }
    }
    // Links that ask for a new window open in the app's window.
    return options.newWindow ? { kind: "open", url } : { kind: "allow" };
  }
  if (!options.mainFrame && !options.newWindow) return web ? { kind: "allow" } : { kind: "block" };
  if (web && !options.newWindow && state.signingInUntil > now) {
    const host = hostOf(url);
    if (state.redirecting && host) state.identityHosts.add(host);
    if (host && state.identityHosts.has(host)) {
      // The provider's page may redirect further (another of its hosts).
      state.redirecting = true;
      return { kind: "allow" };
    }
  }
  if (scheme === APP_SCHEME) return { kind: "appLink", url };
  if (!scheme) return { kind: "block" };
  return { kind: "external", url };
}

// Links into the app: flowplan://open?path=/#inbox (notifications, widgets,
// quick actions) open that path of the instance; only paths, never another
// site.
export function pathOfAppLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== "open") return null;
  return safePath(url.searchParams.get("path"));
}

export function safePath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return null;
  return path;
}

export const appLink = (path: string) => `${APP_SCHEME}://open?path=${encodeURIComponent(path)}`;

// flowplan://do?action=focus.start&minutes=25 (controls, Siri, notification
// buttons): only the app's own steps, nothing else.
export const DO_ACTIONS = ["focus.start", "focus.stop", "timer.stop", "recording.stop"] as const;
export function doLink(link: string): { action: (typeof DO_ACTIONS)[number]; minutes: number } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== "do") return null;
  const action = url.searchParams.get("action") as (typeof DO_ACTIONS)[number];
  if (!DO_ACTIONS.includes(action)) return null;
  const minutes = Math.round(Number(url.searchParams.get("minutes")));
  return { action, minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 180 ? minutes : 25 };
}

// flowplan://meeting?pageId=…&rowId=…&date=…&start=…&end=… ("Open notes" of
// the meeting's Live Activity): creates or opens the meeting's note.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function meetingLink(link: string): { pageId: string; rowId: string; date: string; start: string; end: string } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== "meeting") return null;
  const q = url.searchParams;
  const value = { pageId: q.get("pageId") || "", rowId: q.get("rowId") || "", date: q.get("date") || "", start: q.get("start") || "", end: q.get("end") || "" };
  if (!UUID.test(value.pageId) || !UUID.test(value.rowId) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !value.start || value.start.length > 40 || value.end.length > 40)
    return null;
  return value;
}

// The capture screen (screens/Capture.tsx) from widgets, controls, Siri and
// quick actions.
export type CaptureRequest = { mode: "note" | "task" | "voice" | "photo"; target?: string; record?: boolean };

// flowplan://capture?mode=voice&target=<uuid>&record=1 → what to capture.
export function captureRequest(link: string): CaptureRequest | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "flowplan:" || url.hostname !== "capture") return null;
  const mode = url.searchParams.get("mode") as CaptureRequest["mode"];
  if (!["note", "task", "voice", "photo"].includes(mode)) return null;
  const target = url.searchParams.get("target");
  return { mode, ...(target && UUID.test(target) ? { target: target.toLowerCase() } : {}), ...(url.searchParams.get("record") === "1" ? { record: true } : {}) };
}

// The instance's page answered with an HTTP error (onHttpError, main frame
// only): worth asking whether a Flowplan still answers there – a proxy's 502
// while it is down, a parked domain – so the window can show the offline
// screen with "Switch profile" instead of a foreign error page without a
// way out (#69). Flowplan's own start page never answers 4xx; its other
// pages' errors are Flowplan's own pages.
export function httpErrorNeedsCheck(url: string, status: number, server: string | null) {
  if (!server || originOf(url) !== server || !Number.isFinite(status)) return false;
  if (status >= 500) return true;
  if (status < 400) return false;
  try {
    return new URL(url).pathname === "/";
  } catch {
    return false;
  }
}
