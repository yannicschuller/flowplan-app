// What a configurable widget shows, made from the instance's answer
// (POST /api/mobile/widgets/data) for Android's widgets, which are drawn
// from React (android-suite.tsx). iOS draws the same answers in SwiftUI
// (plugins/widget-suite/ios). Finished texts in the person's language, links
// into the app, no null anywhere (summary.ts → widgetProps), nothing of a
// page behind a journal PIN or end-to-end encryption.
import { t, type Locale } from "../i18n";
import { appLink, safePath } from "../navigation";
import { dueLabel, widgetProps } from "../summary";
import { formatWhen } from "../admin";
import type { WidgetResult } from "./api";
import { CAPTURE_BUTTONS, DEFAULTS, type CaptureButton, type SuiteConfig, type SuiteKind } from "./suite";

// The paths of an answer are paths on the instance; anything else opens
// the start page.
export const pageLink = (path: unknown) => appLink(safePath(typeof path === "string" ? path : null) ?? "/");

// The app's own capture screen (photo and voice need the app).
export const captureLink = (mode: CaptureButton, targetId?: string) =>
  `flowplan://capture?mode=${mode}${targetId ? `&target=${encodeURIComponent(targetId)}` : ""}`;

// Why a widget shows no content.
export type Closed = "signedOut" | "setup" | "gone" | "offline" | "locked" | "encrypted" | "forbidden";

type Base = { kind: SuiteKind; title: string; url: string };
export type ClosedView = Base & { state: "closed"; reason: Closed; message: string };

export type TaskRow = {
  text: string;
  detail: string;
  due: string;
  late: boolean;
  url: string;
  // What "task.complete" needs back, unchanged (empty when the person may
  // not change the task, or it was just checked off).
  complete?: { source: string; pageId: string; rowId?: string; index?: number; key?: string; text: string };
  // Just checked off: drawn done until the next answer no longer lists it.
  done?: true;
  // The instance refused: why, until the next refresh.
  hint?: string;
};

// Taps on a widget's buttons (native/suite.ts): the item is drawn done at
// once – until the instance's next answer – or comes back with a hint after
// a refusal. The same as on iOS (WidgetShared.swift, FPActions).
export type ActionMarks = { pending: Record<string, number>; failed: Record<string, number> };
export const PENDING_MS = 120_000;
export const FAILED_MS = 600_000;
export const taskItemId = (c: { source: string; pageId: string; rowId?: string; index?: number }) =>
  `task:${c.source}:${c.pageId}:${c.rowId ?? ""}:${typeof c.index === "number" && c.index >= 0 ? c.index : ""}`;
export const habitItemId = (pageId: string, fieldId: string) => `habit:${pageId}:${fieldId}`;
export const readItemId = (notificationId?: string) => `read:${notificationId || "all"}`;
export const TIMER_START = "timer:start";
export const TIMER_STOP = "timer:stop";
function marking(marks: ActionMarks | undefined, now: number) {
  const pending = (id: string) => !!marks && typeof marks.pending[id] === "number" && now - marks.pending[id] < PENDING_MS;
  const failed = (id: string) => !!marks && !pending(id) && typeof marks.failed[id] === "number" && now - marks.failed[id] < FAILED_MS;
  return { pending, failed, anyFailed: (prefix: string) => !!marks && Object.keys(marks.failed).some((id) => id.startsWith(prefix) && failed(id)) };
}

