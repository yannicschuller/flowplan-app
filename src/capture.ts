// The instance's capture API for the document scanner and Spotlight (app/api/
// mobile/capture/[action] in Flowplan, lib/mobile-capture.ts), with this
// installation's device token like the widgets; the share extension asks it
// itself (plugins/capture). And what the app makes of the answers: finished
// Spotlight entries, the scanner's links, titles and languages. Pure apart
// from fetch, so the tests run it with a fake one.
import { safePath } from "./navigation";
import { dueLabel, localDay } from "./summary";
import { t, type Locale } from "./i18n";
import type { SpotlightEntry } from "../modules/flowplan-capture/src";

export type CaptureConnection = { server: string; token: string; lang: string };
export type CaptureResult<T> = { ok: true; value: T } | { ok: false; signedOut: true } | { ok: false; status: number; error: string };

type Fetch = (url: string, init: { method?: string; headers: Record<string, string>; body?: string | FormData; signal?: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;
const defaultFetch: Fetch = (url, init) => fetch(url, init);
const timeout = (ms: number) => {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
};

async function call<T>(connection: CaptureConnection, action: string, init: { method?: string; body?: FormData }, fetcher: Fetch, ms = 20_000): Promise<CaptureResult<T>> {
  try {
    const response = await fetcher(`${connection.server}/api/mobile/capture/${action}?lang=${encodeURIComponent(connection.lang)}`, {
      ...init,
      headers: { Authorization: `Bearer ${connection.token}`, Accept: "application/json" },
      signal: timeout(ms),
    });
    if (response.status === 401) return { ok: false, signedOut: true };
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !body) return { ok: false, status: response.status || 0, error: typeof body?.error === "string" ? body.error : "" };
    return { ok: true, value: body as T };
  } catch {
    return { ok: false, status: 0, error: "" };
  }
}

// ---- Targets and saving ----

export type CaptureTarget = { id: string; name: string; kind: string; space?: string; workspace?: string; encrypted?: boolean; locked?: boolean };
export type CaptureTargets = { inbox: CaptureTarget | null; targets: CaptureTarget[]; maxFiles?: number; maxUploadMb?: number };

export function captureTargets(connection: CaptureConnection, fetcher: Fetch = defaultFetch) {
  return call<CaptureTargets>(connection, "targets", {}, fetcher);
}

// A scan into a page: at its end (a document, or a record's document with
// rowId), a new record in a database; the recognised text goes along as
// the PDF's search text.
export function saveScan(
  connection: CaptureConnection,
  input: { targetId: string; rowId?: string; title: string; text: string; file: { uri: string; name: string } },
  fetcher: Fetch = defaultFetch,
) {
  const form = new FormData();
  form.append("targetId", input.targetId);
  if (input.rowId) form.append("rowId", input.rowId);
  form.append("place", "append");
  form.append("scan", "1");
  form.append("title", input.title.slice(0, 300));
  if (input.text.trim()) form.append("recognized", input.text.slice(0, 100_000));
  // React Native's FormData takes { uri, name, type } for a file.
  form.append("file", { uri: input.file.uri, name: input.file.name, type: "application/pdf" } as unknown as Blob);
  return call<{ pageId: string; rowId?: string; url: string; title: string }>(connection, "save", { method: "POST", body: form }, fetcher, 120_000);
}

// Choosing a target: the inbox first, then the rest; protected pages are
// left out (nothing can be added there).
export function targetChoices(targets: CaptureTargets) {
  const usable = targets.targets.filter((target) => !target.encrypted && !target.locked && target.name);
  return targets.inbox ? [{ ...targets.inbox, inbox: true }, ...usable.filter((target) => target.id !== targets.inbox!.id)] : usable;
}
export function matchesTarget(target: CaptureTarget, query: string) {
  const q = query.trim().toLowerCase();
  return !q || [target.name, target.space, target.workspace].some((value) => (value || "").toLowerCase().includes(q));
}

// ---- The scanner ----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ScanRequest = { target?: string; rowId?: string; start?: boolean };

// flowplan://scan[?target=<uuid>[&row=<uuid>]] (Shortcuts, widgets, the
// icon's quick actions): the scanner with the target chosen, or the choice.
export function scanRequest(link: string): ScanRequest | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "flowplan:" || url.hostname !== "scan") return null;
  const target = url.searchParams.get("target");
  const row = url.searchParams.get("row");
  if (!target || !UUID.test(target)) return {};
  return { target: target.toLowerCase(), ...(row && UUID.test(row) ? { rowId: row.toLowerCase() } : {}), start: true };
}

