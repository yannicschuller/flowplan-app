// Widgets 2026: a profile and colours per widget, the profiles' colour
// dots, widget push (iOS 26), the four new widgets, Android's sizes and
// previews. Pure parts here; the native ones are checked for their wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import {
  ACTIVE_ONLY_KEYS,
  nearestColor,
  parseProfiles,
  PROFILE_COLORS,
  PROFILE_KEYS,
  profileColor,
  serializeProfiles,
  setProfileColor,
  type ProfileState,
} from "../src/profiles";
import {
  DEFAULTS,
  FLOWPLAN_ACCENT,
  needsSetup,
  normalizeConfig,
  NEWER_KINDS,
  parseTheme,
  serverConfig,
  SUITE_KINDS,
  SUITE_WIDGETS,
  widgetAccent,
  widgetProfileId,
  widgetProfilesFor,
} from "../src/widgets/suite";
import { bindingFor, forgetProfileBindings, parseBindings, removeBinding, setBinding } from "../src/widgets/widget-config";
import { formatDuration, joinLink, sampleConfig, sampleResult, suiteView, themeOf } from "../src/widgets/present";
import { widgetData } from "../src/widgets/api";
import {
  isDeviceToken,
  needsWidgetRegistration,
  parseWidgetPushRecord,
  registrationBody,
  sendWidgetPushToken,
  setDevicePush,
  widgetPushField,
  type HttpAnswer,
  type WidgetPushRecord,
} from "../src/push-relay";
import { accentThemes, blend } from "../src/android/theme";
// The Flowplan themes of src/widgets/android.tsx (which needs React Native).
const LIGHT = { background: "#fcfbf8", text: "#1d1b22", muted: "#6b6876", brand: "#4146e6", late: "#c23b3b", line: "#ebe8f2", warn: "#b7791f", ok: "#2f855a" };
const DARK = { background: "#16151b", text: "#f2f0f7", muted: "#a19dad", brand: "#8f93ff", late: "#ff7a7a", line: "#2a2832", warn: "#f6c25b", ok: "#68d391" };

const root = join(import.meta.dirname, "..");
const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";
const ROW = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const now = Date.parse("2026-11-19T10:00:00Z");
const options = { locale: "en" as const, today: "2026-11-19", signedIn: true, now };
const state: ProfileState = {
  profiles: [
    { id: "work", name: "Work", server: "https://flowplan.company.com" },
    { id: "home", name: "Private", server: "https://notes.example" },
  ],
  active: "work",
};

