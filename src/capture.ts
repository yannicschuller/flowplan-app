// The instance's capture API for the document scanner and Spotlight (app/api/
// mobile/capture/[action] in Flowplan, lib/mobile-capture.ts), with this
// installation's device token like the widgets; the share extension asks it
// itself (plugins/capture). And what the app makes of the answers: finished
// Spotlight entries, the scanner's links, titles and languages. Pure apart
// from fetch and the native uploader (src/upload.ts, Android's scan and file
// uploads), so the tests run it with fake ones.
import { safePath } from "./navigation";
import { dueLabel, localDay } from "./summary";
import { t, type Locale } from "./i18n";
import type { SpotlightEntry } from "../modules/flowplan-capture/src";
import { IDEMPOTENCY_HEADER, newIdempotencyKey, retryable } from "./idempotency";
import { errorDetail, platformUploader, statusDetail, uploadFile, type NativeUploader } from "./upload";

export type CaptureConnection = { server: string; token: string; lang: string };
// `detail`: what actually went wrong (src/upload.ts), shown under "Details".
export type CaptureResult<T> = { ok: true; value: T } | { ok: false; signedOut: true } | { ok: false; status: number; error: string; detail?: string };

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

const captureUrl = (connection: CaptureConnection, action: string) =>
  `${connection.server}/api/mobile/capture/${action}?lang=${encodeURIComponent(connection.lang)}`;

