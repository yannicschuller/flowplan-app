// Android: managed installations (EMM app restrictions) can suggest the
// address of their instance with the key "server", like iOS's Managed App
// Configuration (read in modules/flowplan-native). Also names the share
// target "Save to Flowplan" in the share sheet.
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const RESTRICTIONS = `<?xml version="1.0" encoding="utf-8"?>
<restrictions xmlns:android="http://schemas.android.com/apk/res/android">
    <restriction
        android:key="server"
        android:restrictionType="string"
        android:title="@string/restriction_server_title"
        android:description="@string/restriction_server_description"
        android:defaultValue="" />
</restrictions>
`;

const STRINGS = {
  share_label: "Save to Flowplan",
  restriction_server_title: "Flowplan instance",
  restriction_server_description: "Address suggested on first start, e.g. https://flowplan.example.com",
};

const withManagedConfig = (config) => {
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "app_restrictions.xml"), RESTRICTIONS);
      return config;
    },
  ]);
  config = withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      Object.entries(STRINGS).map(([name, value]) => ({ $: { name }, _: value })),
      config.modResults,
    );
    return config;
  });
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, "android.content.APP_RESTRICTIONS", "@xml/app_restrictions", "resource");
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    for (const filter of activity["intent-filter"] || []) {
      if ((filter.action || []).some((action) => action.$["android:name"] === "android.intent.action.SEND"))
        filter.$ = { ...(filter.$ || {}), "android:label": "@string/share_label" };
    }
    return config;
  });
};

module.exports = withManagedConfig;
