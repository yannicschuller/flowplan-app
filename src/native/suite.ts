// The configurable widgets on the phone (widgets/suite.ts):
// - iOS: the widget extension asks the instances itself (Swift,
//   plugins/widget-suite); the app hands it the sessions – the active
//   profile's and every profile's own (instance, device token, name, colour)
//   for the widgets' "Profile" setting – and asks it to reload after changes.
// - Android: the app does it – one batched data request per profile for
//   every widget showing it, the last answers kept per profile for offline,
//   taps on checkboxes and buttons run the action and draw the widget again.
// Each widget shows the profile chosen in its settings (none: the active
// one), with that profile's own device token: no instance ever gets another
// one's token, name or address. Signing out of a profile keeps its widgets'
// settings and shows "Open Flowplan to sign in"; a new sign-in refreshes them.
import { Appearance, AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { getWidgetInfo, requestPinWidget, requestWidgetUpdateById } from "react-native-android-widget";
import { reloadWidgets, setWidgetProfiles, setWidgetSession, widgetAccents, widgetActionError, type WidgetSession } from "../../modules/flowplan-native/src";
import { setWidgetPreview, widgetPreviewsSupported } from "../../modules/flowplan-android/src";
import { locale } from "../i18n";
import { PROFILE_COLORS, profileColor, type ProfileState } from "../profiles";
import { store } from "../store";
import { localDay } from "../summary";
import { widgetAction, widgetData, type ActionName, type Connection, type WidgetResult } from "../widgets/api";
import { renderSuite, SUITE_CLICKS } from "../widgets/android-suite";
import { kindTitle, sampleConfig, sampleResult, suiteView, themeOf } from "../widgets/present";
import {
  extraRequests,
  needsSetup,
  OFFERED_KINDS,
  serverRequest,
  sessionReloaded,
  SUITE_KINDS,
  SUITE_WIDGETS,
  kindOfWidget,
  widgetAccent,
  widgetProfileId,
  widgetProfilesFor,
  widgetSessionFor,
  type Accent,
  type SuiteKind,
  type WidgetColor,
} from "../widgets/suite";
import {
  bindingFor,
  configFor,
  forgetProfile,
  forgetProfileBindings,
  parseBindings,
  parseConfigState,
  removeBinding,
  removeWidget,
  setBinding,
  setConfig,
  type Bindings,
  type ConfigState,
  type WidgetBinding,
} from "../widgets/widget-config";
import { actionMarks, answered, parseActions, settled, tapItem, tapped, type ActionError, type ActionState } from "../widgets/actions";

const withWidgets = (Constants.expoConfig?.extra as { widgets?: boolean } | undefined)?.widgets !== false;

// The active profile's instance and device token (capture, shortcuts …).
export function connection(): Connection | null {
  const server = store.server(),
    token = store.deviceToken();
  return server && token ? { server, token, lang: locale() } : null;
}

// Any profile's instance with that profile's own device token.
export function connectionFor(profileId: string | null): Connection | null {
  if (!profileId) return null;
  const profile = store.profiles().profiles.find((p) => p.id === profileId);
  const token = profile ? store.deviceTokenOf(profile.id) : null;
  return profile && token ? { server: profile.server, token, lang: locale() } : null;
}

// The colours of a profile's dot (the chosen one, or derived).
export function profileAccent(state: ProfileState, id: string): Accent {
  return { ...PROFILE_COLORS[profileColor(state, id, store.instanceAccent(id))] };
}

export const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

// ---- iOS ----

let lastReload = 0;

// What the widget extension needs; null without a profile. A missing token
// is "signed out": the widgets keep their settings and ask to sign in.
export function widgetSession(): WidgetSession | null {
  return widgetSessionFor(store.profiles(), store.deviceToken(), locale());
}

// Handed over on every start, every return to the foreground and after every
// summary, not only when it changed in this run of the app: the shared
// keychain item may be missing (an installation registered before the
// widgets existed), older than the app's token (renewed at each start) or
// marked as refused by the extension. The module compares with what the
// keychain holds and writes (and reloads the widgets) only when needed.
// With it every profile's own session, for widgets set to another profile.
export function syncWidgetSession() {
  if (Platform.OS !== "ios" || !withWidgets) return false;
  const state = store.profiles();
  // What the extension learnt of the instances' accents (colour dots).
  for (const [id, accent] of Object.entries(widgetAccents())) if (state.profiles.some((p) => p.id === id)) store.setInstanceAccent(id, accent);
  const profiles = setWidgetProfiles(widgetProfilesFor(state, (id) => store.deviceTokenOf(id), (id) => profileAccent(state, id), locale()));
  const result = setWidgetSession(widgetSession());
  if (result === "failed" || profiles === "failed") console.warn("Flowplan: the widgets' session was not saved");
  if (!sessionReloaded(result) && profiles !== "written") return false;
  // The profiles changed alone: the widgets that show them ask again.
  if (!sessionReloaded(result)) reloadWidgets();
  lastReload = Date.now();
  return true;
}

// ---- Android: settings and the last answers, in the app's own files ----

const configFile = () => new File(Paths.document, "widget-settings.json");
const bindingsFile = () => new File(Paths.document, "widget-bindings.json");
const answersFile = (profile: string) => new File(Paths.document, `widget-answers-${profile}.json`);
const previewsFile = () => new File(Paths.document, "widget-previews.json");

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
export const readBindings = (): Bindings => parseBindings(readText(bindingsFile()));
// What the buttons did (widgets/actions.ts).
const actionsFile = () => new File(Paths.document, "widget-actions.json");
const readActions = (): ActionState => parseActions(readText(actionsFile()));
const writeActions = (state: ActionState) => writeText(actionsFile(), JSON.stringify(state));
const writeConfigs = (state: ConfigState) => writeText(configFile(), JSON.stringify(state));
const writeBindings = (bindings: Bindings) => writeText(bindingsFile(), JSON.stringify(bindings));

// An answer with when it came from the instance (the widget's footer; a
// failed refresh keeps the last good one and its time).
type StoredAnswer = WidgetResult & { at?: number };
function readAnswers(profile: string): Record<string, StoredAnswer> {
  try {
    return JSON.parse(readText(answersFile(profile)) || "{}") as Record<string, StoredAnswer>;
  } catch {
    return {};
  }
}

// A widget's profile and colours (the configuration screen shows them).
export function widgetBinding(widgetId: number): WidgetBinding & { resolved: string | null } {
  const binding = bindingFor(readBindings(), widgetId);
  return { ...binding, resolved: widgetProfileId(store.profiles(), binding.profile) };
}

type AndroidWidget = { name: string; id: number; kind: SuiteKind; width: number; height: number; profile: string | null; color: WidgetColor };

async function androidWidgets(): Promise<AndroidWidget[]> {
  const all: AndroidWidget[] = [];
  const bindings = readBindings();
  const state = store.profiles();
  for (const kind of SUITE_KINDS) {
    const infos = await getWidgetInfo(SUITE_WIDGETS[kind]).catch(() => []);
    for (const info of infos) {
      const binding = bindingFor(bindings, info.widgetId);
      all.push({ name: info.widgetName, id: info.widgetId, kind, width: info.width, height: info.height, profile: widgetProfileId(state, binding.profile), color: binding.color });
    }
  }
  return all;
}

// Draws one widget from what is known (no request).
export function suiteRender(kind: SuiteKind, widgetId: number, size: { width: number; height: number }) {
  const state = store.profiles();
  const binding = bindingFor(readBindings(), widgetId);
  const profile = widgetProfileId(state, binding.profile);
  const config = configFor(readConfigs(), profile, widgetId, kind);
  const answers = profile ? readAnswers(profile) : {};
  const answer = answers[String(widgetId)] ?? null;
  // The further answers ("Today": the next appointment, unread mentions).
  const extras = Object.fromEntries(extraRequests(kind, config).map((extra) => [extra.key, answers[`${widgetId}:${extra.key}`] ?? null]));
  const view = suiteView(kind, config, answer, {
    locale: locale(),
    today: localDay(),
    signedIn: !!connectionFor(profile),
    marks: actionMarks(readActions()),
    ...(answer?.ok && typeof answer.at === "number" ? { fetchedAt: answer.at } : {}),
    extras,
  });
  const accent = widgetAccent(binding.color, { theme: themeOf(answer), profile: profile ? profileAccent(state, profile) : null });
  return renderSuite(view, size, widgetId, accent);
}

// One batched request per profile for the configurable widgets showing it,
// then draws them all. fetch false: draws from the last answers (signed
// out, offline, resize). Android asks each widget for its update on its own:
// within a minute the first request answers them all (force: after an
// action or new settings).
let lastFetch = 0;
export async function refreshAndroidSuite(options: { fetch: boolean; force?: boolean }) {
  if (Platform.OS !== "android") return;
  const widgets = await androidWidgets();
  if (!widgets.length) return;
  const configs = readConfigs();
  if (options.fetch && (options.force || Date.now() - lastFetch > 60_000)) {
    lastFetch = Date.now();
    const started = lastFetch;
    const profiles = [...new Set(widgets.map((w) => w.profile).filter((p): p is string => !!p))];
    let fresh = false;
    for (const profile of profiles) {
      const target = connectionFor(profile);
      if (!target) continue;
      const requests = widgets
        .filter((w) => w.profile === profile)
        .map((w) => ({ w, config: configFor(configs, profile, w.id, w.kind) }))
        .filter(({ w, config }) => !needsSetup(w.kind, config))
        .flatMap(({ w, config }) => [
          { id: String(w.id), ...serverRequest(w.kind, config) },
          ...extraRequests(w.kind, config).map((extra) => ({ id: `${w.id}:${extra.key}`, kind: extra.kind, config: extra.config })),
        ]);
      if (!requests.length) continue;
      const result = await widgetData(target, requests, { today: localDay(), zone: timeZone() });
      if (!result.ok) {
        // That profile's token died with its session: its widgets ask to
        // sign in (the active one's is the app's to notice, sync.ts).
        if ("signedOut" in result && profile !== store.profiles().active) {
          store.setDeviceTokenOf(profile, null);
          await writeText(answersFile(profile), null);
        }
        continue;
      }
      fresh = true;
      const answers = readAnswers(profile);
      const at = Date.now();
      for (const [id, answer] of result.value) {
        const previous = answers[id];
        // A failed answer keeps the last good one, unless the page is gone.
        if (!answer.ok && previous?.ok && answer.status !== 403 && answer.status !== 404) continue;
        answers[id] = { ...answer, at };
        // The instance's accent: the default of the profile's colour dot.
        const theme = themeOf(answer);
        if (theme) store.setInstanceAccent(profile, theme.accent);
      }
      const live = new Set(widgets.filter((w) => w.profile === profile).map((w) => String(w.id)));
      await writeText(answersFile(profile), JSON.stringify(Object.fromEntries(Object.entries(answers).filter(([id]) => live.has(id.split(":")[0])))));
    }
    // Fresh answers: what was tapped before is shown as the instance says.
    if (fresh) await writeActions(settled(readActions(), started));
  }
  await Promise.allSettled(
    widgets.map((w) =>
      requestWidgetUpdateById({ widgetName: w.name, widgetId: w.id, renderWidget: (info) => suiteRender(w.kind, w.id, { width: info.width, height: info.height }) }),
    ),
  );
}

// A tap on a checkbox, "read", or the timer (widget-task.ts): with the
// widget's own profile.
export async function handleSuiteClick(clickAction: string, data: Record<string, unknown>) {
  const widgetId = typeof data.widgetId === "number" ? data.widgetId : Number(data.widgetId);
  const profile = Number.isFinite(widgetId) ? widgetProfileId(store.profiles(), bindingFor(readBindings(), widgetId).profile) : store.profiles().active;
  const target = connectionFor(profile);
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
  // Drawn done at once, then the action; a refusal brings the item back
  // with a hint and is kept for the app's settings.
  const item = tapItem(action, fields);
  await writeActions(tapped(readActions(), item, Date.now()));
  await refreshAndroidSuite({ fetch: false });
  const result = await widgetAction(target, action, action === "task.complete" ? { ...fields, done: true } : fields);
  const outcome = result.ok
    ? { ok: true as const }
    : "signedOut" in result
      ? { ok: false as const, action, status: 401, message: "signed out" }
      : { ok: false as const, action, status: result.status, message: result.error || (result.status ? "" : "network") };
  if (!outcome.ok) console.warn(`Widget action ${action} failed: ${outcome.status} ${outcome.message}`);
  await writeActions(answered(readActions(), item, Date.now(), outcome));
  await refreshAndroidSuite({ fetch: true, force: true });
}

// The last action of a widget's button that went wrong (the app's settings).
export function lastWidgetActionError(): ActionError | null {
  if (Platform.OS === "ios") return widgetActionError();
  if (Platform.OS !== "android") return null;
  return readActions().lastError ?? null;
}

// The configuration screen saved a widget's settings: its profile and
// colours, and its content settings for that profile.
export async function saveWidgetConfig(widgetName: string, widgetId: number, config: unknown, binding: Partial<WidgetBinding> = {}) {
  const kind = kindOfWidget(widgetName);
  const bindings = setBinding(readBindings(), widgetId, binding);
  const profile = widgetProfileId(store.profiles(), bindingFor(bindings, widgetId).profile);
  if (!kind || !profile) return;
  await writeBindings(bindings);
  await writeConfigs(setConfig(readConfigs(), profile, widgetId, kind, config));
  await refreshAndroidSuite({ fetch: true, force: true });
}

export async function widgetRemoved(widgetId: number) {
  await writeConfigs(removeWidget(readConfigs(), widgetId));
  await writeBindings(removeBinding(readBindings(), widgetId));
}

// "Add widget" in the app's settings (Android 8+, launchers that support
// it): the launcher's own dialog. false: it cannot.
export async function addWidget(kind: SuiteKind) {
  if (Platform.OS !== "android") return false;
  try {
    return await requestPinWidget({ widgetName: SUITE_WIDGETS[kind] });
  } catch {
    return false;
  }
}

// Android 15+: each widget's picture in the widget picker, drawn with
// sample content in the person's language and the current light or dark
// look – once per app version, language and look (the system limits how
// often; a refusal is tried again at the next start).
export async function syncWidgetPreviews() {
  if (Platform.OS !== "android" || !widgetPreviewsSupported()) return;
  const lang = locale();
  const scheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
  const key = `${Application.nativeApplicationVersion ?? ""}|${lang}|${scheme}`;
  let done: Record<string, string> = {};
  try {
    done = JSON.parse(readText(previewsFile()) || "{}") as Record<string, string>;
  } catch {}
  // react-native-android-widget's own renderer (Metro reads its sources):
  // the tree its createPreview draws into a picture.
  const { buildWidgetTree } = require("react-native-android-widget/src/api/build-widget-tree") as { buildWidgetTree: (jsx: unknown) => unknown };
  const { AndroidWidget } = require("react-native-android-widget/src/AndroidWidget") as {
    AndroidWidget: { createPreview(tree: unknown, width: number, height: number): Promise<{ base64Image: string }> };
  };
  const now = Date.now();
  // The widgets no longer offered are hidden from the picker: no picture.
  for (const kind of OFFERED_KINDS) {
    const name = SUITE_WIDGETS[kind];
    if (done[name] === key) continue;
    const wide = !["counter", "forms", "study", "metric", "deadline"].includes(kind);
    const size = wide ? { width: 320, height: 160 } : { width: 160, height: 160 };
    try {
      const view = suiteView(kind, sampleConfig(kind), sampleResult(kind, lang, localDay(), now), { locale: lang, today: localDay(), signedIn: true, now });
      const drawn = renderSuite(view, size, 0, { light: "#4146e6", dark: "#8f93ff" });
      const preview = await AndroidWidget.createPreview(buildWidgetTree(drawn[scheme]), size.width, size.height);
      if (!preview.base64Image || !(await setWidgetPreview(name, preview.base64Image, kindTitle(kind, lang)))) continue;
      done[name] = key;
    } catch {}
  }
  await writeText(previewsFile(), JSON.stringify(done));
}

// ---- Both ----

// After a change (the page reported one, back in the foreground, the
// background task): the widgets follow. iOS reloads at most once a minute
// unless forced (the extension then asks the instance once for all), and
// not from the background: reloads from there count against the widgets'
// daily budget, and the extension refreshes on its own schedule.
export async function refreshSuite(options: { force?: boolean } = {}) {
  if (!withWidgets) return;
  if (Platform.OS === "ios") {
    if (syncWidgetSession()) return;
    if (AppState.currentState !== "active" && !options.force) return;
    if (options.force || Date.now() - lastReload > 60_000) {
      lastReload = Date.now();
      reloadWidgets();
    }
    return;
  }
  await refreshAndroidSuite({ fetch: true, force: options.force });
}

// A removed profile: its answers and (Android) its widgets' settings go;
// widgets that showed it show the active profile now.
export async function forgetSuiteProfile(profile: string) {
  if (Platform.OS !== "android") return;
  await writeText(answersFile(profile), null);
  await writeConfigs(forgetProfile(readConfigs(), profile));
  await writeBindings(forgetProfileBindings(readBindings(), profile));
}

// Signed out of a profile: nothing of its content stays on the home screen
// (its widgets ask to sign in).
export async function clearSuiteAnswers(profile: string | null) {
  if (Platform.OS === "android" && profile) await writeText(answersFile(profile), null);
}
