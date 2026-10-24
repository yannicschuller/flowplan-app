import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import { focusRule, focusStep, parseFocusFilter, parseFocusMemory, type FocusFilter } from "../src/focus";
import { pathOfAppLink } from "../src/navigation";
import type { ProfileState } from "../src/profiles";

const intents = require("../plugins/intents/strings") as {
  strings: Record<string, { de: string; fr: string }>;
  phrases: Record<string, { de: string; fr: string }>;
  localizable: (lang: string) => Record<string, string>;
};
const suite = require("../plugins/widget-suite/strings") as {
  strings: Record<string, { de: string; fr: string }>;
  localizable: (table: Record<string, { de: string; fr: string }>, lang: string) => Record<string, string>;
};
const { swiftKeys, shortcutPhrases } = require("../plugins/widget-suite/swift-keys") as {
  swiftKeys: (source: string) => Set<string>;
  shortcutPhrases: (source: string) => Set<string>;
};

const root = join(__dirname, "..");
const swiftIn = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".swift"))
    .map((f) => join(root, dir, f));
const ours = [...swiftIn("plugins/intents/app"), ...swiftIn("plugins/intents/ios")];
const everything = [...ours, ...swiftIn("plugins/widget-suite/app"), ...swiftIn("plugins/widget-suite/ios"), join(root, "modules/flowplan-native/ios/WidgetShared.swift")];
const placeholders = (text: string) => [...text.matchAll(/%(?:\d+\$)?[@dfs]|\$\{applicationName\}/g)].map((m) => m[0]).sort();

test("every text of the intents' Swift is translated (here or in the widget suite), with the same placeholders", () => {
  const missing: string[] = [];
  for (const file of ours)
    for (const key of swiftKeys(readFileSync(file, "utf8")))
      for (const lang of ["de", "en", "fr"]) {
        const table = { ...suite.localizable(suite.strings, lang), ...intents.localizable(lang) };
        if (!table[key]) missing.push(`${lang}: ${key} (${file.split("/").pop()})`);
        else assert.deepEqual(placeholders(table[key]), placeholders(key), `${lang}: ${key}`);
      }
  assert.deepEqual(missing, []);
  for (const [key, value] of Object.entries(intents.strings)) {
    assert.ok(value.de?.trim() && value.fr?.trim(), key);
    assert.deepEqual(placeholders(value.de), placeholders(key), `de: ${key}`);
    assert.deepEqual(placeholders(value.fr), placeholders(key), `fr: ${key}`);
    // Not a second translation of a text the suite already has.
    assert.ok(!(key in suite.strings), `twice: ${key}`);
  }
  // Texts the Swift sources use but swiftKeys does not see (L() with a
  // format, ternaries) are there too.
  const source = ours.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const key of Object.keys(intents.strings)) assert.ok(source.includes(`"${key.replace(/%@/g, "")}`) || source.includes(key.split("%@")[0]), `unused: ${key}`);
});

test("the App Shortcuts: at most 10, each intent of plugins/intents with phrases in three languages", () => {
  const provider = readFileSync(join(root, "plugins/widget-suite/app/FlowplanAppIntents.swift"), "utf8");
  assert.ok((provider.match(/AppShortcut\(/g) ?? []).length <= 10);
  for (const intent of ["FPAddTaskIntent", "FPDueTodayIntent", "FPOpenPageIntent", "FPSearchIntent"]) assert.match(provider, new RegExp(`intent: ${intent}\\(\\)`));
  const used = shortcutPhrases(provider);
  for (const [phrase, value] of Object.entries(intents.phrases)) {
    assert.ok(used.has(phrase), `phrase not in the provider: ${phrase}`);
    for (const lang of ["de", "fr"] as const) assert.ok(value[lang].includes("${applicationName}"), `${lang}: ${phrase}`);
  }
});

test("App Intents and entity type names are unique across the app and the extension", () => {
  const names: string[] = [];
  for (const file of everything)
    for (const match of readFileSync(file, "utf8").matchAll(/struct (\w+): (?:AppIntent|SetValueIntent|SetFocusFilterIntent|WidgetConfigurationIntent|AppEntity|EntityQuery|EntityStringQuery|ControlWidget|ControlValueProvider)\b/g))
      names.push(match[1]);
  assert.ok(names.includes("FPFocusFilterIntent") && names.includes("FPTodayControl"));
  assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), []);
  // Control kinds too.
  const kinds = everything.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/kind: "(app\.flowplan\.control\.\w+)"/g)].map((m) => m[1]));
  assert.deepEqual(kinds.filter((k, i) => kinds.indexOf(k) !== i), []);
});

