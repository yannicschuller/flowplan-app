// An outdated copy of the instance's page (#61 in Flowplan): after an update
// the instance no longer has the files of the previous build, so a page of
// that build – the profile's offline copy (iOS), or one the web view kept –
// would show without its styles and scripts. The instance names its build
// in every answer (X-Flowplan-Build) and in every page (<meta
// name="flowplan-build">, lib/stale-copy.ts in Flowplan):
//
// - the stored copy is shown only without a connection; once the instance
//   answers with another build than the copy's, the live page follows right
//   away (copyOnReach) instead of waiting until nobody types;
// - the page's own check (lib/stale-copy.ts) reports a page whose files did
//   not load as { type: "staleCopy" } (staleAction decides what the app does).
import { DATA_CACHE, MARKER_KEY, SETTINGS_CACHE } from "./policy";
import type { OfflineCopy } from "./store";

export const BUILD_HEADER = "x-flowplan-build";

// The build a stored page belongs to; null for pages of older instances.
export function pageBuild(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\sname\s*=\s*["']?flowplan-build["'\s/>]/i.test(tag)) continue;
    const content = /\scontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    const value = (content?.[1] ?? content?.[2] ?? content?.[3] ?? "").trim();
    return /^[\w-]{1,64}$/.test(value) ? value : null;
  }
  return null;
}

// The build an answer of the instance names (null: an older instance).
export function answerBuild(headers: { get(name: string): string | null }): string | null {
  const value = (headers.get(BUILD_HEADER) || "").trim();
  return /^[\w-]{1,64}$/.test(value) ? value : null;
}

// The stored copy is showing and the instance answers: "return" gives way
// to the live page once nobody types (returnScript), "now" at once – the
// copy is of another build than the instance runs, its page may ask for
// files and answers the instance no longer has.
export function copyOnReach(copyBuild: string | null, serverBuild: string | null): "return" | "now" {
  return copyBuild && serverBuild && copyBuild !== serverBuild ? "now" : "return";
}

export type StaleMessage = { type: "staleCopy"; build: string | null; clear: boolean; copy: boolean };
export function parseStaleMessage(message: unknown): StaleMessage | null {
  const value = message as { type?: unknown; build?: unknown; clear?: unknown; copy?: unknown } | null;
  if (!value || typeof value !== "object" || value.type !== "staleCopy") return null;
  return {
    type: "staleCopy",
    build: typeof value.build === "string" && /^[\w-]{1,64}$/.test(value.build) ? value.build : null,
    clear: value.clear === true,
    copy: value.copy === true,
  };
}

export type StaleAction = {
  // The copy's page is not shown again until the page stores a new one.
  forgetCopyPage: boolean;
  // The web view's HTTP cache (Android: with its files on disk).
  clearWebCache: boolean;
  // The app loads the live page (the stored copy reported it), or shows its
  // offline screen when the instance cannot be reached.
  next: "live" | "offline" | "page";
};

// What the app does about a page whose files did not load. The live page
// reloads itself (once, lib/stale-copy.ts): the app only clears what could
// bring the old files back. The stored copy cannot load anything itself:
// the app replaces it.
export function staleAction(message: StaleMessage, showingCopy: boolean, reachable: boolean): StaleAction {
  if (showingCopy) return { forgetCopyPage: true, clearWebCache: false, next: reachable ? "live" : "offline" };
  return { forgetCopyPage: message.clear, clearWebCache: true, next: "page" };
}

// Drops the copy's page and marks it for storing again: the page's next
// refresh (components/offline.ts in Flowplan) stores the app's page when the
// marker says it has none of the current build (app.shell).
export async function forgetCopyPage(copy: OfflineCopy) {
  await copy.delete(DATA_CACHE, "/");
  const entry = await copy.match(SETTINGS_CACHE, MARKER_KEY);
  if (!entry) return;
  try {
    const marker = JSON.parse(atob(entry.body)) as { app?: Record<string, unknown> };
    if (!marker.app) return;
    marker.app = { ...marker.app, shell: false };
    await copy.put(SETTINGS_CACHE, MARKER_KEY, { ...entry, body: btoa(JSON.stringify(marker)) });
  } catch {}
}