test("profiles keep a colour dot; without one it follows the instance's accent, else the position", () => {
  assert.equal(profileColor(state, "work"), "indigo");
  assert.equal(profileColor(state, "home"), "blue");
  // The instance's accent is green-ish: the dot is green.
  assert.equal(nearestColor("#2b8a3e"), "green");
  assert.equal(profileColor(state, "home", "#2b8a3e"), "green");
  assert.equal(nearestColor("nope"), null);
  const chosen = setProfileColor(state, "home", "pink");
  assert.equal(profileColor(chosen, "home", "#2b8a3e"), "pink");
  // Stored and read again; an unknown colour is dropped.
  const again = parseProfiles(serializeProfiles(chosen));
  assert.equal(again?.profiles[1].color, "pink");
  assert.equal(parseProfiles(JSON.stringify({ profiles: [{ id: "a", name: "A", server: "https://a.example", color: "chartreuse" }], active: "a" }))?.profiles[0].color, undefined);
  assert.equal(setProfileColor(chosen, "home", null).profiles[1].color, undefined);
  for (const tone of Object.values(PROFILE_COLORS)) assert.match(tone.light + tone.dark, /^#[0-9a-f]{6}#[0-9a-f]{6}$/);
});

test("a switch keeps the device token and the widgets' push registration, only what is the active one's goes", () => {
  assert.ok(PROFILE_KEYS.includes("deviceToken") && PROFILE_KEYS.includes("widgetPush"));
  assert.ok(!ACTIVE_ONLY_KEYS.includes("deviceToken") && !ACTIVE_ONLY_KEYS.includes("widgetPush") && !ACTIVE_ONLY_KEYS.includes("pushOff"));
  for (const key of ["summary", "adminSummary", "push", "livePush"] as const) assert.ok(ACTIVE_ONLY_KEYS.includes(key), key);
});

test("each widget shows its profile (none chosen or gone: the active one) in its colours", () => {
  assert.equal(widgetProfileId(state, "home"), "home");
  assert.equal(widgetProfileId(state, undefined), "work");
  assert.equal(widgetProfileId(state, "gone"), "work");
  let bindings = parseBindings(null);
  assert.deepEqual(bindingFor(bindings, 7), { color: "accent" });
  bindings = setBinding(bindings, 7, { profile: "home", color: "profile" });
  bindings = setBinding(bindings, 8, { profile: "../x", color: "rainbow" as never });
  bindings = parseBindings(JSON.stringify(bindings));
  assert.deepEqual(bindingFor(bindings, 7), { profile: "home", color: "profile" });
  assert.deepEqual(bindingFor(bindings, 8), { color: "accent" });
  // A removed profile: its widgets show the active one, colours stay.
  assert.deepEqual(bindingFor(forgetProfileBindings(bindings, "home"), 7), { color: "profile" });
  assert.deepEqual(Object.keys(removeBinding(bindings, 7)), ["8"]);
  assert.deepEqual(parseBindings("{"), {});
});

test("colours: the workspace accent from the answer, the profile's dot, the system's or Flowplan's", () => {
  const theme = parseTheme({ workspaceId: "w", accent: "#C2410C", accentDark: "#FB923C", onAccent: "#ffffff", onAccentDark: "#121117" });
  assert.deepEqual(theme, { workspaceId: "w", accent: "#c2410c", accentDark: "#fb923c", onAccent: "#ffffff", onAccentDark: "#121117" });
  assert.equal(parseTheme({ accent: "red" }), null);
  const profile = PROFILE_COLORS.teal;
  assert.deepEqual(widgetAccent("accent", { theme, profile }), { light: "#c2410c", dark: "#fb923c" });
  // An older instance sends no theme: Flowplan's.
  assert.deepEqual(widgetAccent("accent", { theme: null, profile }), FLOWPLAN_ACCENT);
  assert.deepEqual(widgetAccent("profile", { theme, profile }), { light: profile.light, dark: profile.dark });
  assert.equal(widgetAccent("system", { theme, profile }), "system");
  assert.deepEqual(widgetAccent("flowplan", { theme, profile }), FLOWPLAN_ACCENT);
  // The theme is next to the answer's data (also inside it, to be lenient).
  assert.deepEqual(themeOf({ id: "1", kind: "tasks", ok: true, data: {}, theme } as never), theme);
  assert.deepEqual(themeOf({ id: "1", kind: "tasks", ok: true, data: { theme } }), theme);
  assert.equal(themeOf(null), null);
  // Android draws Flowplan's surfaces in the accent; lines a wash of it.
  const themes = accentThemes({ light: "#c2410c", dark: "#fb923c" }, { light: LIGHT, dark: DARK });
  assert.equal(themes.light.brand, "#c2410c");
  assert.equal(themes.dark.brand, "#fb923c");
  assert.equal(themes.light.late, LIGHT.late);
  assert.equal(blend("#000000", "#ffffff", 0.5), "#808080");
});

test("the extension gets every profile with its own token; names stay on the phone", () => {
  const list = widgetProfilesFor(state, (id) => (id === "work" ? "fpd_work" : null), (id) => ({ ...PROFILE_COLORS[profileColor(state, id)] }), "de");
  assert.deepEqual(
    list.map(({ id, token, active, server }) => ({ id, token, active, server })),
    [
      { id: "work", token: "fpd_work", active: true, server: "https://flowplan.company.com" },
      { id: "home", token: null, active: false, server: "https://notes.example" },
    ],
  );
  assert.equal(list[1].color, PROFILE_COLORS.blue.light);
});

test("the four new widgets: settings, defaults, what they need first", () => {
  for (const kind of NEWER_KINDS) assert.ok(SUITE_KINDS.includes(kind) && SUITE_WIDGETS[kind], kind);
  assert.deepEqual(DEFAULTS.event, { calendars: [], within: "48h", showJoin: true, max: 3 });
  assert.deepEqual(normalizeConfig("event", { calendars: [`${PAGE}:v1`, PAGE, "nope", `${PAGE}:v1`], within: "month", showJoin: "false", max: 9 }), {
    calendars: [`${PAGE}:v1`, PAGE],
    within: "48h",
    showJoin: false,
    max: 3,
  });
  assert.deepEqual(normalizeConfig("reading", { source: "library", max: 0 }), { source: "library", max: 1 });
  assert.deepEqual(normalizeConfig("metric", { dashboardId: PAGE, widgetId: "w1" }), { dashboardId: PAGE, widgetId: "w1" });
  assert.deepEqual(normalizeConfig("metric", { widgetId: "w1" }), {});
  assert.deepEqual(normalizeConfig("deadline", { pageId: PAGE, rowId: ROW }), { pageId: PAGE, rowId: ROW });
  assert.deepEqual(normalizeConfig("deadline", { pageId: PAGE, taskKey: "k:1", index: 3 }), { pageId: PAGE, taskKey: "k:1", index: 3 });
  assert.deepEqual(normalizeConfig("deadline", { taskKey: "k:1" }), {});
  assert.ok(needsSetup("metric", normalizeConfig("metric", {})) && needsSetup("deadline", normalizeConfig("deadline", {})));
  assert.ok(!needsSetup("deadline", normalizeConfig("deadline", { pageId: PAGE, taskKey: "k" })));
  // Sent as they are (the instance's schema).
  assert.deepEqual(serverConfig("event", normalizeConfig("event", {})), DEFAULTS.event);
});

test("next appointment: countdown, now, all day, join only for https links", () => {
  const result = {
    id: "1",
    kind: "event",
    ok: true as const,
    data: {
      title: "Next appointment",
      items: [
        { id: "a", title: "Over", start: "2026-11-19T08:00:00Z", end: "2026-11-19T09:00:00Z", allDay: false, calendarName: "Team", url: "/" },
        { id: "b", title: "Stand-up", start: "2026-11-19T09:45:00Z", end: "2026-11-19T10:15:00Z", allDay: false, joinUrl: "javascript:alert(1)", calendarName: "Team", url: "/" },
        { id: "c", title: "Client", start: "2026-11-19T10:25:00Z", end: "2026-11-19T11:00:00Z", allDay: false, joinUrl: "https://meet.google.com/abc-defg-hij", calendarName: "Sales", url: "/" },
        { id: "d", title: "Holiday", start: "2026-11-19", end: "2026-11-19", allDay: true, calendarName: "Team", url: "/" },
      ],
    },
  };
  const view = suiteView("event", normalizeConfig("event", {}), result, options);
  assert.equal(view.state, "event");
  if (view.state !== "event") return;
  assert.deepEqual(
    view.items.map((item) => [item.title, item.countdown, item.join ?? ""]),
    [
      ["Stand-up", "Now", ""],
      ["Client", "in 25 min", "https://meet.google.com/abc-defg-hij"],
      ["Holiday", "", ""],
    ],
  );
  assert.equal(view.joinLabel, "Join");
  const noJoin = suiteView("event", normalizeConfig("event", { showJoin: false }), result, options);
  assert.ok(noJoin.state === "event" && noJoin.items.every((item) => !item.join));
  assert.equal(joinLink("https://user:pw@zoom.us/j/1"), null);
  assert.equal(joinLink("http://zoom.us/j/1"), null);
  assert.equal(formatDuration(25 * 60_000, "de"), "25 Min.");
  assert.equal(formatDuration(3 * 3_600_000, "fr"), "3 h");
  assert.equal(formatDuration(3 * 86_400_000, "zh"), "3 天");
});

test("continue reading, key figure, deadline: what they show", () => {
  const reading = suiteView(
    "reading",
    normalizeConfig("reading", {}),
    {
      id: "1",
      kind: "reading",
      ok: true,
      data: {
        title: "Continue reading",
        items: [
          { id: "1", title: "Handbook", kind: "book", progress: 0.42, detail: "Chapter 3", lastOpened: "2026-11-19T09:00:00Z", url: "/" },
          { id: "2", title: "", kind: "document", locked: true, lastOpened: "2026-11-19T08:00:00Z", url: "/" },
        ],
      },
    },
    options,
  );
  assert.ok(reading.state === "reading");
  if (reading.state === "reading") {
    assert.deepEqual(reading.items[0], { title: "Handbook", detail: "Chapter 3 · 42% read", progress: 0.42, kind: "book", url: "flowplan://open?path=%2F" });
    assert.equal(reading.items[1].title, "Locked");
  }
  const metric = suiteView("metric", sampleConfig("metric"), { id: "1", kind: "metric", ok: true, data: { title: "Sales", label: "Revenue", value: 12, formatted: "12", series: [1, 2, "x", 3], delta: -1.5, url: "/" } }, options);
  assert.ok(metric.state === "metric" && metric.delta === "−1.5" && metric.trend === "down" && metric.series.length === 3);
  const hidden = suiteView("metric", sampleConfig("metric"), { id: "1", kind: "metric", ok: true, data: { title: "Sales", label: "Revenue", available: false, url: "/" } }, options);
  assert.equal(hidden.state, "closed");
  const deadline = (data: Record<string, unknown>) => suiteView("deadline", sampleConfig("deadline"), { id: "1", kind: "deadline", ok: true, data: { title: "Offer", url: "/", ...data } }, options);
  const left = deadline({ due: "2026-11-21T10:00:00Z", allDay: false, done: false, overdue: false });
  assert.ok(left.state === "deadline" && left.countdown === "2 d left" && !left.overdue);
  const late = deadline({ due: "2026-11-18T10:00:00Z", allDay: false, done: false, overdue: true });
  assert.ok(late.state === "deadline" && late.countdown === "24 h overdue" && late.overdue);
  const done = deadline({ due: "2026-11-18", allDay: true, done: true, overdue: false });
  assert.ok(done.state === "deadline" && done.countdown === "Done" && !done.overdue && done.due === "due Yesterday");
});

test("an older instance refuses the new kinds: those widgets ask for an update, the others work", async () => {
  for (const kind of NEWER_KINDS) {
    const view = suiteView(kind, sampleConfig(kind), { id: "1", kind, ok: false, status: 400, error: "unknown kind" }, options);
    assert.ok(view.state === "closed" && view.reason === "outdated", kind);
  }
  const old = suiteView("tasks", normalizeConfig("tasks", {}), { id: "1", kind: "tasks", ok: false, status: 400, error: "" }, options);
  assert.ok(old.state === "closed" && old.reason === "offline");
  // The batch with a new kind is refused, each widget is asked alone.
  const asked: string[] = [];
  const fetcher = async (_url: string, init: { body?: string | FormData }) => {
    const body = JSON.parse(String(init.body)) as { widgets: { id: string; kind: string }[] };
    asked.push(body.widgets.map((w) => w.kind).join(","));
    if (body.widgets.some((w) => w.kind === "event")) return { status: 400, ok: false, json: async () => ({ error: "unknown kind" }) };
    return { status: 200, ok: true, json: async () => ({ widgets: body.widgets.map((w) => ({ id: w.id, kind: w.kind, ok: true, data: {} })) }) };
  };
  const result = await widgetData(
    { server: "https://notes.example", token: "t", lang: "en" },
    [
      { id: "1", kind: "tasks", config: {} },
      { id: "2", kind: "event", config: {} },
    ],
    { today: "2026-11-19", zone: "UTC" },
    fetcher,
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.value.get("1")?.ok, true);
    assert.deepEqual(result.value.get("2"), { id: "2", kind: "event", ok: false, status: 400, error: "unknown kind" });
  }
  assert.deepEqual(asked, ["tasks,event", "tasks", "event"]);
  // A screen with only the new widget: its own refusal, not "offline".
  const alone = await widgetData({ server: "https://notes.example", token: "t", lang: "en" }, [{ id: "2", kind: "event", config: {} }], { today: "2026-11-19", zone: "UTC" }, fetcher);
  assert.ok(alone.ok && alone.value.get("2")?.ok === false && (alone.value.get("2") as { status: number }).status === 400);
  // Samples of every kind in every language (gallery, Android previews).
  for (const kind of SUITE_KINDS) for (const locale of ["de", "en", "fr", "zh"] as const) assert.notEqual(suiteView(kind, sampleConfig(kind), sampleResult(kind, locale, options.today, now), { ...options, locale }).state, "closed", `${kind} ${locale}`);
});

