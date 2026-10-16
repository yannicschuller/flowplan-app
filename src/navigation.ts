// Where a navigation in the web view goes. Pages of the instance stay in the
// app; the sign-in with passkeys and SSO goes to the system's sign-in sheet;
// other sites, e-mail and phone links open in the system; embedded content
// (videos, maps) stays in the page. Sign-in through the window (e-mail,
// older instances' SSO) may pass the identity provider's pages for a while.
import { originOf } from "./server";

export const APP_SCHEME = "flowplan";
const SIGN_IN_WINDOW_MS = 10 * 60_000;

export type Decision =
  | { kind: "allow" }
  | { kind: "block" }
  | { kind: "signIn"; via: string | null }
  | { kind: "open"; url: string }
  | { kind: "external"; url: string }
  | { kind: "appLink"; url: string };

export type NavigationState = { signingInUntil: number };

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
    if (options.mainFrame) state.signingInUntil = path.startsWith("/api/auth/") ? now + SIGN_IN_WINDOW_MS : 0;
    // Links that ask for a new window open in the app's window.
    return options.newWindow ? { kind: "open", url } : { kind: "allow" };
  }
  if (!options.mainFrame && !options.newWindow) return web ? { kind: "allow" } : { kind: "block" };
  if (web && !options.newWindow && state.signingInUntil > now) return { kind: "allow" };
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
