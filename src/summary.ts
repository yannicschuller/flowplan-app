// The instance's summary for this phone (GET /api/mobile/summary, see
// lib/mobile-devices.ts in Flowplan) and what the widgets, the badge and the
// Live Activity make of it. Widgets get finished texts: their layouts run in
// a small runtime of their own without the app's code.
import { appLink } from "./navigation";
import { t, type Locale } from "./i18n";

export type Summary = {
  name: string;
  unread: number;
  tasks: {
    due: number;
    overdue: number;
    open: number;
    items: { text: string; page: string; due: string | null; url: string }[];
  };
  timer: { start: number; title: string; database: string; url: string } | null;
  today: string;
  at: number;
};

export function isSummary(value: unknown): value is Summary {
  const s = value as Summary;
  return (
    !!s &&
    typeof s.unread === "number" &&
    !!s.tasks &&
    Array.isArray(s.tasks.items) &&
    typeof s.tasks.due === "number" &&
    (s.timer === null || typeof s.timer?.start === "number")
  );
}

// The phone's date as YYYY-MM-DD.
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dueLabel(due: string | null, today: string, locale: Locale) {
  if (!due) return "";
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  // Hermes has no Intl.RelativeTimeFormat: the near days are words of our own.
  if (days === 0) return t("widgetToday", {}, locale);
  if (days === 1) return t("tomorrow", {}, locale);
  if (days === -1) return t("yesterday", {}, locale);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${due}T00:00:00Z`));
}

export type TaskLine = { text: string; page: string; due: string; late: boolean; url: string };
export type TasksWidgetProps = {
  signedIn: boolean;
  title: string;
  headline: string;
  detail: string;
  empty: string;
  late: boolean;
  items: TaskLine[];
  url: string;
  unread: number;
  unreadLabel: string;
  inboxUrl: string;
  timer: { title: string; start: number; url: string } | null;
};
export type InboxWidgetProps = { signedIn: boolean; title: string; count: number; label: string; url: string };

export function tasksWidget(summary: Summary | null, locale: Locale): TasksWidgetProps {
  const tasksUrl = appLink("/#tasks"),
    inboxUrl = appLink("/#inbox");
  if (!summary)
    return {
      signedIn: false,
      title: t("widgetTasks", {}, locale),
      headline: t("widgetSignIn", {}, locale),
      detail: "",
      empty: "",
      late: false,
      items: [],
      url: appLink("/"),
      unread: 0,
      unreadLabel: "",
      inboxUrl,
      timer: null,
    };
  const { tasks } = summary;
  return {
    signedIn: true,
    title: t("widgetTasks", {}, locale),
    headline: tasks.due ? t("widgetDue", { count: tasks.due }, locale) : t("widgetNothingDue", {}, locale),
    detail: tasks.overdue ? t("widgetOverdue", { count: tasks.overdue }, locale) : "",
    empty: t("widgetNoTasks", {}, locale),
    late: tasks.overdue > 0,
    items: tasks.items.map((item) => ({
      text: item.text,
      page: item.page,
      due: dueLabel(item.due, summary.today, locale),
      late: !!item.due && item.due < summary.today,
      url: appLink(item.url),
    })),
    url: tasksUrl,
    unread: summary.unread,
    unreadLabel: summary.unread ? t("widgetUnread", { count: summary.unread }, locale) : t("widgetInboxEmpty", {}, locale),
    inboxUrl,
    timer: summary.timer ? { title: summary.timer.title || summary.timer.database, start: summary.timer.start, url: appLink(summary.timer.url) } : null,
  };
}

export function inboxWidget(summary: Summary | null, locale: Locale): InboxWidgetProps {
  return {
    signedIn: !!summary,
    title: t("widgetInbox", {}, locale),
    count: summary?.unread ?? 0,
    label: !summary
      ? t("widgetSignIn", {}, locale)
      : summary.unread
        ? t("widgetUnread", { count: summary.unread }, locale)
        : t("widgetInboxEmpty", {}, locale),
    url: appLink(summary ? "/#inbox" : "/"),
  };
}

// The running timer as Live Activity (iOS) or ongoing notification (Android).
export type TimerProps = { title: string; database: string; start: number; label: string; url: string };
export function timerProps(summary: Summary | null, locale: Locale): TimerProps | null {
  const timer = summary?.timer;
  if (!timer) return null;
  return {
    title: timer.title || timer.database || t("widgetTimer", {}, locale),
    database: timer.title ? timer.database : "",
    start: timer.start,
    label: t("widgetTimer", {}, locale),
    url: appLink(timer.url),
  };
}
