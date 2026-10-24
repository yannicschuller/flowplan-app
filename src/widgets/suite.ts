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

export const SUITE_KINDS = ["capture", "tasks", "calendar", "pinned", "counter", "journal", "time", "mentions", "forms"] as const;
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
};
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
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID = /^[^\u0000-\u001f]{1,100}$/;
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
    case "calendar": {
      const sources = (Array.isArray(r.sources) ? r.sources : [])
        .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
        .map((s) => compact({ pageId: uuid(s.pageId) as string, viewId: shortId(s.viewId) }))
        .filter((s) => !!s.pageId)
        .slice(0, 10);
      out = { sources, range: oneOf(r.range, ["today", "3days", "week"] as const, "today"), tasks: bool(r.tasks, true), max: count(r.max, 1, 10, 10) };
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
    default:
      out = d;
  }
  return out as SuiteConfig[K];
}

// What a widget still needs before it can show anything: the counter and
// the form inbox have no sensible default page.
export function needsSetup(kind: SuiteKind, config: SuiteConfig[SuiteKind]) {
  if (kind === "counter") return !(config as SuiteConfig["counter"]).pageId;
  if (kind === "forms") return !(config as SuiteConfig["forms"]).pageId;
  return false;
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

// The module reloaded the widgets after handing the session over (iOS,
// modules/flowplan-native: setWidgetSession).
export function sessionReloaded(result: string | null | undefined) {
  return result === "written" || result === "recovered" || result === "cleared";
}

// The instance answers at most 16 widgets per data request.
export const MAX_WIDGETS_PER_REQUEST = 16;
