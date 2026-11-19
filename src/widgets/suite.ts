// The configurable widgets ("widget suite"): one thing per widget, settings
// per widget instance. Each app widget belongs to one kind of the instance's
// widget API (lib/mobile-widget-schema.ts in Flowplan: GET
// /api/mobile/widgets/options, POST /api/mobile/widgets/data and /action).
//
// This file is the app's side of that contract: which widgets exist, their
// settings and defaults (a freshly added widget works without configuring),
// and how settings are checked before they go to the instance. iOS keeps
// the settings itself (the widget's AppIntent configuration, Swift in
// plugins/widget-suite/); Android stores them per appWidgetId and profile
// (widget-config.ts). Pure functions – tested in test/widget-suite.test.ts.

import { activeProfile, type ProfileState } from "../profiles";

export const SUITE_KINDS = ["capture", "tasks", "calendar", "pinned", "counter", "journal", "time", "mentions", "forms", "study", "event", "reading", "metric", "deadline"] as const;
export type SuiteKind = (typeof SUITE_KINDS)[number];
// Kinds the app asks for itself: Live Activities and system controls.
export type ServerKind = SuiteKind | "focus" | "meeting" | "jobs" | "incident";

// The widget names (iOS widget kind, Android provider) per kind.
export const SUITE_WIDGETS: Record<SuiteKind, string> = {
  capture: "FlowplanCapture",
  tasks: "FlowplanTaskList",
  calendar: "FlowplanAgenda",
  pinned: "FlowplanPinned",
  counter: "FlowplanCounter",
  journal: "FlowplanJournal",
  time: "FlowplanTime",
  mentions: "FlowplanMentions",
  forms: "FlowplanForms",
  // "Karten fällig" (#352): all decks, or the chosen ones.
  study: "FlowplanStudy",
  // Widgets 2026: next appointment, continue reading, a dashboard's key
  // figure, a deadline's countdown.
  event: "FlowplanNextEvent",
  reading: "FlowplanReading",
  metric: "FlowplanMetric",
  deadline: "FlowplanDeadline",
};
// Kinds an instance from before them does not know: it refuses them (400),
// and the widget says the instance needs an update.
export const NEWER_KINDS: readonly SuiteKind[] = ["event", "reading", "metric", "deadline"];
export const kindOfWidget = (name: string): SuiteKind | null =>
  (Object.entries(SUITE_WIDGETS).find(([, widget]) => widget === name)?.[0] as SuiteKind | undefined) ?? null;

export const CAPTURE_BUTTONS = ["note", "task", "voice", "photo"] as const;
export type CaptureButton = (typeof CAPTURE_BUTTONS)[number];

// What the person sets per widget. Ids are the instance's (pages: UUIDs;
// views and properties: short strings). Everything optional has a default.
export type SuiteConfig = {
  capture: { targetId?: string; buttons: CaptureButton[] };
  tasks: { source: "mine" | "view" | "page"; pageId?: string; viewId?: string; filter: "today" | "overdue" | "open"; max: number };
  calendar: { sources: { pageId: string; viewId?: string }[]; range: "today" | "3days" | "week"; tasks: boolean; max: number };
  pinned: { mode: "favorites" | "page"; pageId?: string; viewId?: string; properties: string[]; max: number };
  counter: {
    pageId?: string;
    viewId?: string;
    aggregate: "count" | "sum" | "average";
    fieldId?: string;
    groupFieldId?: string;
    groupValue?: string;
    history: boolean;
  };
  journal: { journalId?: string; habitsId?: string };
  time: { timer?: { pageId: string; rowId: string; fieldId: string } };
  mentions: { show: "all" | "mentions" | "assignments"; unreadOnly: boolean; max: number };
  forms: { pageId?: string; max: number };
  // No decks chosen: all of them.
  study: { pageIds: string[] };
  // Calendars as the options list them ("<pageId>:<viewId>" or "<pageId>";
  // none: all, like the "today" widget); up to three appointments.
  event: { calendars: string[]; within: "today" | "48h" | "week"; showJoin: boolean; max: number };
  reading: { source: "recent" | "library"; max: number };
  metric: { dashboardId?: string; widgetId?: string };
  // A record of a database ({ pageId, rowId }), or a document task (its key
  // as the tasks widget has it, with its page and position).
  deadline: { pageId?: string; rowId?: string; taskKey?: string; index?: number };
};

