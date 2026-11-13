// Offline use offered by the app (#203): offline use is switched on per
// device in Flowplan (Settings → Offline & devices); people expected the app
// to fall back to a copy without having done that. So once per profile –
// after the first sign-in, or the first time a signed-in profile opens on an
// instance that can – the app asks natively whether to keep the pages on
// this device. "Speichern" has the page switch it on, exactly like the
// switch in its settings (the page shows the progress); "Nicht jetzt" is
// remembered, and the app never asks where offline use is on already.
//
// The page reports where offline use stands (window.FlowplanApp.offlineStatus,
// lib/app-offline-offer.ts in Flowplan); instances without that hook never
// report, so the app never asks there. What the page reports unavailable
// (no support – Android over HTTP –, guests, the demo, too little room) is
// not offered. The app's settings show the copy of the current profile: on
// iOS from the copy's marker the app keeps (src/offline/store.ts), on
// Android from the page's last report.
// Pure – App.tsx and Settings.tsx hand in the store, the page and the clock.
import { t, type Locale } from "./i18n";

export const ENABLE_EVENT = "flowplan:offline-enable";
export const STATUS_EVENT = "flowplan:offline-status";
// Settings → Offline & devices in the web app (lib/settings-sections.ts "devices").
export const OFFLINE_SETTINGS_PATH = "/#settings/devices";

export type OfflineStatus = {
  available: boolean;
  reason: string | null;
  enabled: boolean;
  busy: boolean;
  progress: [number, number] | null;
  result: "done" | "incomplete" | "signed-out" | "failed" | null;
  since: number | null;
  lastRefresh: number | null;
  pages: number | null;
  bytes: number | null;
  appBytes: number | null;
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
const RESULTS = ["done", "incomplete", "signed-out", "failed"] as const;

// What the page reported, checked (anything off is dropped, a status
// without version 1 or newer is none).
export function parseOfflineStatus(raw: unknown): OfflineStatus | null {
  const value = raw as Record<string, unknown> | null;
  if (!value || typeof value !== "object" || !(typeof value.version === "number" && value.version >= 1)) return null;
  const progress = Array.isArray(value.progress) && value.progress.length === 2 && value.progress.every((n) => count(n) !== null) ? ([value.progress[0], value.progress[1]] as [number, number]) : null;
  return {
    available: value.available === true,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 40) : null,
    enabled: value.enabled === true,
    busy: value.busy === true,
    progress,
    result: (RESULTS as readonly unknown[]).includes(value.result) ? (value.result as OfflineStatus["result"]) : null,
    since: count(value.since),
    lastRefresh: count(value.lastRefresh),
    pages: count(value.pages),
    bytes: count(value.bytes),
    appBytes: count(value.appBytes),
  };
}

// Whether to ask now: the instance reported it can and it is off, nobody
// asked on this profile yet, signed in, the window in front and nothing
// else asking (the notification question after the first sign-in).
export function shouldOffer(input: { status: OfflineStatus | null; offered: boolean; signedIn: boolean; front: boolean; otherQuestion: boolean }) {
  const { status } = input;
  return !!status && status.available && !status.enabled && !status.busy && !input.offered && input.signedIn && input.front && !input.otherQuestion;
}

// The page switches offline use on (or reports again); instances without
// the hook ignore both events.
export const offlineEnableScript = `window.dispatchEvent(new CustomEvent(${JSON.stringify(ENABLE_EVENT)})); true;`;
export const offlineStatusScript = `window.dispatchEvent(new CustomEvent(${JSON.stringify(STATUS_EVENT)})); true;`;

// What the settings show of a profile's copy.
export type CopyInfo = { enabled: boolean; since: number | null; lastRefresh: number | null; bytes: number | null };

export function infoOfStatus(status: OfflineStatus): CopyInfo {
  const bytes = status.bytes === null && status.appBytes === null ? null : (status.bytes ?? 0) + (status.appBytes ?? 0);
  return { enabled: status.enabled, since: status.since, lastRefresh: status.lastRefresh, bytes };
}
// iOS: from the marker the page wrote into the app's copy
// (components/offline.ts OfflineMarker in Flowplan), and what the copy
// takes on the device.
export function infoOfMarker(marker: Record<string, unknown> | null, usage: number | null): CopyInfo {
  if (!marker) return { enabled: false, since: null, lastRefresh: null, bytes: null };
  return { enabled: true, since: count(marker.since), lastRefresh: count(marker.lastRefresh), bytes: usage ?? count(marker.bytes) };
}
export function parseCopyInfo(raw: string | null): CopyInfo | null {
  try {
    const value = JSON.parse(raw || "null") as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || typeof value.enabled !== "boolean") return null;
    return { enabled: value.enabled, since: count(value.since), lastRefresh: count(value.lastRefresh), bytes: count(value.bytes) };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number, locale: Locale) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes,
    unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit >= 2 && value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

// "vor 3 Stunden", "gestern": the age of the copy.
export function formatAge(at: number, now: number, locale: Locale) {
  const seconds = Math.round((at - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale === "zh" ? "zh-CN" : locale, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(0, "minute");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}

// The line in the app's settings. info null: the app does not know (Android
// before the page reported, an instance without the hook) – Flowplan
// manages it.
export function copyLine(info: CopyInfo | null, now: number, locale: Locale) {
  if (!info) return t("offlineCopyManaged", {}, locale);
  if (!info.enabled) return t("offlineCopyNone", {}, locale);
  const size = info.bytes ? ` · ${formatBytes(info.bytes, locale)}` : "";
  if (!info.lastRefresh) return t("offlineCopyIncomplete", {}, locale) + size;
  return t("offlineCopyAt", { age: formatAge(info.lastRefresh, now, locale) }, locale) + size;
}