// The page's "Scan document" (window.FlowplanApp.scanDocument): its page
// and record, checked like a link.
export function pageScanRequest(message: { pageId?: unknown; rowId?: unknown }): ScanRequest | null {
  const pageId = typeof message.pageId === "string" ? message.pageId : "";
  if (!UUID.test(pageId)) return null;
  const rowId = typeof message.rowId === "string" && UUID.test(message.rowId) ? message.rowId.toLowerCase() : undefined;
  return { target: pageId.toLowerCase(), ...(rowId ? { rowId } : {}), start: true };
}

// "Scan 2026-10-24 16.30" in the person's language.
export function scanTitle(locale: Locale, date = new Date()) {
  const time = `${String(date.getHours()).padStart(2, "0")}.${String(date.getMinutes()).padStart(2, "0")}`;
  return t("scanTitle", { date: `${localDay(date)} ${time}` }, locale);
}

// Vision's languages, the person's first.
export function scanLanguages(locale: Locale) {
  const all = { de: "de-DE", en: "en-US", fr: "fr-FR" } as const;
  return [all[locale], ...Object.values(all).filter((language) => language !== all[locale])];
}

// ---- Spotlight ----

export type SpotlightData = {
  pages: { id: string; title: string; kind: string; place: string; excerpt: string; updatedAt: string; url: string }[];
  tasks: { id: string; text: string; page: string; due: string | null; url: string }[];
};

export function isSpotlightData(value: unknown): value is SpotlightData {
  const data = value as SpotlightData;
  return !!data && Array.isArray(data.pages) && Array.isArray(data.tasks);
}

export function spotlightData(connection: CaptureConnection, fetcher: Fetch = defaultFetch) {
  return call<SpotlightData>(connection, "spotlight", {}, fetcher, 30_000);
}

// One domain per profile: switching profiles replaces the whole index.
export const spotlightDomain = (profile: string) => `app.flowplan.${profile}`;

// SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) as ms.
const sqliteTime = (value: string) => {
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(" ", "T")}Z` : value);
  return Number.isFinite(ms) ? ms : undefined;
};
const kindLabel = (kind: string, locale: Locale) =>
  kind === "database" ? t("spotlightDatabase", {}, locale) : kind === "whiteboard" ? t("spotlightBoard", {}, locale) : t("spotlightPage", {}, locale);

// What Spotlight shows: titles, where they are, a line of content; a tap
// opens the path in the app (only the instance's own paths).
export function spotlightEntries(data: SpotlightData, locale: Locale, today = localDay()): SpotlightEntry[] {
  const entries: SpotlightEntry[] = [];
  for (const page of data.pages) {
    const path = safePath(page.url);
    if (!path || !page.title) continue;
    const kind = kindLabel(page.kind, locale);
    entries.push({
      id: `page:${page.id}`,
      path,
      title: page.title,
      description: [[kind, page.place].filter(Boolean).join(" · "), page.excerpt].filter(Boolean).join("\n"),
      keywords: ["Flowplan", kind, ...page.place.split(" · ")].filter(Boolean),
      updatedAt: sqliteTime(page.updatedAt),
    });
  }
  for (const task of data.tasks) {
    const path = safePath(task.url);
    if (!path || !task.text) continue;
    const label = t("spotlightTask", {}, locale);
    const due = task.due ? dueLabel(task.due, today, locale) : "";
    entries.push({
      id: `task:${task.id}`,
      path,
      title: task.text,
      description: [label, task.page, due].filter(Boolean).join(" · "),
      keywords: ["Flowplan", label, task.page].filter(Boolean),
      ...(task.due ? { due: Date.parse(`${task.due}T12:00:00`) } : {}),
    });
  }
  return entries;
}

// A short fingerprint of the entries: nothing is re-indexed when nothing changed.
export function entriesKey(entries: SpotlightEntry[]) {
  const text = JSON.stringify(entries);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${entries.length}:${text.length}:${hash >>> 0}`;
}