export const DEFAULTS: { [K in SuiteKind]: SuiteConfig[K] } = {
  capture: { buttons: ["note", "task", "voice", "photo"] },
  tasks: { source: "mine", filter: "open", max: 5 },
  calendar: { sources: [], range: "today", tasks: true, max: 10 },
  pinned: { mode: "favorites", properties: [], max: 6 },
  counter: { aggregate: "count", history: true },
  journal: {},
  time: {},
  mentions: { show: "all", unreadOnly: true, max: 5 },
  forms: { max: 3 },
  study: { pageIds: [] },
  event: { calendars: [], within: "48h", showJoin: true, max: 3 },
  reading: { source: "recent", max: 4 },
  metric: {},
  deadline: {},
};

// The instance takes at most this many decks per widget.
export const MAX_STUDY_DECKS = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID = /^[^\u0000-\u001f]{1,100}$/;
const TASK_KEY = /^[^\u0000-\u001f]{1,300}$/;
const CALENDAR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[^\u0000-\u001f]{1,100})?$/i;
const uuid = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined);
const shortId = (value: unknown) => (typeof value === "string" && SHORT_ID.test(value) ? value : undefined);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const count = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : fallback);
// Leaves out undefined: the settings are stored and sent as JSON.
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

// Whatever was stored (or typed into the configuration screen) becomes a
// valid configuration: unknown values fall back to the defaults.
export function normalizeConfig<K extends SuiteKind>(kind: K, raw: unknown): SuiteConfig[K] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULTS[kind] as SuiteConfig[SuiteKind];
  let out: SuiteConfig[SuiteKind];
  switch (kind) {
    case "capture": {
      const buttons = Array.isArray(r.buttons) ? CAPTURE_BUTTONS.filter((b) => (r.buttons as unknown[]).includes(b)) : [...DEFAULTS.capture.buttons];
      out = compact({ targetId: uuid(r.targetId), buttons: buttons.length ? buttons : [...DEFAULTS.capture.buttons] });
      break;
    }
    case "tasks": {
      const source = oneOf(r.source, ["mine", "view", "page"] as const, "mine");
      const pageId = source === "mine" ? undefined : uuid(r.pageId);
      out = compact({
        // A view or page that is not chosen (yet): my tasks.
        source: pageId ? source : "mine",
        pageId,
        viewId: source === "view" && pageId ? shortId(r.viewId) : undefined,
        filter: oneOf(r.filter, ["today", "overdue", "open"] as const, "open"),
        max: count(r.max, 1, 10, 5),
      });
      break;
    }
    case "calendar":
      out = { sources: calendarSources(r.sources), range: oneOf(r.range, ["today", "3days", "week"] as const, "today"), tasks: bool(r.tasks, true), max: count(r.max, 1, 10, 10) };
      break;
    case "event":
      out = {
        calendars: [...new Set((Array.isArray(r.calendars) ? r.calendars : []).filter((c): c is string => typeof c === "string" && CALENDAR.test(c)))].slice(0, 10),
        within: oneOf(r.within, ["today", "48h", "week"] as const, "48h"),
        showJoin: bool(r.showJoin, true),
        max: count(r.max, 1, 3, 3),
      };
      break;
    case "reading":
      out = { source: oneOf(r.source, ["recent", "library"] as const, "recent"), max: count(r.max, 1, 6, 4) };
      break;
    case "metric": {
      const dashboardId = uuid(r.dashboardId);
      out = compact({ dashboardId, widgetId: dashboardId ? shortId(r.widgetId) : undefined });
      break;
    }
    case "deadline": {
      const pageId = uuid(r.pageId),
        rowId = uuid(r.rowId);
      const taskKey = pageId && typeof r.taskKey === "string" && TASK_KEY.test(r.taskKey) ? r.taskKey : undefined;
      const index = taskKey && typeof r.index === "number" && Number.isInteger(r.index) && r.index >= 0 && r.index < 100_000 ? r.index : undefined;
      // A task of a page (or of a record's document), or a record.
      out = taskKey ? compact({ pageId, rowId, taskKey, index }) : pageId && rowId ? { pageId, rowId } : {};
      break;
    }
    case "pinned": {
      const pageId = uuid(r.pageId);
      const mode = pageId ? oneOf(r.mode, ["favorites", "page"] as const, "page") : "favorites";
      out = compact({
        mode,
        pageId: mode === "page" ? pageId : undefined,
        viewId: mode === "page" ? shortId(r.viewId) : undefined,
        // At most two properties: one thing, clearly.
        properties: mode === "page" && Array.isArray(r.properties) ? [...new Set(r.properties.map(shortId).filter((p): p is string => !!p))].slice(0, 2) : [],
        max: count(r.max, 1, 10, 6),
      });
      break;
    }
    case "counter": {
      const aggregate = oneOf(r.aggregate, ["count", "sum", "average"] as const, "count");
      const fieldId = shortId(r.fieldId);
      const groupFieldId = shortId(r.groupFieldId);
      out = compact({
        pageId: uuid(r.pageId),
        viewId: shortId(r.viewId),
        // Sum and average need a number property; without one: count.
        aggregate: aggregate !== "count" && !fieldId ? "count" : aggregate,
        fieldId: aggregate !== "count" ? fieldId : undefined,
        groupFieldId,
        groupValue: groupFieldId && typeof r.groupValue === "string" ? r.groupValue.slice(0, 500) : undefined,
        history: bool(r.history, true),
      });
      break;
    }
    case "journal":
      out = compact({ journalId: uuid(r.journalId), habitsId: uuid(r.habitsId) });
      break;
    case "time": {
      const timer = r.timer && typeof r.timer === "object" ? (r.timer as Record<string, unknown>) : null;
      const pageId = uuid(timer?.pageId),
        rowId = uuid(timer?.rowId),
        fieldId = shortId(timer?.fieldId);
      out = pageId && rowId && fieldId ? { timer: { pageId, rowId, fieldId } } : {};
      break;
    }
    case "mentions":
      out = {
        show: oneOf(r.show, ["all", "mentions", "assignments"] as const, "all"),
        unreadOnly: bool(r.unreadOnly, true),
        max: count(r.max, 1, 10, 5),
      };
      break;
    case "forms":
      out = compact({ pageId: uuid(r.pageId), max: count(r.max, 1, 5, 3) });
      break;
    case "study":
      out = { pageIds: [...new Set((Array.isArray(r.pageIds) ? r.pageIds : []).map(uuid).filter((id): id is string => !!id))].slice(0, MAX_STUDY_DECKS) };
      break;
    default:
      out = d;
  }
  return out as SuiteConfig[K];
}

