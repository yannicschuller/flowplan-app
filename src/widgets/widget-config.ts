// Android keeps the settings of each configurable widget itself: per
// profile and appWidgetId (iOS keeps them in the widget's AppIntent). Signing
// out keeps them; a removed widget or profile takes its settings along. A
// widget shown for another profile than the one it was set up for starts
// from the defaults (pages of one instance mean nothing on another) and
// gets its own settings back when that profile is active again.
// Pure functions – native/suite.ts reads and writes the file, the tests a
// string.
import { isWidgetColor, normalizeConfig, SUITE_KINDS, type SuiteConfig, type SuiteKind, type WidgetColor } from "./suite";

type Stored = { kind: SuiteKind; config: unknown };
export type ConfigState = Record<string, Record<string, Stored>>;

export function parseConfigState(text: string | null): ConfigState {
  try {
    const raw = JSON.parse(text || "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: ConfigState = {};
    for (const [profile, widgets] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^[a-z0-9]{1,32}$/.test(profile) || !widgets || typeof widgets !== "object") continue;
      for (const [id, stored] of Object.entries(widgets as Record<string, Stored>)) {
        if (!/^\d{1,10}$/.test(id) || !stored || !SUITE_KINDS.includes(stored.kind)) continue;
        (out[profile] ??= {})[id] = { kind: stored.kind, config: normalizeConfig(stored.kind, stored.config) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function configFor<K extends SuiteKind>(state: ConfigState, profile: string | null, widgetId: number, kind: K): SuiteConfig[K] {
  const stored = profile ? state[profile]?.[String(widgetId)] : undefined;
  return normalizeConfig(kind, stored && stored.kind === kind ? stored.config : undefined);
}

export function setConfig(state: ConfigState, profile: string, widgetId: number, kind: SuiteKind, config: unknown): ConfigState {
  return { ...state, [profile]: { ...(state[profile] ?? {}), [String(widgetId)]: { kind, config: normalizeConfig(kind, config) } } };
}

// The widget was removed from the home screen: its settings go for every
// profile (Android does not reuse ids).
export function removeWidget(state: ConfigState, widgetId: number): ConfigState {
  const out: ConfigState = {};
  for (const [profile, widgets] of Object.entries(state)) {
    const { [String(widgetId)]: _gone, ...rest } = widgets;
    if (Object.keys(rest).length) out[profile] = rest;
  }
  return out;
}

// The profile was removed (not: signed out).
export function forgetProfile(state: ConfigState, profile: string): ConfigState {
  const { [profile]: _gone, ...rest } = state;
  return rest;
}

// ---- Profile and colour of each widget (Android; iOS keeps them in the
// widget's AppIntent) ----
// Kept apart from the settings above, which belong to a profile: these say
// which profile a widget shows (none chosen: the active one) and which
// colours it takes. A removed widget takes them along; a removed profile
// leaves its widgets on the active one.
export type WidgetBinding = { profile?: string; color: WidgetColor };
export type Bindings = Record<string, WidgetBinding>;
const DEFAULT_BINDING: WidgetBinding = { color: "accent" };

export function parseBindings(text: string | null): Bindings {
  try {
    const raw = JSON.parse(text || "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Bindings = {};
    for (const [id, value] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
      if (!/^\d{1,10}$/.test(id) || !value || typeof value !== "object") continue;
      const profile = typeof value.profile === "string" && /^[a-z0-9]{1,32}$/.test(value.profile) ? value.profile : undefined;
      out[id] = { ...(profile ? { profile } : {}), color: isWidgetColor(value.color) ? value.color : "accent" };
    }
    return out;
  } catch {
    return {};
  }
}

export const bindingFor = (bindings: Bindings, widgetId: number): WidgetBinding => bindings[String(widgetId)] ?? { ...DEFAULT_BINDING };

export function setBinding(bindings: Bindings, widgetId: number, binding: Partial<WidgetBinding>): Bindings {
  const profile = typeof binding.profile === "string" && /^[a-z0-9]{1,32}$/.test(binding.profile) ? binding.profile : undefined;
  return { ...bindings, [String(widgetId)]: { ...(profile ? { profile } : {}), color: isWidgetColor(binding.color) ? binding.color : "accent" } };
}

export function removeBinding(bindings: Bindings, widgetId: number): Bindings {
  const { [String(widgetId)]: _gone, ...rest } = bindings;
  return rest;
}

export function forgetProfileBindings(bindings: Bindings, profile: string): Bindings {
  return Object.fromEntries(Object.entries(bindings).map(([id, b]) => [id, b.profile === profile ? { color: b.color } : b]));
}
