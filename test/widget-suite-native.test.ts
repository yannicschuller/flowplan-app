import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import { SUITE_KINDS, SUITE_WIDGETS } from "../src/widgets/suite";
import { configFor, forgetProfile, parseConfigState, removeWidget, setConfig } from "../src/widgets/widget-config";

const { strings, phrases, gallery, galleryStrings, localizable } = require("../plugins/widget-suite/strings") as {
  strings: Record<string, { de: string; fr: string }>;
  phrases: Record<string, { de: string; fr: string }>;
  gallery: Record<string, { label: string[]; description: string[] }>;
  galleryStrings: (lang: string) => Record<string, string>;
  localizable: (table: Record<string, { de: string; fr: string }>, lang: string) => Record<string, string>;
};
const { swiftKeys, shortcutPhrases } = require("../plugins/widget-suite/swift-keys") as {
  swiftKeys: (source: string) => Set<string>;
  shortcutPhrases: (source: string) => Set<string>;
};

const root = join(__dirname, "..");
const swiftFiles = [
  ...readdirSync(join(root, "plugins/widget-suite/ios")).map((f) => join(root, "plugins/widget-suite/ios", f)),
  ...readdirSync(join(root, "plugins/widget-suite/app")).map((f) => join(root, "plugins/widget-suite/app", f)),
].filter((f) => f.endsWith(".swift"));
const placeholders = (text: string) => [...text.matchAll(/%(?:\d+\$)?[@dfs]|\$\{applicationName\}/g)].map((m) => m[0]).sort();

test("every text of the Swift sources is translated, with the same placeholders", () => {
  const missing: string[] = [];
  for (const file of swiftFiles)
    for (const key of swiftKeys(readFileSync(file, "utf8"))) {
      for (const lang of ["de", "en", "fr"]) {
        const table = localizable(strings, lang);
        if (!table[key]) missing.push(`${lang}: ${key} (${file.split("/").pop()})`);
        else assert.deepEqual(placeholders(table[key]), placeholders(key), `${lang}: ${key}`);
      }
    }
  assert.deepEqual(missing, []);
  for (const [key, value] of Object.entries(strings)) {
    assert.ok(value.de?.trim() && value.fr?.trim(), key);
    assert.deepEqual(placeholders(value.de), placeholders(key), `de: ${key}`);
    assert.deepEqual(placeholders(value.fr), placeholders(key), `fr: ${key}`);
  }
});

test("Siri phrases exist in German, English and French and name the app", () => {
  const source = readFileSync(join(root, "plugins/widget-suite/app/FlowplanAppIntents.swift"), "utf8");
  const used = shortcutPhrases(source);
  assert.ok(used.size >= 6);
  for (const phrase of used) {
    assert.ok(phrases[phrase], `phrase without translation: ${phrase}`);
    for (const lang of ["de", "fr"] as const) assert.ok(phrases[phrase][lang].includes("${applicationName}"), `${lang}: ${phrase}`);
  }
  assert.deepEqual(Object.keys(phrases).sort(), [...used].sort());
});

test("every widget has a gallery name and description in three languages", () => {
  const names = ["FlowplanTasks", "FlowplanInbox", "FlowplanInstance", "FlowplanLive", "FlowplanStorage", ...SUITE_KINDS.map((k) => SUITE_WIDGETS[k])];
  assert.deepEqual(Object.keys(gallery).sort(), [...names].sort());
  for (const lang of ["de", "en", "fr"]) {
    const android = galleryStrings(lang);
    for (const name of names) {
      assert.ok(android[`widget_label_${name.toLowerCase()}`], `${lang} ${name}`);
      assert.ok(android[`widget_${name.toLowerCase()}_description`], `${lang} ${name}`);
    }
    // iOS: expo-widgets writes the English names into Swift.
    const ios = localizable(strings, lang);
    for (const name of names) assert.ok(ios[gallery[name].description[1]], `${lang} ${name}`);
  }
});

test("the app config wires the suite: Android settings screens, iOS plugin before expo-widgets", () => {
  const plugins = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
  const suite = plugins.indexOf("./plugins/with-widget-suite");
  assert.ok(suite >= 0 && suite < plugins.indexOf("expo-widgets"));
  assert.ok(plugins.indexOf("./plugins/with-widget-gallery") < plugins.indexOf("react-native-android-widget"));
  const android = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "react-native-android-widget") as [string, { widgets: { name: string; label: string; widgetFeatures?: string }[] }];
  for (const kind of SUITE_KINDS) {
    const widget = android[1].widgets.find((w) => w.name === SUITE_WIDGETS[kind]);
    assert.ok(widget, kind);
    // Works without configuring: optional, can be changed later.
    assert.equal(widget.widgetFeatures, "reconfigurable|configuration_optional");
    assert.equal(widget.label, `@string/widget_label_${SUITE_WIDGETS[kind].toLowerCase()}`);
  }
  // The localized texts reach Localizable.strings of app and extension.
  const de = (config.locales as Record<string, { ios: Record<string, unknown> }>).de;
  assert.equal((de.ios["Localizable.strings"] as Record<string, string>)["Mark as done"], "Als erledigt markieren");
  // The widget suite lives in the existing extension: no new bundle ID.
  const widgets = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-widgets") as [string, { bundleIdentifier: string }];
  assert.equal(widgets[1].bundleIdentifier, "app.flowplan.mobile.widgets");
});

test("Swift widget kinds match the app's widget names", () => {
  const swift = readFileSync(join(root, "plugins/widget-suite/ios/SuiteWidgets.swift"), "utf8");
  for (const kind of SUITE_KINDS) assert.ok(swift.includes(`kind: "${SUITE_WIDGETS[kind]}"`), kind);
  const intents = readFileSync(join(root, "plugins/widget-suite/ios/SuiteIntents.swift"), "utf8");
  for (const kind of SUITE_KINDS) assert.ok(intents.includes(`static let kind = "${kind}"`), kind);
});

const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";

test("Android keeps settings per profile and widget; sign-out keeps them, removal drops them", () => {
  let state = parseConfigState(null);
  assert.deepEqual(configFor(state, "work", 7, "tasks"), { source: "mine", filter: "open", max: 5 });
  state = setConfig(state, "work", 7, "tasks", { source: "page", pageId: PAGE, filter: "today", max: 3 });
  assert.deepEqual(configFor(state, "work", 7, "tasks"), { source: "page", pageId: PAGE, filter: "today", max: 3 });
  // Another profile: the defaults (its pages are another instance's) …
  assert.deepEqual(configFor(state, "home", 7, "tasks"), { source: "mine", filter: "open", max: 5 });
  // … and back: the settings are still there (stored as text and read again).
  state = parseConfigState(JSON.stringify(state));
  assert.equal(configFor(state, "work", 7, "tasks").filter, "today");
  // A stored kind that does not match (id reused by another widget): defaults.
  assert.deepEqual(configFor(state, "work", 7, "mentions"), { show: "all", unreadOnly: true, max: 5 });
  state = setConfig(state, "home", 7, "tasks", { filter: "overdue" });
  assert.deepEqual(Object.keys(removeWidget(state, 7)), []);
  assert.deepEqual(Object.keys(forgetProfile(state, "home")), ["work"]);
  // Broken or foreign data is ignored.
  assert.deepEqual(parseConfigState("{"), {});
  assert.deepEqual(parseConfigState(JSON.stringify({ "../x": { 1: { kind: "tasks" } }, work: { abc: { kind: "tasks" }, 2: { kind: "nope" } } })), {});
});