// Up to ten calendars ({ pageId, viewId }) of the "today" and "next
// appointment" widgets.
function calendarSources(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => compact({ pageId: uuid(s.pageId) as string, viewId: shortId(s.viewId) }))
    .filter((s) => !!s.pageId)
    .slice(0, 10);
}

// What a widget still needs before it can show anything: the counter, the
// form inbox, the key figure and the deadline have no sensible default.
export function needsSetup(kind: SuiteKind, config: SuiteConfig[SuiteKind]) {
  if (kind === "counter") return !(config as SuiteConfig["counter"]).pageId;
  if (kind === "forms") return !(config as SuiteConfig["forms"]).pageId;
  if (kind === "metric") {
    const c = config as SuiteConfig["metric"];
    return !c.dashboardId || !c.widgetId;
  }
  if (kind === "deadline") {
    const c = config as SuiteConfig["deadline"];
    return !c.pageId || (!c.rowId && !c.taskKey);
  }
  return false;
}

// ---- Settings of the app, not of the instance: profile and colour ----

// Which colours a widget takes: the instance's workspace accent (from the
// answer's theme; Flowplan's without one), the profile's colour dot, the
// system's (Material You on Android, the system's tint on iOS) or
// Flowplan's own.
export const WIDGET_COLORS = ["accent", "profile", "system", "flowplan"] as const;
export type WidgetColor = (typeof WIDGET_COLORS)[number];
export const isWidgetColor = (value: unknown): value is WidgetColor => typeof value === "string" && (WIDGET_COLORS as readonly string[]).includes(value);