export type SuiteView =
  | ClosedView
  | (Base & { state: "capture"; target: string; buttons: { id: CaptureButton; label: string; url: string }[] })
  | (Base & { state: "tasks"; headline: string; empty: string; items: TaskRow[] })
  | (Base & { state: "calendar"; empty: string; items: { title: string; when: string; day: string; calendar: string; task: boolean; url: string }[] })
  | (Base & { state: "list"; empty: string; columns: string[]; items: { title: string; detail: string; url: string }[] })
  | (Base & { state: "counter"; value: string; label: string; group: string; history: { value: number; estimated: boolean }[]; estimated: string })
  | (Base & {
      state: "journal";
      journal?: { name: string; line: string; written: boolean; url: string; protected: boolean };
      habits?: { name: string; line: string; url: string; items: { fieldId: string; pageId: string; name: string; done: boolean; canWrite: boolean }[]; protected: boolean };
      today: string;
      notice?: string;
    })
  | (Base & {
      state: "time";
      today: string;
      week: string;
      days: { label: string; share: number; today: boolean }[];
      timer?: { title: string; start: number; url: string };
      start?: { pageId: string; rowId: string; fieldId: string; title: string };
      startLabel: string;
      stopLabel: string;
      hint: string;
      notice?: string;
    })
  | (Base & {
      state: "mentions";
      headline: string;
      empty: string;
      items: { id: string; text: string; when: string; read: boolean; url: string }[];
      readLabel: string;
      readAllLabel: string;
      notice?: string;
    })
  | (Base & { state: "forms"; headline: string; empty: string; items: { title: string; when: string; isNew: boolean; url: string }[] });

const TITLES: Record<SuiteKind, Parameters<typeof t>[0]> = {
  capture: "suiteCapture",
  tasks: "widgetTasks",
  calendar: "suiteCalendar",
  pinned: "suitePinned",
  counter: "suiteCounter",
  journal: "suiteJournal",
  time: "suiteTime",
  mentions: "suiteMentions",
  forms: "suiteForms",
};
export const kindTitle = (kind: SuiteKind, locale: Locale) => t(TITLES[kind], {}, locale);

export function closedView(kind: SuiteKind, reason: Closed, locale: Locale, title = "", url = "/"): ClosedView {
  const messages: Record<Closed, Parameters<typeof t>[0]> = {
    signedOut: "widgetSignIn",
    setup: "widgetSetup",
    gone: "widgetGone",
    forbidden: "widgetGone",
    offline: "widgetOffline",
    locked: "widgetLocked",
    encrypted: "widgetEncrypted",
  };
  return {
    kind,
    state: "closed",
    reason,
    title: title || kindTitle(kind, locale),
    message: t(messages[reason], {}, locale),
    url: reason === "signedOut" ? appLink("/") : pageLink(url),
  };
}

type Data = Record<string, unknown>;
const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const list = (value: unknown) => (Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Data[]) : []);

// "1:30 h" – hours as the time tracking shows them.
export function formatHours(hours: number) {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

function clockOf(iso: string, locale: Locale) {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(at)) : "";
}
function weekdayOf(day: string, locale: Locale) {
  const at = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(at) ? new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(at)) : day;
}

