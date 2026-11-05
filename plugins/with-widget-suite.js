// iOS: the configurable widgets, controls and App Shortcuts (README →
// Widgets). expo-widgets generates the widget extension (ExpoWidgetsTarget,
// bundle ID app.flowplan.mobile.widgets) for the widgets written with Expo
// UI; it cannot express settings that depend on each other, options asked
// from the instance, buttons that call the instance, or controls. This
// plugin adds the Swift for those to the same extension – no new target,
// no new bundle ID – and the App Shortcuts to the app:
//
// - plugins/widget-suite/ios/*.swift and WidgetShared.swift (from the
//   FlowplanNative module) → the extension; its bundle gets
//   FlowplanSuiteWidgets next to expo-widgets' widgets;
// - plugins/widget-suite/app/*.swift and WidgetShared.swift → the app;
// - AppShortcuts.strings (Siri phrases) in German, English, French and
//   Simplified Chinese.
//
// Listed before expo-widgets in app.config.ts: mods run last-added first,
// so this runs after expo-widgets has (re)written the extension's folder.
// Localizable.strings comes from app.config.ts (locales), which
// expo-widgets also hands to the extension.
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");
const { phrases, LANGS, lproj } = require("./widget-suite/strings");

const TARGET = "ExpoWidgetsTarget";
const SUITE = path.join(__dirname, "widget-suite");
const SHARED = path.join(__dirname, "..", "modules", "flowplan-native", "ios", "WidgetShared.swift");

const EXTENSION_FRAMEWORKS = ["AppIntents.framework", "WidgetKit.framework", "SwiftUI.framework"];
// The frameworks in a target's "Frameworks" build phase.
const linkedFrameworks = (project, targetUuid) => {
  const phase = project.pbxFrameworksBuildPhaseObj(targetUuid);
  return (phase?.files ?? []).map((file) => String(file.comment ?? "").replace(/ in Frameworks$/, ""));
};

const extensionFiles = () => [...fs.readdirSync(path.join(SUITE, "ios")).filter((f) => f.endsWith(".swift")).sort(), "WidgetShared.swift"];
const appFiles = () => [...fs.readdirSync(path.join(SUITE, "app")).filter((f) => f.endsWith(".swift")).sort(), "WidgetShared.swift"];
const source = (dir, file) => (file === "WidgetShared.swift" ? SHARED : path.join(SUITE, dir, file));

const escape = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const shortcutStrings = (lang) =>
  Object.entries(phrases)
    .map(([key, value]) => `"${escape(key)}" = "${escape(lang === "en" ? key : value[lang])}";`)
    .join("\n") + "\n";

const withSuiteFiles = (config) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const root = config.modRequest.platformProjectRoot;
      const project = config.modRequest.projectName;
      const extension = path.join(root, TARGET);
      if (!fs.existsSync(path.join(extension, "index.swift"))) throw new Error("with-widget-suite: expo-widgets' extension is missing (list this plugin before expo-widgets)");
      for (const file of extensionFiles()) fs.copyFileSync(source("ios", file), path.join(extension, file));
      // The suite joins the extension's widget bundle.
      const index = path.join(extension, "index.swift");
      let swift = fs.readFileSync(index, "utf8");
      if (!swift.includes("FlowplanSuiteWidgets().body")) {
        if (!swift.includes("WidgetLiveActivity()")) throw new Error("with-widget-suite: WidgetLiveActivity() not found in index.swift");
        swift = swift.replace("WidgetLiveActivity()", "WidgetLiveActivity()\n    FlowplanSuiteWidgets().body");
        fs.writeFileSync(index, swift);
      }
      for (const file of appFiles()) fs.copyFileSync(source("app", file), path.join(root, project, file));
      for (const lang of LANGS) {
        const dir = path.join(root, project, "Supporting", `${lproj(lang)}.lproj`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "AppShortcuts.strings"), shortcutStrings(lang));
      }
      return config;
    },
  ]);

const withSuiteProject = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const name = config.modRequest.projectName;
    const targetUuid = project.findTargetKey(TARGET);
    const groupKey = project.findPBXGroupKey({ name: TARGET });
    if (!targetUuid || !groupKey) throw new Error("with-widget-suite: expo-widgets' target not found (list this plugin before expo-widgets)");
    const group = project.getPBXGroupByKey(groupKey);
    for (const file of extensionFiles()) {
      if (group.children.some((child) => child.comment === file)) continue;
      project.addSourceFile(file, { target: targetUuid }, groupKey);
    }
    // Linked by name, not only through `import`: the build extracts the App
    // Intents metadata (the widgets' settings and buttons) from targets that
    // link AppIntents.
    for (const framework of EXTENSION_FRAMEWORKS) {
      if (!linkedFrameworks(project, targetUuid).includes(framework)) project.addFramework(framework, { target: targetUuid, link: true });
    }
    const appTarget = project.getFirstTarget().uuid;
    for (const file of appFiles()) {
      const filepath = `${name}/${file}`;
      if (project.hasFile(filepath)) continue;
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project, targetUuid: appTarget });
    }
    for (const lang of LANGS) {
      const groupName = `${name}/Supporting/${lproj(lang)}.lproj`;
      const folder = IOSConfig.XcodeUtils.ensureGroupRecursively(project, groupName);
      if (folder?.children.some(({ comment }) => comment === "AppShortcuts.strings")) continue;
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: `${lproj(lang)}.lproj/AppShortcuts.strings`, groupName, project, isBuildFile: true, verbose: true });
    }
    return config;
  });

module.exports = (config) => withSuiteProject(withSuiteFiles(config));
