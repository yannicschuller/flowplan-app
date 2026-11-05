// iOS: Siri and Shortcuts (add a task, what's due today, open a page,
// search), the Focus filter and two more controls (quick capture, today's
// tasks) – README → Siri, Shortcuts and Focus. On top of the widget suite
// (plugins/with-widget-suite.js), whose session and helpers they use
// (WidgetShared.swift) and whose App Shortcuts provider lists them:
//
// - plugins/intents/app/*.swift → the app;
// - plugins/intents/ios/*.swift → expo-widgets' extension; its bundle gets
//   FlowplanIntentControls after the suite's widgets;
// - the Siri phrases (plugins/intents/strings.js) join the suite's
//   AppShortcuts.strings in German, English and French.
//
// Listed before with-widget-suite in app.config.ts: mods run last-added
// first, so this runs after the suite has written index.swift and
// AppShortcuts.strings. Localizable.strings comes from app.config.ts.
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");
const { phrases, LANGS } = require("./intents/strings");
const { lproj } = require("./widget-suite/strings");

const TARGET = "ExpoWidgetsTarget";
const DIR = path.join(__dirname, "intents");
const swiftIn = (dir) => fs.readdirSync(path.join(DIR, dir)).filter((f) => f.endsWith(".swift")).sort();

const escape = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const shortcutLines = (lang) =>
  Object.entries(phrases).map(([key, value]) => `"${escape(key)}" = "${escape(lang === "en" ? key : value[lang])}";`);

const withIntentFiles = (config) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const root = config.modRequest.platformProjectRoot;
      const project = config.modRequest.projectName;
      const extension = path.join(root, TARGET);
      const index = path.join(extension, "index.swift");
      let swift = fs.existsSync(index) ? fs.readFileSync(index, "utf8") : "";
      if (!swift.includes("FlowplanSuiteWidgets().body")) throw new Error("with-intents: the widget suite's bundle is missing in index.swift (list this plugin before with-widget-suite)");
      for (const file of swiftIn("ios")) fs.copyFileSync(path.join(DIR, "ios", file), path.join(extension, file));
      if (!swift.includes("FlowplanIntentControls().body")) {
        swift = swift.replace("FlowplanSuiteWidgets().body", "FlowplanSuiteWidgets().body\n    FlowplanIntentControls().body");
        fs.writeFileSync(index, swift);
      }
      for (const file of swiftIn("app")) fs.copyFileSync(path.join(DIR, "app", file), path.join(root, project, file));
      for (const lang of LANGS) {
        const file = path.join(root, project, "Supporting", `${lproj(lang)}.lproj`, "AppShortcuts.strings");
        if (!fs.existsSync(file)) throw new Error(`with-intents: ${lproj(lang)}.lproj/AppShortcuts.strings is missing (list this plugin before with-widget-suite)`);
        const current = fs.readFileSync(file, "utf8");
        const missing = shortcutLines(lang).filter((line) => !current.includes(line.split(" = ")[0] + " = "));
        if (missing.length) fs.writeFileSync(file, current + missing.join("\n") + "\n");
      }
      return config;
    },
  ]);

const withIntentProject = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const name = config.modRequest.projectName;
    const targetUuid = project.findTargetKey(TARGET);
    const groupKey = project.findPBXGroupKey({ name: TARGET });
    if (!targetUuid || !groupKey) throw new Error("with-intents: expo-widgets' target not found");
    const group = project.getPBXGroupByKey(groupKey);
    for (const file of swiftIn("ios")) {
      if (group.children.some((child) => child.comment === file)) continue;
      project.addSourceFile(file, { target: targetUuid }, groupKey);
    }
    const appTarget = project.getFirstTarget().uuid;
    for (const file of swiftIn("app")) {
      const filepath = `${name}/${file}`;
      if (project.hasFile(filepath)) continue;
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project, targetUuid: appTarget });
    }
    return config;
  });

module.exports = (config) => withIntentProject(withIntentFiles(config));
