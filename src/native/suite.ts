// The configurable widgets on the phone (widgets/suite.ts):
// - iOS: the widget extension asks the instance itself (Swift,
//   plugins/widget-suite); the app hands it the session (instance, device
//   token, profile, language) and asks it to reload after changes.
// - Android: the app does it – one batched data request for every widget on
//   the home screens, the last answers kept per profile for offline, taps on
//   checkboxes and buttons run the action and draw the widget again.
// Signing out keeps every widget's settings and shows "Open Flowplan to sign
// in"; a new sign-in refreshes them at once.
import { Platform } from "react-native";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { getWidgetInfo, requestWidgetUpdateById } from "react-native-android-widget";
import { reloadWidgets, setWidgetSession, type WidgetSession } from "../../modules/flowplan-native/src";
import { locale } from "../i18n";
import { store } from "../store";
import { localDay } from "../summary";
import { widgetAction, widgetData, type ActionName, type Connection, type WidgetResult } from "../widgets/api";
import { renderSuite, SUITE_CLICKS } from "../widgets/android-suite";
import { suiteView } from "../widgets/present";
import { needsSetup, serverConfig, SUITE_KINDS, SUITE_WIDGETS, kindOfWidget, widgetSessionFor, type SuiteKind } from "../widgets/suite";
import { configFor, forgetProfile, parseConfigState, removeWidget, setConfig, type ConfigState } from "../widgets/widget-config";

const withWidgets = (Constants.expoConfig?.extra as { widgets?: boolean } | undefined)?.widgets !== false;

export function connection(): Connection | null {
  const server = store.server(),
    token = store.deviceToken();
  return server && token ? { server, token, lang: locale() } : null;
}

export const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// ---- iOS ----

let lastSession = "";
let lastReload = 0;

// What the widget extension needs; null without a profile. A missing token
// is "signed out": the widgets keep their settings and ask to sign in.
export function widgetSession(): WidgetSession | null {
  return widgetSessionFor(store.profiles(), store.deviceToken(), locale());
}

export function syncWidgetSession() {
  if (Platform.OS !== "ios" || !withWidgets) return false;
  const session = widgetSession();
  const key = JSON.stringify(session);
  if (key === lastSession) return false;
  lastSession = key;
  // The module reloads the widgets when the session changed.
  setWidgetSession(session);
  lastReload = Date.now();
  return true;
}

// ---- Android: settings and the last answers, in the app's own files ----

const configFile = () => new File(Paths.document, "widget-settings.json");
const answersFile = (profile: string) => new File(Paths.document, `widget-answers-${profile}.json`);