// The workspace's look the instance sends with each answer (Flowplan's
// lib/workspace-theme.ts, contrast-checked for light and dark). Older
// instances send none.
export type WidgetTheme = { workspaceId?: string; accent: string; accentDark: string; onAccent: string; onAccentDark: string };
const HEX = /^#[0-9a-f]{6}$/i;
export function parseTheme(value: unknown): WidgetTheme | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (![v.accent, v.accentDark, v.onAccent, v.onAccentDark].every((c) => typeof c === "string" && HEX.test(c))) return null;
  const lower = (c: unknown) => (c as string).toLowerCase();
  return {
    ...(typeof v.workspaceId === "string" && v.workspaceId.length <= 100 ? { workspaceId: v.workspaceId } : {}),
    accent: lower(v.accent),
    accentDark: lower(v.accentDark),
    onAccent: lower(v.onAccent),
    onAccentDark: lower(v.onAccentDark),
  };
}

export const FLOWPLAN_ACCENT = { light: "#4146e6", dark: "#8f93ff" } as const;
export type Accent = { light: string; dark: string };

// The accent a widget is drawn with; "system" is the platform's own
// (Material You / the iOS tint), which the caller knows.
export function widgetAccent(color: WidgetColor, input: { theme?: WidgetTheme | null; profile?: Accent | null }): Accent | "system" {
  switch (color) {
    case "system":
      return "system";
    case "flowplan":
      return { ...FLOWPLAN_ACCENT };
    case "profile":
      return input.profile ? { light: input.profile.light, dark: input.profile.dark } : { ...FLOWPLAN_ACCENT };
    default:
      return input.theme ? { light: input.theme.accent, dark: input.theme.accentDark } : { ...FLOWPLAN_ACCENT };
  }
}

// A widget's profile: the one chosen in its settings while it exists,
// otherwise the active one (also when none was chosen).
export function widgetProfileId(state: ProfileState, chosen: string | null | undefined) {
  if (chosen && state.profiles.some((p) => p.id === chosen)) return chosen;
  return state.active;
}

// The configuration as the instance's data endpoint takes it (app-only
// settings such as the capture buttons or the time widget's timer stay
// on the phone).
export function serverConfig(kind: SuiteKind, config: SuiteConfig[SuiteKind]): Record<string, unknown> {
  switch (kind) {
    case "capture":
      return compact({ targetId: (config as SuiteConfig["capture"]).targetId });
    case "time":
      return {};
    case "study": {
      // No decks chosen: the instance counts all of them.
      const { pageIds } = config as SuiteConfig["study"];
      return pageIds.length ? { pageIds } : {};
    }
    default:
      return { ...config };
  }
}

// Widgets with the same settings share one answer.
export function configKey(kind: string, config: Record<string, unknown>) {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
          )
        : value;
  return `${kind}:${JSON.stringify(stable(config))}`;
}

// What the iOS widget extension gets (native/suite.ts): the active
// profile's instance and device token. Signed out (no token) the widgets
// keep their settings and ask to sign in; without a profile they are empty.
export function widgetSessionFor(state: ProfileState, token: string | null, lang: string) {
  const profile = activeProfile(state);
  return profile ? { server: profile.server, token: token || null, profile: profile.id, lang } : null;
}

// Every profile for the widgets' "Profile" setting, with its own session
// (each instance only ever gets its own token; the names stay on the
// phone). Profiles never signed in here come without token: their widgets
// ask to sign in.
export type WidgetProfile = { id: string; name: string; color: string; colorDark: string; server: string; token: string | null; lang: string; active: boolean };
export function widgetProfilesFor(state: ProfileState, tokenOf: (id: string) => string | null, colorOf: (id: string) => Accent, lang: string): WidgetProfile[] {
  return state.profiles.map((profile) => {
    const color = colorOf(profile.id);
    return {
      id: profile.id,
      name: profile.name,
      color: color.light,
      colorDark: color.dark,
      server: profile.server,
      token: tokenOf(profile.id) || null,
      lang,
      active: profile.id === state.active,
    };
  });
}

// The module reloaded the widgets after handing the session over (iOS,
// modules/flowplan-native: setWidgetSession).
export function sessionReloaded(result: string | null | undefined) {
  return result === "written" || result === "recovered" || result === "cleared";
}

// The instance answers at most 16 widgets per data request.
export const MAX_WIDGETS_PER_REQUEST = 16;
