// Android: the static app shortcuts on the launcher icon – "New note" and
// "Quick capture", there before the app has ever run (the dynamic ones, with
// the recently opened pages, are set by src/android/shortcuts.ts) – and the
// share sheet's name "Save to Flowplan" also for sharing several files
// (SEND_MULTIPLE; plugins/with-managed-config.js names the SEND filters).
// Texts and icons are modules/flowplan-android's resources (de, en, fr, zh-Hans).
const { AndroidConfig, withAndroidManifest, withDangerousMod, withGradleProperties } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const STATIC = [
  { id: "note", link: "flowplan://capture?mode=note", icon: "flowplan_shortcut_note", label: "flowplan_shortcut_note" },
  { id: "capture", link: "flowplan://quick-capture", icon: "flowplan_shortcut_capture", label: "flowplan_shortcut_capture" },
];

const escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function shortcutsXml(packageName) {
  const items = STATIC.map(
    (s) => `    <shortcut
        android:shortcutId="${s.id}"
        android:enabled="true"
        android:icon="@drawable/${s.icon}"
        android:shortcutShortLabel="@string/${s.label}"
        android:shortcutLongLabel="@string/${s.label}_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="${packageName}"
            android:targetClass="${packageName}.MainActivity"
            android:data="${escape(s.link)}" />
    </shortcut>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
`;
}

const withAndroidExtras = (config) => {
  const packageName = config.android?.package;
  if (!packageName) throw new Error("with-android-extras: android.package is missing");
  // Gradle's memory: Expo's 2 GB ran out while bundletool packed the Play
  // bundle of the release build ("Java heap space" in packageReleaseBundle).
  // The runners have 16 GB.
  config = withGradleProperties(config, (config) => {
    const props = config.modResults.filter((item) => !(item.type === "property" && item.key === "org.gradle.jvmargs"));
    props.push({ type: "property", key: "org.gradle.jvmargs", value: "-Xmx4096m -XX:MaxMetaspaceSize=1024m" });
    config.modResults = props;
    return config;
  });
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "flowplan_shortcuts.xml"), shortcutsXml(packageName));
      return config;
    },
  ]);
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    activity["meta-data"] = [
      ...(activity["meta-data"] || []).filter((item) => item.$["android:name"] !== "android.app.shortcuts"),
      { $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/flowplan_shortcuts" } },
    ];
    for (const filter of activity["intent-filter"] || []) {
      if ((filter.action || []).some((action) => action.$["android:name"] === "android.intent.action.SEND_MULTIPLE"))
        filter.$ = { ...(filter.$ || {}), "android:label": "@string/share_label" };
    }
    return config;
  });
};

module.exports = withAndroidExtras;
module.exports.shortcutsXml = shortcutsXml;
module.exports.STATIC_SHORTCUTS = STATIC;
