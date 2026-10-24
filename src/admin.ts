// The administrators' widgets: the state of the instance, live numbers and
// storage, from GET /api/mobile/admin-summary (lib/mobile-admin.ts in
// Flowplan) with the device token. Only for people who administer the
// instance (the summary says `admin`); everyone else sees "Administrators
// only". Like the other widgets they get finished texts in the person's
// language and no null (summary.ts → widgetProps).
import { appLink } from "./navigation";
import { t, type Locale } from "./i18n";

export const ADMIN_PROBLEMS = ["workers", "alerts", "backup", "s3", "key", "mail", "export", "ldap"] as const;
export const ADMIN_NOTICES = ["restore", "quota", "backupOff", "mailOff", "domains", "maintenance"] as const;

export type AdminSummary = {
  at: number;
  health: { state: "ok" | "notice" | "problem"; problems: string[]; notices: string[]; failingWorkers: number; nearlyFull: number };
  version: string;
  update: string | null;
  uptimeSeconds: number;
  backup: { enabled: boolean; lastAt: number | null; failed: boolean };
  // null: the instance's statistics are switched off.
  live: {
    activeNow: number;
    requestsPerMinute: number;
    errorRate: number;
    errorsHour: number;
    signinsToday: number;
    requests24h: (number | null)[];
  } | null;
  storage: { bytes: number; disk: { total: number; free: number } | null; fullestQuota: number | null; nearlyFull: number; workspaces: number };
};

// What the widgets know: nothing (signed out), that the person does not
// administer the instance, or the summary.
// null: signed out. pending: an administrator whose numbers did not arrive
// yet (not reachable, or the device token was renewed during the request).
export type AdminState = { kind: "data"; data: AdminSummary } | { kind: "notAdmin" } | { kind: "pending" } | null;

export function isAdminSummary(value: unknown): value is AdminSummary {
  const s = value as AdminSummary;
  return (
    !!s &&
    !!s.health &&
    ["ok", "notice", "problem"].includes(s.health.state) &&
    Array.isArray(s.health.problems) &&
    Array.isArray(s.health.notices) &&
    typeof s.version === "string" &&
    !!s.backup &&
    !!s.storage &&
    typeof s.storage.bytes === "number" &&
    (s.live === null || (typeof s.live === "object" && typeof s.live.activeNow === "number" && Array.isArray(s.live.requests24h)))
  );
}

export function parseAdminState(text: string | null): AdminState {
  try {
    const value = JSON.parse(text || "null") as AdminState;
    if (value?.kind === "notAdmin" || value?.kind === "pending") return { kind: value.kind };
    if (value?.kind === "data" && isAdminSummary(value.data)) return value;
  } catch {}
  return null;
}

// The state after a summary that says "administrator": the fresh answer, or
// – unreachable (undefined) or refused (null: the device token was renewed
// between the two requests, the summary just answered) – the last numbers.
// Never "signed out" while the summary answers.
export function nextAdminState(fetched: AdminState | undefined, stored: AdminState): AdminState {
  if (fetched && fetched.kind !== "pending") return fetched;
  return stored?.kind === "data" ? stored : { kind: "pending" };
}

const ADMIN_URL = "/#admin",
  MONITORING_URL = "/#admin/monitoring",
  STORAGE_URL = "/#admin/storage";

// ---- Formatting (Hermes has Intl.NumberFormat and DateTimeFormat) ----