const answer = (status: number, body: unknown): HttpAnswer => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test("widget push (iOS 26): one relay registration per profile, handed to its instance", async () => {
  const token = "ab".repeat(40);
  assert.ok(isDeviceToken("ios-widgets", token));
  assert.deepEqual(registrationBody({ platform: "ios-widgets", token, environment: "sandbox", bundleId: "app.flowplan.mobile", instance: "https://notes.example" }), {
    platform: "ios-widgets",
    token,
    bundleId: "app.flowplan.mobile",
    instance: "https://notes.example",
    environment: "sandbox",
  });
  const record: WidgetPushRecord = {
    v: 1,
    relay: "https://push.flowplan.org",
    instance: "https://notes.example",
    environment: "production",
    tokenHash: "a".repeat(64),
    relayToken: "R".repeat(43),
    expiresAt: new Date(now + 180 * 86_400_000).toISOString(),
    registeredAt: now,
  };
  assert.deepEqual(parseWidgetPushRecord(JSON.stringify(record)), record);
  assert.equal(parseWidgetPushRecord(JSON.stringify({ ...record, relay: "http://evil.example" })), null);
  const want = { relay: record.relay, instance: record.instance, tokenHash: record.tokenHash, environment: record.environment };
  assert.ok(!needsWidgetRegistration(record, want, now + 86_400_000));
  assert.ok(needsWidgetRegistration(record, { ...want, tokenHash: "b".repeat(64) }, now));
  assert.ok(needsWidgetRegistration(record, want, now + 31 * 86_400_000));
  assert.ok(needsWidgetRegistration(null, want, now));
  // With the registration of the active profile – for its own instance only.
  assert.deepEqual(widgetPushField(record, "https://notes.example"), { widgetPush: { relayToken: record.relayToken, relayUrl: record.relay } });
  assert.deepEqual(widgetPushField(record, "https://flowplan.company.com"), {});
  // POST /api/mobile/widget-push with the profile's device token.
  const calls: { url: string; method?: string; auth?: string; body?: string }[] = [];
  const http = (ok: number, body: unknown) => async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization, body: init.body });
    return answer(ok, body);
  };
  assert.equal(await sendWidgetPushToken("https://notes.example", "fpd_home", { relayToken: record.relayToken, relayUrl: record.relay }, http(200, { ok: true, widgetPush: true, pushRelay: null })), "ok");
  assert.deepEqual(calls[0], { url: "https://notes.example/api/mobile/widget-push", method: "POST", auth: "Bearer fpd_home", body: JSON.stringify({ relayToken: record.relayToken, relayUrl: record.relay }) });
  assert.equal(await sendWidgetPushToken("https://notes.example", "fpd_home", { relayToken: record.relayToken, relayUrl: record.relay }, http(200, { ok: false, widgetPush: false })), "refused");
  assert.equal(await sendWidgetPushToken("https://notes.example", "fpd_home", { relayToken: record.relayToken, relayUrl: record.relay }, http(404, {})), "missing");
  assert.equal(await sendWidgetPushToken("https://notes.example", "fpd_home", { relayToken: null, relayUrl: record.relay }, http(200, { ok: true, widgetPush: false })), "ok");
  assert.equal(calls.at(-1)?.method, "DELETE");
  // Another profile active: no notifications, the entry stays for its widgets.
  assert.deepEqual(await setDevicePush("https://notes.example", "fpd_home", false, http(200, { ok: true, pushEnabled: false, widgetPush: true })), { result: "ok", widgetPush: true });
  assert.equal(calls.at(-1)?.body, JSON.stringify({ push: false }));
  assert.deepEqual(await setDevicePush("https://notes.example", "fpd_home", false, http(404, null)), { result: "missing" });
  assert.deepEqual(await setDevicePush("https://notes.example", "fpd_home", false, http(401, null)), { result: "signedOut" });
  assert.deepEqual(await setDevicePush("https://notes.example", "fpd_home", false, async () => Promise.reject(new Error("offline"))), { result: "failed" });
});