// The view of one widget: a result of the data request (or none yet).
export function suiteView<K extends SuiteKind>(
  kind: K,
  config: SuiteConfig[K],
  result: WidgetResult | null,
  options: { locale: Locale; today: string; signedIn: boolean; now?: number; marks?: ActionMarks },
): SuiteView {
  const { locale, today } = options;
  const now = options.now ?? Date.now();
  const marks = marking(options.marks, now);
  if (!options.signedIn) return closedView(kind, "signedOut", locale);
  if ((kind === "counter" && !(config as SuiteConfig["counter"]).pageId) || (kind === "forms" && !(config as SuiteConfig["forms"]).pageId))
    return closedView(kind, "setup", locale);
  if (!result) return closedView(kind, "offline", locale);
  if (!result.ok) return closedView(kind, result.status === 404 ? "gone" : result.status === 403 ? "forbidden" : result.status === 423 ? "locked" : "offline", locale);
  const d = result.data;
  const title = str(d.title) || kindTitle(kind, locale);
  const url = pageLink(d.url);
  if (d.locked === true) return closedView(kind, "locked", locale, title, str(d.url, "/"));
  if (d.encrypted === true) return closedView(kind, "encrypted", locale, "", str(d.url, "/"));
  switch (kind) {
    case "capture": {
      const target = d.target as Data | null;
      if (!target) return closedView(kind, "gone", locale, title);
      const buttons = (config as SuiteConfig["capture"]).buttons.filter((b) => CAPTURE_BUTTONS.includes(b));
      const voice = d.voice !== false;
      const labels = { note: "captureNote", task: "captureTask", voice: "captureVoice", photo: "capturePhoto" } as const;
      return {
        kind,
        state: "capture",
        title,
        url: captureLink("note", str(target.id)),
        target: str(target.name),
        // Voice memos only where the instance takes them.
        buttons: (buttons.length ? buttons : DEFAULTS.capture.buttons)
          .filter((b) => b !== "voice" || voice)
          .map((id) => ({ id, label: t(labels[id], {}, locale), url: captureLink(id, str(target.id)) })),
      };
    }
    case "tasks": {
      const items = list(d.items);
      const rows = items.map((item) => {
        const due = typeof item.due === "string" ? item.due : null;
        const complete = widgetProps({
          source: str(item.source, "doc"),
          pageId: str(item.pageId),
          rowId: typeof item.rowId === "string" ? item.rowId : undefined,
          index: typeof item.index === "number" ? item.index : undefined,
          key: typeof item.key === "string" && item.key ? item.key : undefined,
          text: str(item.text),
        });
        const id = taskItemId(complete);
        const row: TaskRow = {
          text: str(item.text),
          detail: str(item.page),
          due: dueLabel(due, today, locale),
          late: !!due && due < today,
          url: pageLink(item.url),
        };
        if (marks.pending(id)) row.done = true;
        else if (item.canEdit === true) row.complete = complete;
        if (marks.failed(id)) row.hint = t("widgetCheckFailed", {}, locale);
        return row;
      });
      const total = Math.max(0, num(d.total, items.length) - rows.filter((row) => row.done).length);
      return {
        kind,
        state: "tasks",
        title,
        url: (config as SuiteConfig["tasks"]).source === "mine" ? appLink("/#tasks") : url,
        headline: total ? t("tasksOpen", { count: total }, locale) : t("tasksDone", {}, locale),
        empty: t("tasksDone", {}, locale),
        items: rows,
      };
    }
    case "calendar": {
      const range = (config as SuiteConfig["calendar"]).range;
      return {
        kind,
        state: "calendar",
        title,
        url: appLink("/#home"),
        empty: t("calendarEmpty", {}, locale),
        items: list(d.items).map((item) => {
          const task = item.type === "task";
          const day = str(item.day);
          return {
            title: str(item.title),
            when: task ? t("captureTask", {}, locale) : item.timed === true ? clockOf(str(item.start), locale) : t("allDay", {}, locale),
            day: range === "today" ? "" : day === today ? t("widgetToday", {}, locale) : weekdayOf(day, locale),
            calendar: str(item.calendar),
            task,
            url: pageLink(item.url),
          };
        }),
      };
    }
    case "pinned": {
      const columns = Array.isArray(d.properties) ? d.properties.filter((p): p is string => typeof p === "string").slice(0, 2) : [];
      return {
        kind,
        state: "list",
        title,
        url: (config as SuiteConfig["pinned"]).mode === "favorites" ? appLink("/#home") : url,
        empty: (config as SuiteConfig["pinned"]).mode === "favorites" ? t("favoritesEmpty", {}, locale) : t("pinnedEmpty", {}, locale),
        columns,
        items: list(d.items).map((item) => {
          // Protected favorites: no title, just the state.
          const closed = item.locked === true ? t("widgetLockedShort", {}, locale) : item.encrypted === true ? t("widgetEncryptedShort", {}, locale) : "";
          const values = Array.isArray(item.values) ? item.values.filter((v): v is string => typeof v === "string" && !!v).slice(0, 2) : [];
          return {
            title: closed || str(item.title),
            detail: closed ? "" : values.length ? values.join(" · ") : str(item.detail),
            url: pageLink(item.url),
          };
        }),
      };
    }
    case "counter": {
      const history = list(d.history).map((h) => ({ value: num(h.value), estimated: h.estimated === true }));
      return {
        kind,
        state: "counter",
        title,
        url,
        value: str(d.formatted, "–"),
        label: str(d.label),
        group: str(d.group),
        history,
        estimated: history.some((h) => h.estimated) ? t("counterEstimated", {}, locale) : "",
      };
    }
    case "journal": {
      const j = d.journal as Data | null,
        h = d.habits as Data | null;
      const view: Extract<SuiteView, { state: "journal" }> = { kind, state: "journal", title, url, today };
      if (j) {
        const closed = j.locked === true || j.encrypted === true;
        const streak = num(j.streak);
        view.journal = {
          name: j.encrypted === true ? kindTitle("journal", locale) : str(j.name),
          protected: j.locked === true,
          written: j.written === true,
          line:
            j.locked === true
              ? t("widgetLockedShort", {}, locale)
              : j.written === true
                ? streak > 1
                  ? t("journalStreak", { count: streak }, locale)
                  : t("journalWritten", {}, locale)
                : t("journalWrite", {}, locale),
          url: pageLink(closed ? j.url : (j.today ?? j.url)),
        };
        view.url = view.journal.url;
      }
      if (h) {
        const closed = h.locked === true || h.encrypted === true;
        // Just tapped: the other state until the next answer.
        const items = closed
          ? []
          : list(h.items).map((item) => {
              const tapped = marks.pending(habitItemId(str(h.id), str(item.fieldId)));
              return { fieldId: str(item.fieldId), pageId: str(h.id), name: str(item.name), done: tapped ? item.done !== true : item.done === true, canWrite: h.canWrite === true };
            });
        const shift = list(h.items).filter((item) => marks.pending(habitItemId(str(h.id), str(item.fieldId)))).reduce((sum, item) => sum + (item.done === true ? -1 : 1), 0);
        view.habits = {
          name: closed ? kindTitle("journal", locale) : str(h.name),
          protected: closed,
          line: closed
            ? t(h.locked === true ? "widgetLockedShort" : "widgetEncryptedShort", {}, locale)
            : t("habitsDone", { done: Math.max(0, num(h.done) + shift), total: num(h.total) }, locale),
          url: pageLink(h.url),
          items,
        };
        if (marks.anyFailed("habit:")) view.notice = t("widgetCheckFailed", {}, locale);
      }
      return view;
    }
    case "time": {
      const days = list(d.days).slice(0, 7);
      const max = Math.max(0.01, ...days.map((day) => num(day.hours)));
      const running = d.timer as Data | null;
      const chosen = (config as SuiteConfig["time"]).timer;
      const recent = list(d.recent);
      // The start button starts the chosen timer, or the most recent one.
      const pick = (chosen && recent.find((r) => r.rowId === chosen.rowId && r.fieldId === chosen.fieldId)) || recent[0];
      const view: Extract<SuiteView, { state: "time" }> = {
        kind,
        state: "time",
        title,
        url: appLink("/#home"),
        today: formatHours(num(d.today)),
        week: formatHours(num(d.week)),
        days: days.map((day) => ({ label: weekdayOf(str(day.day), locale).slice(0, 2), share: num(day.hours) / max, today: day.day === today })),
        startLabel: t("timerStart", {}, locale),
        stopLabel: t("timerStop", {}, locale),
        hint: pick || running ? "" : t("noRecentTimer", {}, locale),
      };
      if (marks.failed(TIMER_START) || marks.failed(TIMER_STOP)) view.notice = t("widgetActionFailed", {}, locale);
      if (running && typeof running.start === "number")
        view.timer = { title: str(running.title) || str(running.database) || t("widgetTimer", {}, locale), start: running.start, url: pageLink(running.url) };
      else if (chosen && !pick) view.start = { ...chosen, title: "" };
      else if (pick) view.start = { pageId: str(pick.pageId), rowId: str(pick.rowId), fieldId: str(pick.fieldId), title: str(pick.title) || str(pick.database) };
      return view;
    }
    case "mentions": {
      const unread = (d.unread ?? {}) as Data;
      const allRead = marks.pending(readItemId());
      // Marked read here: read until the next answer.
      const items = list(d.items).map((item) => ({
        id: str(item.id),
        text: str(item.text),
        when: typeof item.createdAt === "number" ? formatWhen(item.createdAt, now, locale) : "",
        read: item.read === true || allRead || marks.pending(readItemId(str(item.id))),
        url: pageLink(item.url),
        wasRead: item.read === true,
      }));
      const count = allRead ? 0 : Math.max(0, num(unread.mentions) + num(unread.assignments) - items.filter((item) => item.read && !item.wasRead).length);
      const view: Extract<SuiteView, { state: "mentions" }> = {
        kind,
        state: "mentions",
        title,
        url: appLink("/#inbox"),
        headline: count ? t("widgetUnread", { count }, locale) : t("widgetInboxEmpty", {}, locale),
        empty: t("mentionsEmpty", {}, locale),
        items: items.map(({ wasRead: _wasRead, ...item }) => item),
        readLabel: t("markRead", {}, locale),
        readAllLabel: t("markAllRead", {}, locale),
      };
      if (marks.anyFailed("read:")) view.notice = t("widgetActionFailed", {}, locale);
      return view;
    }
    case "forms": {
      const fresh = num(d.new);
      return {
        kind,
        state: "forms",
        title,
        url,
        headline: fresh ? t("formsNew", { count: fresh }, locale) : t("formsEmpty", {}, locale),
        empty: t("formsEmpty", {}, locale),
        items: list(d.items).map((item) => ({
          title: str(item.title),
          when:
            typeof item.createdAt === "number"
              ? formatWhen(item.createdAt, now, locale)
              : typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
                ? formatWhen(Date.parse(item.createdAt), now, locale)
                : "",
          isNew: item.new === true,
          url: pageLink(item.url),
        })),
      };
    }
  }
  return closedView(kind, "offline", locale);
}