export function formatBytes(bytes: number, locale: Locale) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes),
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
export const formatPercent = (share: number, locale: Locale, digits = 0) =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(Math.max(0, share));
const formatNumber = (value: number, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

// "14:05" today, "21 Oct" before.
export function formatWhen(at: number, now: number, locale: Locale) {
  const date = new Date(at),
    today = new Date(now);
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return sameDay
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date)
    : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

const codeKey = {
  workers: "adminProblemWorkers",
  alerts: "adminProblemAlerts",
  backup: "adminProblemBackup",
  s3: "adminProblemS3",
  key: "adminProblemKey",
  mail: "adminProblemMail",
  export: "adminProblemExport",
  ldap: "adminProblemLdap",
  restore: "adminNoticeRestore",
  quota: "adminNoticeQuota",
  backupOff: "adminNoticeBackupOff",
  mailOff: "adminNoticeMailOff",
  domains: "adminNoticeDomains",
  maintenance: "adminNoticeMaintenance",
} as const;

// One line for a problem or notice code (unknown codes of newer instances
// get a general word).
export function adminIssueText(code: string, s: AdminSummary, locale: Locale) {
  const key = codeKey[code as keyof typeof codeKey];
  if (!key) return t(s.health.problems.includes(code) ? "adminProblemOther" : "adminNoticeOther", {}, locale);
  return t(key, { count: code === "quota" ? s.health.nearlyFull : s.health.failingWorkers }, locale);
}

// ---- Widget props ----

type Common = {
  // "signedOut", "notAdmin", "pending" or what the widget shows.
  state: string;
  title: string;
  // The line instead of data (sign in, administrators only, statistics off).
  message: string;
  url: string;
};

export type AdminStatusProps = Common & {
  state: "signedOut" | "notAdmin" | "pending" | "ok" | "notice" | "problem";
  // The last backup as one value ("14:05", "21 Oct", "–") and its label.
  backupTime: string;
  backupShort: string;
  headline: string;
  // The most important problem or notice (and how many more).
  detail: string;
  more: string;
  version: string;
  update: string;
  backup: string;
  backupLate: boolean;
};

// The live numbers; the widget shows the one chosen in its settings
// (active, requests, errors, signins) big, the others small.
export const LIVE_METRICS = ["active", "requests", "errors", "signins"] as const;
export type AdminLiveProps = Common & {
  state: "signedOut" | "notAdmin" | "pending" | "data" | "off";
  tiles: { id: (typeof LIVE_METRICS)[number]; label: string; value: string; alert: boolean }[];
  // The error rate of the last hour, 0–1 (the lock screen's gauge).
  errorRate: number;
  // Requests per hour, the last 24 hours (gaps as 0); empty without chart.
  spark: number[];
  sparkLabel: string;
  errorsHigh: boolean;
};

export type AdminStorageProps = Common & {
  state: "signedOut" | "notAdmin" | "pending" | "data";
  used: string;
  usedLabel: string;
  // Shares from 0 to 1; -1 when unknown.
  disk: number;
  diskLabel: string;
  quota: number;
  quotaLabel: string;
  warn: boolean;
  // One value each for the widget's choice (disk, database, quota).
  diskValue: string;
  diskShort: string;
  quotaValue: string;
  quotaShort: string;
};

function gate(admin: AdminState, locale: Locale, title: string) {
  if (!admin) return { state: "signedOut" as const, title, message: t("widgetSignIn", {}, locale), url: appLink("/") };
  if (admin.kind === "notAdmin") return { state: "notAdmin" as const, title, message: t("adminOnly", {}, locale), url: appLink("/") };
  if (admin.kind === "pending") return { state: "pending" as const, title, message: t("adminPending", {}, locale), url: appLink("/") };
  return null;
}

export function adminStatusWidget(admin: AdminState, locale: Locale, now = Date.now()): AdminStatusProps {
  const title = t("adminInstance", {}, locale);
  const closed = gate(admin, locale, title);
  const empty = { headline: "", detail: "", more: "", version: "", update: "", backup: "", backupLate: false, backupTime: "", backupShort: "" };
  if (closed) return { ...closed, ...empty, headline: closed.message };
  const s = (admin as { data: AdminSummary }).data;
  const issues = [...s.health.problems, ...s.health.notices];
  const problems = s.health.problems.length,
    notices = s.health.notices.length;
  const headline =
    s.health.state === "problem"
      ? problems === 1
        ? t("adminProblem", {}, locale)
        : t("adminProblems", { count: problems }, locale)
      : s.health.state === "notice"
        ? notices === 1
          ? t("adminNotice", {}, locale)
          : t("adminNotices", { count: notices }, locale)
        : t("adminAllFine", {}, locale);
  const backupLate = s.backup.enabled && (s.backup.failed || !s.backup.lastAt || now - s.backup.lastAt > 2 * 86_400_000);
  return {
    state: s.health.state,
    title,
    message: "",
    url: appLink(s.health.state === "ok" ? ADMIN_URL : MONITORING_URL),
    headline,
    detail: issues.length ? adminIssueText(issues[0], s, locale) : "",
    more: issues.length > 1 ? t("adminMore", { count: issues.length - 1 }, locale) : "",
    version: `v${s.version}`,
    update: s.update ? t("adminUpdate", { version: s.update }, locale) : "",
    backup: !s.backup.enabled
      ? t("adminBackupOff", {}, locale)
      : s.backup.lastAt
        ? t("adminBackupAt", { time: formatWhen(s.backup.lastAt, now, locale) }, locale)
        : t("adminBackupNone", {}, locale),
    backupLate,
    backupTime: s.backup.enabled && s.backup.lastAt ? formatWhen(s.backup.lastAt, now, locale) : "–",
    backupShort: !s.backup.enabled ? t("adminBackupOff", {}, locale) : t("adminLastBackup", {}, locale),
  };
}

export function adminLiveWidget(admin: AdminState, locale: Locale): AdminLiveProps {
  const title = t("adminLive", {}, locale);
  const closed = gate(admin, locale, title);
  const sparkLabel = t("adminRequests24h", {}, locale);
  if (closed) return { ...closed, tiles: [], errorRate: 0, spark: [], sparkLabel, errorsHigh: false };
  const s = (admin as { data: AdminSummary }).data;
  if (!s.live)
    return { state: "off", title, message: t("adminStatsOff", {}, locale), url: appLink(MONITORING_URL), tiles: [], errorRate: 0, spark: [], sparkLabel, errorsHigh: false };
  const live = s.live;
  const values = live.requests24h.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
  return {
    state: "data",
    title,
    message: "",
    url: appLink(MONITORING_URL),
    tiles: [
      { id: "active", label: t("adminActiveNow", {}, locale), value: formatNumber(live.activeNow, locale), alert: false },
      { id: "requests", label: t("adminRequestsMinute", {}, locale), value: formatNumber(live.requestsPerMinute, locale), alert: false },
      {
        id: "errors",
        label: t("adminErrorRate", {}, locale),
        value: formatPercent(live.errorRate, locale, live.errorRate > 0 && live.errorRate < 0.1 ? 1 : 0),
        alert: live.errorRate >= 0.05,
      },
      { id: "signins", label: t("adminSigninsToday", {}, locale), value: formatNumber(live.signinsToday, locale), alert: false },
    ],
    errorRate: Math.min(1, Math.max(0, live.errorRate)),
    // A chart only when something was collected.
    spark: values.some((v) => v > 0) ? values : [],
    sparkLabel,
    errorsHigh: live.errorRate >= 0.05,
  };
}

export function adminStorageWidget(admin: AdminState, locale: Locale): AdminStorageProps {
  const title = t("adminStorage", {}, locale);
  const closed = gate(admin, locale, title);
  if (closed)
    return { ...closed, used: "", usedLabel: "", disk: -1, diskLabel: "", quota: -1, quotaLabel: "", warn: false, diskValue: "", diskShort: "", quotaValue: "", quotaShort: "" };
  const s = (admin as { data: AdminSummary }).data.storage;
  const disk = s.disk && s.disk.total > 0 ? Math.min(1, Math.max(0, 1 - s.disk.free / s.disk.total)) : -1;
  const quota = s.fullestQuota === null ? -1 : Math.min(1, Math.max(0, s.fullestQuota));
  return {
    state: "data",
    title,
    message: "",
    url: appLink(STORAGE_URL),
    used: formatBytes(s.bytes, locale),
    usedLabel: t("adminDatabaseFiles", {}, locale),
    disk,
    diskLabel: disk >= 0 ? t("adminDisk", { percent: formatPercent(disk, locale) }, locale) : "",
    quota,
    quotaLabel: quota >= 0 ? t("adminFullest", { percent: formatPercent(quota, locale) }, locale) : t("adminNoQuota", {}, locale),
    warn: disk >= 0.9 || quota >= 0.9 || s.nearlyFull > 0,
    diskValue: disk >= 0 ? formatPercent(disk, locale) : "–",
    diskShort: t("adminDiskUsed", {}, locale),
    quotaValue: quota >= 0 ? formatPercent(quota, locale) : "–",
    quotaShort: quota >= 0 ? t("adminFullestShort", {}, locale) : t("adminNoQuota", {}, locale),
  };
}

// The gallery and placeholder: a made-up instance with one notice.
export function sampleAdminSummary(now = Date.now()): AdminSummary {
  const curve = [12, 9, 6, 4, 3, 3, 5, 14, 38, 61, 72, 70, 64, 69, 74, 71, 66, 58, 44, 33, 27, 22, 18, 15];
  return {
    at: now,
    health: { state: "notice", problems: [], notices: ["quota"], failingWorkers: 0, nearlyFull: 1 },
    version: "1.4.2",
    update: "1.5.0",
    uptimeSeconds: 864_000,
    backup: { enabled: true, lastAt: now - 3 * 3_600_000, failed: false },
    live: { activeNow: 14, requestsPerMinute: 86, errorRate: 0.002, errorsHour: 3, signinsToday: 27, requests24h: curve.map((v) => v * 60) },
    storage: { bytes: 13.4 * 1024 ** 3, disk: { total: 100 * 1024 ** 3, free: 38 * 1024 ** 3 }, fullestQuota: 0.92, nearlyFull: 1, workspaces: 6 },
  };
}
