// The instance's summary for this phone (GET /api/mobile/summary, see
// lib/mobile-devices.ts in Flowplan) and what the widgets, the badge and the
// Live Activity make of it. Widgets get finished texts: their layouts run in
// a small runtime of their own without the app's code.
import { appLink } from "./navigation";
import { intlLocale, t, type Locale } from "./i18n";

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
  // The person administers the instance (newer instances): the app also
  // fetches the administrators' widgets (admin.ts).
  admin?: boolean;
  // Flashcards (newer instances, only for a person with decks): cards left
  // today in all decks, the new ones among them, study days in a row, the
  // deck with the most left and the daily reminder's time ('HH:MM', null
  // off). Read through studyOf – an older instance sends none, a broken
  // value counts as none.
  study?: { due: number; new: number; streak: number; deck?: string; remindAt?: string | null };
};

// The flashcards part of a summary, checked (never trusted as it comes).
export function studyOf(summary: Summary | null): { due: number; new: number; streak: number; deck: string; remindAt: string | null } | null {
  const s = summary?.study as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") return null;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);
  const due = count(s.due),
    fresh = count(s.new),
    streak = count(s.streak);
  if (due === null || fresh === null || streak === null) return null;
  return {
    due,
    new: Math.min(fresh, due),
    streak,
    deck: typeof s.deck === "string" ? s.deck.slice(0, 80) : "",
    remindAt: typeof s.remindAt === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.remindAt) ? s.remindAt : null,
  };
}

export function isSummary(value: unknown): value is Summary {
  const s = value as Summary;
  return (
    !!s &&
    typeof s.unread === "number" &&
    !!s.tasks &&
    Array.isArray(s.tasks.items) &&
    typeof s.tasks.due === "number" &&
    (s.timer == null || typeof s.timer?.start === "number")
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
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${due}T00:00:00Z`));
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
  // Left out without a running timer: widget props carry no null (below).
  timer?: { title: string; start: number; url: string };
};
export type InboxWidgetProps = { signedIn: boolean; title: string; count: number; label: string; url: string };

// What the list below shows: the due ones and how many are open, so "Nothing
// due" above a list of open tasks does not read as a contradiction.
export function tasksHeadline(tasks: Summary["tasks"], locale: Locale) {
  const open = typeof tasks.open === "number" ? tasks.open : tasks.items.length;
  const due = tasks.due ? t("widgetDue", { count: tasks.due }, locale) : t("widgetNothingDue", {}, locale);
  return open > tasks.due ? `${due} · ${t("widgetOpenCount", { count: open }, locale)}` : due;
}

export function tasksWidget(summary: Summary | null, locale: Locale): TasksWidgetProps {
  const tasksUrl = appLink("/#tasks"),
    inboxUrl = appLink("/#inbox");
  if (!summary)
    return {
      signedIn: false,
      title: t("widgetOverview", {}, locale),
      headline: t("widgetSignIn", {}, locale),
      detail: "",
      empty: "",
      late: false,
      items: [],
      url: appLink("/"),
      unread: 0,
      unreadLabel: "",
      inboxUrl,
    };
  const { tasks } = summary;
  return {
    signedIn: true,
    title: t("widgetOverview", {}, locale),
    headline: tasksHeadline(tasks, locale),
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
    ...(summary.timer ? { timer: { title: summary.timer.title || summary.timer.database, start: summary.timer.start, url: appLink(summary.timer.url) } } : {}),
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

// What the widget gallery and the placeholder show before there is anything
// to show: made-up tasks in the person's language.
export function sampleSummary(locale: Locale, now = new Date()): Summary {
  const today = localDay(now);
  const day = (offset: number) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  const texts = {
    de: ["Angebot an Müller senden", "Retro vorbereiten", "Reisekosten abrechnen", "Website-Texte prüfen", "Vertrieb", "Team", "Finanzen", "Marketing"],
    en: ["Send offer to Miller", "Prepare the retro", "Submit travel expenses", "Review website copy", "Sales", "Team", "Finance", "Marketing"],
    fr: ["Envoyer l’offre à Martin", "Préparer la rétro", "Note de frais du voyage", "Relire les textes du site", "Ventes", "Équipe", "Finances", "Marketing"],
    zh: ["给王磊发送报价", "准备回顾会", "报销差旅费", "审阅网站文案", "销售", "团队", "财务", "市场"],
    pl: ["Wyślij ofertę do Nowaka", "Przygotuj retro", "Rozlicz koszty podróży", "Sprawdź teksty na stronę", "Sprzedaż", "Zespół", "Finanse", "Marketing"],
    pt: ["Enviar proposta à Silva", "Preparar a retro", "Apresentar despesas de viagem", "Rever os textos do site", "Vendas", "Equipa", "Finanças", "Marketing"],
    ru: ["Отправить предложение Иванову", "Подготовить ретро", "Отчитаться о командировочных", "Проверить тексты сайта", "Продажи", "Команда", "Финансы", "Маркетинг"],
  }[locale];
  return {
    name: "",
    unread: 3,
    tasks: {
      due: 2,
      overdue: 1,
      open: 4,
      items: [
        { text: texts[0], page: texts[4], due: day(-1), url: "/#tasks" },
        { text: texts[1], page: texts[5], due: today, url: "/#tasks" },
        { text: texts[2], page: texts[6], due: day(1), url: "/#tasks" },
        { text: texts[3], page: texts[7], due: null, url: "/#tasks" },
      ],
    },
    timer: null,
    today,
    at: now.getTime(),
    study: { due: 12, new: 5, streak: 4, deck: { de: "Spanisch A1", en: "Spanish A1", fr: "Espagnol A1", pl: "Hiszpański A1", pt: "Espanhol A1", ru: "Испанский A1", zh: "西班牙语 A1" }[locale] },
  };
}

// Widget props as iOS stores them (expo-widgets keeps the timeline in the
// App Group's UserDefaults, which takes property lists only): a null in the
// props – JavaScript's null arrives as NSNull – makes the write fail, so the
// widget never gets a timeline and stays empty. Nulls and undefined values
// are left out, everywhere in the object.
export function widgetProps<T extends object>(props: T): T {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(clean);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) if (item !== null && item !== undefined) out[key] = clean(item);
      return out;
    }
    return typeof value === "number" && !Number.isFinite(value) ? 0 : value;
  };
  return clean(props) as T;
}
