// iOS: the Notification Service Extension of the push relay (README → Push
// notifications). A target of its own – FlowplanNotifications, bundle ID
// <app>.notifications, in the App Group – that iOS starts for every alert
// with mutable-content: it decrypts the relay's payload (`fp`) with the
// profile's key from the keychain (the App Group is its access group) and
// replaces the placeholder with title, text, buttons and the data the app
// reads (plugins/notification-service/NotificationService.swift).
//
// - plugins/notification-service/*.swift and modules/flowplan-push/ios/
//   PushShared.swift (the same keys and decryption the app's module uses)
//   → ios/FlowplanNotifications;
// - its Info.plist (com.apple.usernotifications.service), the entitlements
//   (App Group) and the target, embedded in the app;
// - the App Group in the app's Info.plist too (FlowplanPushAppGroup), where
//   modules/flowplan-push keeps the keys.
//
// A new App ID and profile: fastlane/Fastfile IOS_TARGETS.
const { withDangerousMod, withInfoPlist, withXcodeProject } = require("expo/config-plugins");
const plist = require("@expo/plist").default;
const fs = require("node:fs");
const path = require("node:path");
const { addExtensionTarget } = require("./extension-target");

const TARGET = "FlowplanNotifications";
const SOURCES = path.join(__dirname, "notification-service");
const SHARED = path.join(__dirname, "..", "modules", "flowplan-push", "ios", "PushShared.swift");
const EXTENSION_POINT = "com.apple.usernotifications.service";

const ownFiles = () => fs.readdirSync(SOURCES).filter((f) => f.endsWith(".swift")).sort();
const swiftFiles = () => [...ownFiles(), "PushShared.swift"];

function infoPlist(appGroup) {
  return plist.build({
    CFBundleDevelopmentRegion: "en",
    CFBundleDisplayName: "Flowplan",
    CFBundleExecutable: "$(EXECUTABLE_NAME)",
    CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleName: "$(PRODUCT_NAME)",
    CFBundlePackageType: "XPC!",
    CFBundleShortVersionString: "$(MARKETING_VERSION)",
    CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
    // The keychain access group of the keys (PushShared.swift, FPPush).
    FlowplanPushAppGroup: appGroup,
    NSExtension: {
      NSExtensionPointIdentifier: EXTENSION_POINT,
      NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).NotificationService",
    },
  });
}

const entitlements = (appGroup) => plist.build({ "com.apple.security.application-groups": [appGroup] });

const withServiceFiles = (config, { appGroup }) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      for (const file of ownFiles()) fs.copyFileSync(path.join(SOURCES, file), path.join(dir, file));
      fs.copyFileSync(SHARED, path.join(dir, "PushShared.swift"));
      fs.writeFileSync(path.join(dir, "Info.plist"), infoPlist(appGroup));
      fs.writeFileSync(path.join(dir, `${TARGET}.entitlements`), entitlements(appGroup));
      return config;
    },
  ]);

// The app's module reads the same key from its own Info.plist.
const withAppGroupKey = (config, { appGroup }) =>
  withInfoPlist(config, (config) => {
    config.modResults.FlowplanPushAppGroup = appGroup;
    return config;
  });

const withServiceTarget = (config, { bundleIdentifier, deploymentTarget }) =>
  withXcodeProject(config, (config) => {
    addExtensionTarget(config.modResults, {
      target: TARGET,
      bundleIdentifier,
      deploymentTarget,
      sources: swiftFiles(),
      files: [`${TARGET}.entitlements`],
      config,
    });
    return config;
  });

module.exports = (config, options) => {
  if (!options?.appGroup || !options?.bundleIdentifier) throw new Error("with-notification-service: appGroup and bundleIdentifier are required");
  const settings = { deploymentTarget: "16.4", ...options };
  return withServiceTarget(withAppGroupKey(withServiceFiles(config, settings), settings), settings);
};
module.exports.TARGET = TARGET;
module.exports.EXTENSION_POINT = EXTENSION_POINT;
module.exports.infoPlist = infoPlist;
module.exports.swiftFiles = swiftFiles;