// With an Idempotency-Key (saving), a request without an answer goes once
// more with the same key: the instance saves it once.
async function call<T>(
  connection: CaptureConnection,
  action: string,
  init: { method?: string; body?: FormData; idempotencyKey?: string },
  fetcher: Fetch,
  ms = 20_000,
): Promise<CaptureResult<T>> {
  const { idempotencyKey, ...request } = init;
  const headers: Record<string, string> = { Authorization: `Bearer ${connection.token}`, Accept: "application/json" };
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  let result: CaptureResult<T> = { ok: false, status: 0, error: "", detail: "" };
  for (let attempt = 0; attempt < (idempotencyKey ? 2 : 1); attempt++) {
    let body: Record<string, unknown> | null = null;
    const signal = timeout(ms);
    try {
      const response = await fetcher(captureUrl(connection, action), { ...request, headers, signal });
      if (response.status === 401) return { ok: false, signedOut: true };
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (response.ok && body) return { ok: true, value: body as T };
      result = {
        ok: false,
        status: response.status || 0,
        error: typeof body?.error === "string" ? body.error : "",
        detail: response.ok ? `HTTP ${response.status}: no JSON answer` : statusDetail(response.status || 0, body),
      };
    } catch (error) {
      result = { ok: false, status: 0, error: "", detail: errorDetail(error, connection.server, signal?.aborted ? ms : undefined) };
    }
    if (!retryable("status" in result ? result.status : 401, body) || attempt > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return result;
}

// ---- Targets and saving ----

export type CaptureTarget = { id: string; name: string; kind: string; space?: string; workspace?: string; encrypted?: boolean; locked?: boolean };
// `spaces` (Flowplan #569): where files can become pages of their own;
// instances from before list none, and take no place "pages".
export type CaptureSpace = { id: string; name: string; icon?: string; workspace?: string };
export type CaptureTargets = { inbox: CaptureTarget | null; targets: CaptureTarget[]; spaces?: CaptureSpace[]; maxFiles?: number; maxUploadMb?: number };

export function captureTargets(connection: CaptureConnection, fetcher: Fetch = defaultFetch) {
  return call<CaptureTargets>(connection, "targets", {}, fetcher);
}

type Saved = { pageId: string; rowId?: string; url: string; title: string; pages?: { pageId: string; title: string; url: string }[] };
const SAVE_TIMEOUT = 120_000;

// The file with its fields to capture/save: with the platform's uploader
// where there is one (Android, src/upload.ts), else React Native's FormData,
// which takes { uri, name, type } for a file.
function save(
  connection: CaptureConnection,
  fields: Record<string, string>,
  file: { uri: string; name: string; type: string },
  fetcher: Fetch,
  idempotencyKey: string,
  uploader: NativeUploader | null,
): Promise<CaptureResult<Saved>> {
  if (uploader)
    return uploadFile<Saved>(
      { url: captureUrl(connection, "save"), server: connection.server, token: connection.token, file, fields, idempotencyKey, timeoutMs: SAVE_TIMEOUT },
      uploader,
    );
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", file as unknown as Blob);
  return call<Saved>(connection, "save", { method: "POST", body: form, idempotencyKey }, fetcher, SAVE_TIMEOUT);
}

// A scan into a page: at its end (a document, or a record's document with
// rowId), a new record in a database; the recognised text goes along as
// the PDF's search text.
export function saveScan(
  connection: CaptureConnection,
  input: { targetId: string; rowId?: string; title: string; text: string; file: { uri: string; name: string } },
  fetcher: Fetch = defaultFetch,
  idempotencyKey: string = newIdempotencyKey(),
  uploader: NativeUploader | null = platformUploader(connection.server),
) {
  const fields: Record<string, string> = { targetId: input.targetId };
  if (input.rowId) fields.rowId = input.rowId;
  fields.place = "append";
  fields.scan = "1";
  fields.title = input.title.slice(0, 300);
  if (input.text.trim()) fields.recognized = input.text.slice(0, 100_000);
  return save(connection, fields, { uri: input.file.uri, name: input.file.name, type: "application/pdf" }, fetcher, idempotencyKey, uploader);
}

// Android without Google Play services: a PDF or photo picked instead of a
// scan, at the same place (the end of the page, or a new record), without
// recognised text – the instance reads PDFs itself.
export function saveImport(
  connection: CaptureConnection,
  input: { targetId: string; rowId?: string; file: { uri: string; name: string; type: string } },
  fetcher: Fetch = defaultFetch,
  idempotencyKey: string = newIdempotencyKey(),
  uploader: NativeUploader | null = platformUploader(connection.server),
) {
  const fields: Record<string, string> = { targetId: input.targetId };
  if (input.rowId) fields.rowId = input.rowId;
  fields.place = "append";
  const title = input.file.name.replace(/\.[a-z0-9]+$/i, "").trim();
  if (title) fields.title = title.slice(0, 300);
  const file = { uri: input.file.uri, name: input.file.name, type: input.file.type || "application/octet-stream" };
  return save(connection, fields, file, fetcher, idempotencyKey, uploader);
}

// ---- Files as pages of their own (Flowplan #569) ----

// The spaces the instance offers for "a page per file"; none from
// instances before #569 (the choice is not shown then).
export function filePageSpaces(targets: Pick<CaptureTargets, "spaces"> | null | undefined): CaptureSpace[] {
  const list = Array.isArray(targets?.spaces) ? targets.spaces : [];
  return list.filter((space) => !!space && typeof space.id === "string" && UUID.test(space.id) && typeof space.name === "string" && !!space.name.trim());
}

// One file as a page of its own in the space (below `parentId`, else at
// its top level), titled with the file's name. One request per file: the
// platform's uploader sends one file at a time, and a failure keeps the
// pages made before.
export function saveFilePage(
  connection: CaptureConnection,
  input: { spaceId: string; parentId?: string; file: { uri: string; name: string; type: string } },
  fetcher: Fetch = defaultFetch,
  idempotencyKey: string = newIdempotencyKey(),
  uploader: NativeUploader | null = platformUploader(connection.server),
) {
  const fields: Record<string, string> = { place: "pages", spaceId: input.spaceId };
  if (input.parentId) fields.parentId = input.parentId;
  const file = { uri: input.file.uri, name: input.file.name, type: input.file.type || "application/octet-stream" };
  return save(connection, fields, file, fetcher, idempotencyKey, uploader);
}

// Several files one after the other. `keys` keeps each file's
// Idempotency-Key and `saved` the files already through, across attempts:
// saving again after a failure sends only the rest, each with its key (the
// first attempt may have arrived). The answer: the first page's path.
export async function saveFilePages(
  connection: CaptureConnection,
  spaceId: string,
  files: { uri: string; name: string; type: string }[],
  memory: { keys: Map<string, string>; saved: Map<string, string> },
  onProgress: (done: number, total: number) => void = () => {},
  fetcher: Fetch = defaultFetch,
  uploader: NativeUploader | null = platformUploader(connection.server),
): Promise<CaptureResult<{ url: string; count: number }>> {
  for (const [index, file] of files.entries()) {
    if (memory.saved.has(file.uri)) continue;
    onProgress(index, files.length);
    if (!memory.keys.has(file.uri)) memory.keys.set(file.uri, newIdempotencyKey());
    const result = await saveFilePage(connection, { spaceId, file }, fetcher, memory.keys.get(file.uri)!, uploader);
    if (!result.ok) return result;
    memory.saved.set(file.uri, result.value.url);
  }
  onProgress(files.length, files.length);
  return { ok: true, value: { url: files.map((file) => memory.saved.get(file.uri)).find(Boolean) ?? "", count: files.length } };
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

// What "Scan document" does on this device (the page's entry through the
// bridge, flowplan://scan, screens/Scan.tsx): "scan" opens the scanner;
// "explain" – Android without Google Play services, which run ML Kit's
// scanner – says so in one sentence and offers to add a file instead;
// "none" offers nothing (an iPhone without VisionKit's scanner).
export type ScanMode = "scan" | "explain" | "none";
export function scanMode(platform: string, hasModule: boolean, available: boolean): ScanMode {
  if (!hasModule) return "none";
  if (available) return "scan";
  return platform === "android" ? "explain" : "none";
}
// The page gets window.FlowplanApp.scanDocument (and so its "Scan document")
// wherever the entry does something.
export const scanEntryShown = (mode: ScanMode) => mode !== "none";

// The scanner refused to start although Play services are there (Android:
// ML Kit's scanner module cannot be loaded on this device): explained like
// missing Play services.
export function scannerRefused(error: unknown, platform: string) {
  return platform === "android" && !!error && typeof error === "object" && (error as { code?: unknown }).code === "ERR_SCANNER_UNAVAILABLE";
}

// "Scan 2026-10-24 16.30" in the person's language.
export function scanTitle(locale: Locale, date = new Date()) {
  const time = `${String(date.getHours()).padStart(2, "0")}.${String(date.getMinutes()).padStart(2, "0")}`;
  return t("scanTitle", { date: `${localDay(date)} ${time}` }, locale);
}

// Vision's languages, the person's first. Chinese and Russian go with
// English only: Vision pairs them with English, and a request it refuses
// recognises nothing (modules/flowplan-capture/ios/DocumentScanner.swift,
// which also drops the languages a device's Vision lacks, e.g. Polish on
// older iOS). Portuguese is Vision's pt-BR, the one Portuguese it reads.
// Android's ML Kit (Latin script) needs none.
export function scanLanguages(locale: Locale) {
  const all = { de: "de-DE", en: "en-US", fr: "fr-FR" } as const;
  if (locale === "zh") return ["zh-Hans", all.en];
  if (locale === "ru") return ["ru-RU", all.en];
  if (locale === "pl" || locale === "pt") return [locale === "pl" ? "pl-PL" : "pt-BR", ...Object.values(all)];
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