function readText(file: File) {
  try {
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}
async function writeText(file: File, text: string | null) {
  try {
    if (text === null) {
      if (file.exists) file.delete();
      return;
    }
    if (!file.exists) file.create();
    await file.write(text);
  } catch {}
}

export const readConfigs = (): ConfigState => parseConfigState(readText(configFile()));
const writeConfigs = (state: ConfigState) => writeText(configFile(), JSON.stringify(state));

function readAnswers(profile: string): Record<string, WidgetResult> {
  try {
    return JSON.parse(readText(answersFile(profile)) || "{}") as Record<string, WidgetResult>;
  } catch {
    return {};
  }
}

type AndroidWidget = { name: string; id: number; kind: SuiteKind; width: number; height: number };

async function androidWidgets(): Promise<AndroidWidget[]> {
  const all: AndroidWidget[] = [];
  for (const kind of SUITE_KINDS) {
    const infos = await getWidgetInfo(SUITE_WIDGETS[kind]).catch(() => []);
    for (const info of infos) all.push({ name: info.widgetName, id: info.widgetId, kind, width: info.width, height: info.height });
  }
  return all;
}

// Draws one widget from what is known (no request).
export function suiteRender(kind: SuiteKind, widgetId: number, size: { width: number; height: number }) {
  const profile = store.profiles().active;
  const config = configFor(readConfigs(), profile, widgetId, kind);
  const answer = profile ? (readAnswers(profile)[String(widgetId)] ?? null) : null;
  const view = suiteView(kind, config, answer, { locale: locale(), today: localDay(), signedIn: !!connection() });
  return renderSuite(view, size, widgetId);
}

// One batched request for every configurable widget, then draws them all.
// fetch false: draws from the last answers (signed out, offline, resize).
export async function refreshAndroidSuite(options: { fetch: boolean }) {
  if (Platform.OS !== "android") return;
  const widgets = await androidWidgets();
  if (!widgets.length) return;
  const profile = store.profiles().active;
  const configs = readConfigs();
  const target = connection();
  if (options.fetch && target && profile) {
    const requests = widgets
      .map((w) => ({ w, config: configFor(configs, profile, w.id, w.kind) }))
      .filter(({ w, config }) => !needsSetup(w.kind, config))
      .map(({ w, config }) => ({ id: String(w.id), kind: w.kind, config: serverConfig(w.kind, config) }));
    if (requests.length) {
      const result = await widgetData(target, requests, { today: localDay(), zone: timeZone() });
      if (result.ok) {
        const answers = readAnswers(profile);
        for (const [id, answer] of result.value) {
          const previous = answers[id];
          // A failed answer keeps the last good one, unless the page is gone.
          if (!answer.ok && previous?.ok && answer.status !== 403 && answer.status !== 404) continue;
          answers[id] = answer;
        }
        const live = new Set(widgets.map((w) => String(w.id)));
        await writeText(answersFile(profile), JSON.stringify(Object.fromEntries(Object.entries(answers).filter(([id]) => live.has(id)))));
      }
    }
  }
  await Promise.allSettled(
    widgets.map((w) =>
      requestWidgetUpdateById({ widgetName: w.name, widgetId: w.id, renderWidget: (info) => suiteRender(w.kind, w.id, { width: info.width, height: info.height }) }),
    ),
  );
}

// A tap on a checkbox, "read", or the timer (widget-task.ts).
export async function handleSuiteClick(clickAction: string, data: Record<string, unknown>) {
  const target = connection();
  if (!target) return;
  const { widgetId: _widgetId, ...fields } = data;
  const actions: Record<string, ActionName> = {
    [SUITE_CLICKS.complete]: "task.complete",
    [SUITE_CLICKS.habit]: "habit.check",
    [SUITE_CLICKS.read]: "mention.read",
    [SUITE_CLICKS.readAll]: "mention.readAll",
    [SUITE_CLICKS.timerStart]: "timer.start",
    [SUITE_CLICKS.timerStop]: "timer.stop",
  };
  const action = actions[clickAction];
  if (!action) return;
  await widgetAction(target, action, action === "task.complete" ? { ...fields, done: true } : fields);
  await refreshAndroidSuite({ fetch: true });
}

// The configuration screen saved a widget's settings.
export async function saveWidgetConfig(widgetName: string, widgetId: number, config: unknown) {
  const kind = kindOfWidget(widgetName);
  const profile = store.profiles().active;
  if (!kind || !profile) return;
  await writeConfigs(setConfig(readConfigs(), profile, widgetId, kind, config));
  await refreshAndroidSuite({ fetch: true });
}

export async function widgetRemoved(widgetId: number) {
  await writeConfigs(removeWidget(readConfigs(), widgetId));
}

// ---- Both ----

// After a change (the page reported one, back in the foreground, the
// background task): the widgets follow. iOS reloads at most once a minute
// unless forced (the extension then asks the instance once for all).
export async function refreshSuite(options: { force?: boolean } = {}) {
  if (!withWidgets) return;
  if (Platform.OS === "ios") {
    if (syncWidgetSession()) return;
    if (options.force || Date.now() - lastReload > 60_000) {
      lastReload = Date.now();
      reloadWidgets();
    }
    return;
  }
  await refreshAndroidSuite({ fetch: !!connection() });
}

// A removed profile: its answers and (Android) its widgets' settings go.
// Signing out alone keeps the settings.
export async function forgetSuiteProfile(profile: string) {
  if (Platform.OS !== "android") return;
  await writeText(answersFile(profile), null);
  await writeConfigs(forgetProfile(readConfigs(), profile));
}

// Leaving a profile (switch, sign out): nothing of its content stays on the
// home screen.
export async function clearSuiteAnswers(profile: string | null) {
  if (Platform.OS === "android" && profile) await writeText(answersFile(profile), null);
}