test("iOS: widget push, profile and colours are wired into the extension", () => {
  const suite = (file: string) => readFileSync(join(root, "plugins/widget-suite/ios", file), "utf8");
  const widgets = suite("SuiteWidgets.swift");
  assert.match(widgets, /struct FPWidgetPushHandler: WidgetPushHandler \{[\s\S]*?FPWidgetPush\.save\(pushInfo\.token\)/);
  // iOS 26 only, behind #available; every configurable widget goes through it.
  assert.match(widgets, /if #available\(iOS 26\.0, \*\) \{\s*return self[\s\S]*?\.pushHandler\(FPWidgetPushHandler\.self\)\s*\} else \{/);
  assert.equal((widgets.match(/\.fpPlatform\(/g) ?? []).length, SUITE_KINDS.length);
  for (const kind of ["FlowplanAgenda", "FlowplanTaskList", "FlowplanNextEvent", "FlowplanDeadline"]) assert.match(widgets, new RegExp(`kind: "${kind}"[\\s\\S]*?fpPlatform\\(FPPlaces\\(carPlay: true\\)`), kind);
  const intents = suite("SuiteIntents.swift");
  // Every configuration has a profile and colours (and lists them).
  assert.equal((intents.match(/@Parameter\(title: "Profile"\)\n {2}var profile: FPProfileEntity\?/g) ?? []).length, SUITE_KINDS.length);
  assert.equal((intents.match(/@Parameter\(title: "Colors", default: \.accent\)/g) ?? []).length, SUITE_KINDS.length);
  for (const summary of intents.match(/Summary \{[^}]*\}/g) ?? []) assert.match(summary, /\\\.\$profile\s+\\\.\$color/, summary);
  // Buttons act with the widget's profile.
  for (const intent of ["FPCompleteTaskIntent", "FPCheckHabitIntent", "FPMarkReadIntent", "FPStartTimerIntent", "FPStopTimerIntent"])
    assert.match(intents, new RegExp(`struct ${intent}: AppIntent \\{[\\s\\S]*?@Parameter\\(title: "Profile", default: ""\\) var profile: String`), intent);
  const shared = readFileSync(join(root, "modules/flowplan-native/ios/WidgetShared.swift"), "utf8");
  // A widget's session is its profile's own (the active one's otherwise).
  assert.match(shared, /static func session\(for profile: String\?\) -> FPSession\?/);
  assert.match(shared, /FPKeychain\.session\(for: request\.profile\)/);
  const module = readFileSync(join(root, "modules/flowplan-native/ios/FlowplanNativeModule.swift"), "utf8");
  assert.match(module, /if #available\(iOS 26\.0, \*\) \{\s*if let info = await WidgetCenter\.shared\.currentPushInfo/);
  // The extension may receive pushes: aps-environment, and its App ID's capability.
  const plugin = require("../plugins/with-widget-suite") as { entitlementsWithPush: (xml: string, env: string | null) => string };
  const xml = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>com.apple.security.application-groups</key><array><string>group.app.flowplan.mobile</string></array></dict></plist>';
  assert.match(plugin.entitlementsWithPush(xml, "production"), /<key>aps-environment<\/key>\s*<string>production<\/string>/);
  assert.doesNotMatch(plugin.entitlementsWithPush(xml, null), /aps-environment/);
  assert.match(readFileSync(join(root, "fastlane/Fastfile"), "utf8"), /target: "ExpoWidgetsTarget", bundle_id: WIDGETS_ID, name: "Flowplan Widgets", capabilities: %w\[APP_GROUPS PUSH_NOTIFICATIONS\]/);
  const plugins = (config.plugins ?? []) as unknown[];
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === "./plugins/with-widget-suite") as [string, { apsEnvironment: string | null }];
  assert.equal(entry[1].apsEnvironment, "production");
});

test("Android: widgets can be made small, previews in the picker, added from the app", () => {
  const sizes = require("../plugins/with-android-widget-sizes") as { patch: (xml: string, size: { minResizeWidth?: string; minResizeHeight?: string }) => string };
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"\n    android:minWidth="250dp">\n</appwidget-provider>\n';
  const patched = sizes.patch(xml, { minResizeWidth: "110dp", minResizeHeight: "50dp" });
  assert.match(patched, /android:minResizeWidth="110dp"/);
  assert.match(patched, /android:minResizeHeight="50dp"/);
  // Again: replaced, not doubled; nonsense is not written.
  assert.equal((sizes.patch(patched, { minResizeWidth: "120dp" }).match(/minResizeWidth/g) ?? []).length, 1);
  assert.doesNotMatch(sizes.patch(xml, { minResizeWidth: "1e9px" }), /minResize/);
  const names = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(names.indexOf("./plugins/with-android-widget-sizes") < names.indexOf("react-native-android-widget"));
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "./plugins/with-android-widget-sizes") as [string, Record<string, unknown>];
  for (const kind of SUITE_KINDS) assert.ok(entry[1][SUITE_WIDGETS[kind]], kind);
  const kotlin = readFileSync(join(root, "modules/flowplan-android/android/src/main/java/app/flowplan/androidshell/WidgetPreviews.kt"), "utf8");
  assert.match(kotlin, /if \(Build\.VERSION\.SDK_INT < 35\) return false[\s\S]*?manager\.setWidgetPreview\(provider, AppWidgetProviderInfo\.WIDGET_CATEGORY_HOME_SCREEN, views\)/);
  const suite = readFileSync(join(root, "src/native/suite.ts"), "utf8");
  assert.match(suite, /requestPinWidget\(\{ widgetName: SUITE_WIDGETS\[kind\] \}\)/);
});
