// An HTTP error page in the web view where the instance's page should be
// (onHttpError, main frame only). The reverse proxy in front of Flowplan
// answers with its own page when it finds no route or Flowplan is away –
// Traefik's and Pangolin's plain "404 page not found", a 502 –, and that
// page has no way back: no sign-in, no profiles (#373, after signing out).
// The web view does not show the answer's headers, so the app asks the same
// address once more itself: every answer of Flowplan names its build
// (X-Flowplan-Build). Flowplan's own error pages stay (they link back), also
// the HTML pages of instances older than that header.
import { originOf } from "./server";

export const BUILD_HEADER = "x-flowplan-build";
// A second error page this soon after reloading for one: no more reloads.
export const RELOAD_AGAIN_MS = 30_000;

// What the app's own request to the page's address got; null when it got
// no answer at all.
export type PageProbe = { status: number; flowplan: boolean; contentType: string } | null;

// "stay": Flowplan's own page; "reload": Flowplan answers that address
// fine, the web view got the proxy's page meanwhile; "copy": no Flowplan
// there – the stored copy, or the offline screen; "errorPage": the screen
// that names the error page, with "Try again" and "Switch profile".
export type ErrorPageStep = "stay" | "reload" | "copy" | "errorPage";

// Whether an error of the web view is one to look at.
export function httpErrorOnInstance(url: string, status: number, server: string | null) {
  return !!server && originOf(url) === server && Number.isFinite(status) && status >= 400;
}

export async function errorPageStep(
  { url, status }: { url: string; status: number },
  deps: {
    probe: (url: string) => Promise<PageProbe>;
    // Whether the instance's health check names Flowplan.
    health: () => Promise<boolean>;
    // Whether the window reloaded for an error page in the last RELOAD_AGAIN_MS.
    reloadedRecently: () => boolean;
  },
): Promise<ErrorPageStep> {
  const probe = await deps.probe(url).catch(() => null);
  if (probe?.flowplan) {
    if (probe.status >= 400) return "stay";
    return deps.reloadedRecently() ? "errorPage" : "reload";
  }
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {}
  // Another address than the start page, answered with HTML below 500: an
  // older instance's own page (Flowplan's start page never answers 4xx).
  if (probe && path !== "/" && status < 500 && probe.status < 500 && /^text\/html\b/i.test(probe.contentType)) return "stay";
  if (!(await deps.health().catch(() => false))) return "copy";
  return "errorPage";
}

// The app's request for errorPageStep (React Native's fetch follows
// redirects; one to another site is no answer of the instance).
export async function probePage(url: string, request: typeof fetch = fetch, timeoutMs = 8000): Promise<PageProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(url, { headers: { Accept: "text/html" }, credentials: "include", signal: controller.signal });
    const sameSite = !response.url || originOf(response.url) === originOf(url);
    void response.text().catch(() => "");
    return {
      status: response.status,
      flowplan: sameSite && !!response.headers.get(BUILD_HEADER),
      contentType: response.headers.get("content-type") || "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