test("controls and Siri open links the app takes", () => {
  const swift = ours.map((f) => readFileSync(f, "utf8")).join("\n");
  const links = [...swift.matchAll(/"(flowplan:\/\/open\?path=[^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 2);
  for (const link of links) assert.ok(pathOfAppLink(link), link);
  assert.equal(pathOfAppLink("flowplan://open?path=%2F%23capture"), "/#capture");
  // What FPIntentLinks.open builds for a page.
  assert.equal(pathOfAppLink(`flowplan://open?path=${encodeURIComponent("/#page=3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d")}`), "/#page=3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d");
});

test("the app config: intents on top of the widget suite, their texts in Localizable.strings", () => {
  const plugins = (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
  const own = plugins.indexOf("./plugins/with-intents");
  assert.ok(own >= 0 && own < plugins.indexOf("./plugins/with-widget-suite"));
  const fr = (config.locales as Record<string, { ios: Record<string, Record<string, string>> }>).fr;
  assert.equal(fr.ios["Localizable.strings"]["Add a task"], "Ajouter une tâche");
  // The suite's texts are still there.
  assert.equal(fr.ios["Localizable.strings"]["Mark as done"], "Marquer comme terminée");
});

const state: ProfileState = {
  profiles: [
    { id: "work", name: "Work", server: "https://work.example" },
    { id: "home", name: "Home", server: "https://home.example" },
  ],
  active: "home",
};
const WS = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";

test("Focus filter: read strictly", () => {
  assert.equal(parseFocusFilter(null), null);
  assert.equal(parseFocusFilter("{"), null);
  assert.equal(parseFocusFilter(JSON.stringify({ active: true, profile: "../x", at: 1 })), null);
  assert.deepEqual(parseFocusFilter(JSON.stringify({ active: true, at: 5, profile: "work", workspace: WS.toUpperCase(), hideNotifications: true })), {
    active: true,
    at: 5,
    profile: "work",
    workspace: WS,
    hideNotifications: true,
  });
  assert.deepEqual(parseFocusFilter(JSON.stringify({ active: true, at: 5, profile: "work", workspace: "javascript:x" })), {
    active: true,
    at: 5,
    profile: "work",
    workspace: null,
    hideNotifications: false,
  });
  assert.deepEqual(parseFocusFilter(JSON.stringify({ active: false, at: 9 })), { active: false, at: 9 });
  assert.equal(parseFocusMemory("nope"), null);
});

test("Focus filter: switch to its profile and workspace once, back afterwards", () => {
  const on: FocusFilter = { active: true, at: 10, profile: "work", workspace: WS, hideNotifications: false };
  const first = focusStep(on, state, null)!;
  assert.deepEqual(first, { switchTo: "work", path: `/#workspace=${WS}`, memory: { at: 10, profile: "work", before: "home" } });
  // Applied once: switching back by hand during the Focus stays.
  assert.equal(focusStep(on, state, first.memory), null);
  // Another Focus follows: still back to "home" at the end.
  const next = focusStep({ ...on, at: 20, profile: "work", workspace: null }, { ...state, active: "work" }, first.memory)!;
  assert.deepEqual(next, { switchTo: null, path: null, memory: { at: 20, profile: "work", before: "home" } });
  const off = focusStep({ active: false, at: 30 }, { ...state, active: "work" }, next.memory)!;
  assert.deepEqual(off, { switchTo: "home", path: null, memory: { at: 30, profile: null, before: null } });
  // Switched by hand to another profile meanwhile: stays there.
  assert.equal(focusStep({ active: false, at: 30 }, state, next.memory)!.switchTo, null);
  // A profile that is gone: nothing.
  assert.deepEqual(focusStep({ ...on, at: 40, profile: "gone" }, state, null)!.switchTo, null);
  // Already on the profile: only the workspace.
  assert.deepEqual(focusStep({ ...on, at: 50, profile: "home" }, state, null), { switchTo: null, path: `/#workspace=${WS}`, memory: { at: 50, profile: "home", before: null } });
});

test("Focus filter: the push rule for the active profile's instance", () => {
  const on: FocusFilter = { active: true, at: 1, profile: "work", workspace: WS, hideNotifications: true };
  assert.deepEqual(focusRule(on, "work"), { hide: true, workspaceId: WS });
  assert.deepEqual(focusRule(on, "home"), { hide: true, workspaceId: null });
  assert.deepEqual(focusRule({ ...on, workspace: null }, "work"), { hide: false, workspaceId: null });
  assert.deepEqual(focusRule({ ...on, hideNotifications: false }, "home"), { hide: false, workspaceId: null });
  assert.deepEqual(focusRule({ active: false, at: 2 }, "work"), { hide: false, workspaceId: null });
});