// Made-up content for the widget pickers and previews, in the person's
// language: the same answer shapes the instance sends.
export function sampleResult(kind: SuiteKind, locale: Locale, today: string, now = Date.now()): WidgetResult {
  const L = (de: string, en: string, fr: string) => ({ de, en, fr })[locale];
  const day = (offset: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const id = "00000000-0000-4000-8000-000000000000";
  const data: Record<SuiteKind, Data> = {
    capture: { title: kindTitle("capture", locale), target: { id, name: L("Eingang", "Inbox", "Boîte d’entrée"), kind: "database" }, voice: true },
    tasks: {
      title: L("Meine Aufgaben", "My tasks", "Mes tâches"),
      total: 3,
      items: [
        { source: "doc", pageId: id, text: L("Angebot an Müller senden", "Send offer to Miller", "Envoyer l’offre à Martin"), due: day(-1), page: L("Vertrieb", "Sales", "Ventes"), url: "/#tasks", canEdit: true },
        { source: "doc", pageId: id, text: L("Retro vorbereiten", "Prepare the retro", "Préparer la rétro"), due: today, page: L("Team", "Team", "Équipe"), url: "/#tasks", canEdit: true },
        { source: "doc", pageId: id, text: L("Reisekosten abrechnen", "Submit travel expenses", "Note de frais du voyage"), due: day(1), page: L("Finanzen", "Finance", "Finances"), url: "/#tasks", canEdit: true },
      ],
    },
    calendar: {
      title: L("Heute", "Today", "Aujourd’hui"),
      items: [
        { type: "event", title: L("Standup", "Stand-up", "Point d’équipe"), day: today, start: `${today}T07:30:00Z`, timed: true, calendar: L("Team", "Team", "Équipe"), url: "/" },
        { type: "event", title: L("Kundentermin Müller", "Client meeting Miller", "Rendez-vous client Martin"), day: today, start: `${today}T12:00:00Z`, timed: true, calendar: L("Vertrieb", "Sales", "Ventes"), url: "/" },
        { type: "task", title: L("Retro vorbereiten", "Prepare the retro", "Préparer la rétro"), day: today, timed: false, calendar: L("Team", "Team", "Équipe"), url: "/" },
      ],
    },
    pinned: {
      title: L("Favoriten", "Favorites", "Favoris"),
      items: [
        { id, kind: "document", title: L("Wochenplan", "Weekly plan", "Plan de la semaine"), url: "/" },
        { id, kind: "database", title: "Roadmap", url: "/" },
        { id, kind: "record", title: L("Website-Relaunch", "Website relaunch", "Refonte du site"), detail: "Roadmap", url: "/" },
      ],
    },
    counter: {
      title: L("Bewerbungen", "Applications", "Candidatures"),
      label: L("Einträge", "Records", "Entrées"),
      formatted: "42",
      history: [28, 29, 29, 31, 30, 32, 33, 33, 35, 36, 38, 39, 41, 42].map((value, i) => ({ day: day(i - 13), value, ...(i < 4 ? { estimated: true } : {}) })),
      url: "/",
    },
    journal: {
      title: L("Journal", "Journal", "Journal"),
      journal: { id, name: L("Mein Journal", "My journal", "Mon journal"), written: true, streak: 6, today: "/", canWrite: true, trackers: [] },
      habits: {
        id,
        name: L("Gewohnheiten", "Habits", "Habitudes"),
        done: 2,
        total: 3,
        canWrite: true,
        url: "/",
        items: [
          { fieldId: "a", name: L("Laufen", "Run", "Courir"), done: true },
          { fieldId: "b", name: L("Lesen", "Read", "Lire"), done: true },
          { fieldId: "c", name: L("Kein Zucker", "No sugar", "Sans sucre"), done: false },
        ],
      },
    },
    time: {
      title: L("Zeit diese Woche", "Time this week", "Temps cette semaine"),
      today: 3.5,
      week: 17.25,
      days: [6.5, 7.25, 3.5, 0, 0, 0, 0].map((hours, i) => ({ day: day(i - 2), hours })),
      timer: { start: now - 47 * 60_000, title: L("Angebot schreiben", "Write offer", "Rédiger l’offre"), database: L("Projekte", "Projects", "Projets"), url: "/" },
      recent: [],
    },
    mentions: {
      title: L("Erwähnungen", "Mentions", "Mentions"),
      unread: { mentions: 2, assignments: 1 },
      items: [
        { id: "1", type: "mention", text: L("Ada hat dich in „Roadmap“ erwähnt", "Ada mentioned you in “Roadmap”", "Ada t’a mentionné dans « Roadmap »"), read: false, createdAt: now - 20 * 60_000, url: "/" },
        { id: "2", type: "assignment", text: L("Ben hat dir „Retro vorbereiten“ gegeben", "Ben gave you “Prepare the retro”", "Ben t’a confié « Préparer la rétro »"), read: false, createdAt: now - 3 * 3_600_000, url: "/" },
      ],
    },
    forms: {
      title: L("Kontaktformular", "Contact form", "Formulaire de contact"),
      total: 12,
      new: 2,
      items: [
        { id: "1", title: "Clara Weber", createdAt: now - 35 * 60_000, new: true, url: "/" },
        { id: "2", title: "Jonas Klein", createdAt: now - 5 * 3_600_000, new: true, url: "/" },
        { id: "3", title: "Mia Sommer", createdAt: now - 30 * 3_600_000, new: false, url: "/" },
      ],
    },
  };
  return { id: kind, kind, ok: true, data: data[kind] };
}
