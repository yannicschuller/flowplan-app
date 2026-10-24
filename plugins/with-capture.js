// iOS: sharing into Flowplan from other apps (README → Capture). A share
// extension of its own – target FlowplanShare, bundle ID <app>.share, in the
// App Group – with a compact native sheet: title, text, link, images and
// PDFs, and where they go (the inbox, a page, a database). It reads the
// session the app writes for its widgets (the shared keychain item,
// WidgetShared.swift) and saves through the instance's capture API itself
// (POST /api/mobile/capture/save); the app need not be opened.
//
// - plugins/capture/*.swift → ios/FlowplanShare, with ShareStrings.swift
//   (German, English, French) from plugins/capture/strings.js;
// - Info.plist (activation rule: up to one link, text, ten images or PDFs),
//   the entitlements (App Group) and the target, embedded in the app.
//
// The document scanner and Spotlight are the FlowplanCapture module
// (modules/flowplan-capture, autolinked): no target, no capability.
// A new App ID and profile: fastlane/Fastfile IOS_TARGETS.
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const plist = require("@expo/plist").default;
const fs = require("node:fs");
const path = require("node:path");
const { swiftTable } = require("./capture/strings");
const { addExtensionTarget } = require("./extension-target");

const TARGET = "FlowplanShare";
const SOURCES = path.join(__dirname, "capture");
const MAX_FILES = 10;

const swiftFiles = () => [...fs.readdirSync(SOURCES).filter((f) => f.endsWith(".swift")).sort(), "ShareStrings.swift"];

// Links (one), text, and up to ten images or PDFs – nothing else offers
// Flowplan in the share sheet.
const ACTIVATION_RULE = `SUBQUERY (
  extensionItems,
  $extensionItem,
  SUBQUERY (
    $extensionItem.attachments,
    $attachment,
    ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.image"
    || ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "com.adobe.pdf"
    || ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.url"
    || ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.plain-text"
  ).@count >= 1
  && SUBQUERY (
    $extensionItem.attachments,
    $attachment,
    ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.image"
    || ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "com.adobe.pdf"
  ).@count <= ${MAX_FILES}
).@count >= 1`;

function infoPlist(appGroup) {
  return plist.build({
    CFBundleDevelopmentRegion: "en",
    CFBundleDisplayName: "Flowplan",
    CFBundleExecutable: "$(EXECUTABLE_NAME)",
    CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleLocalizations: ["de", "en", "fr"],
    CFBundleName: "$(PRODUCT_NAME)",
    CFBundlePackageType: "XPC!",
    CFBundleShortVersionString: "$(MARKETING_VERSION)",
    CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
    // Where the app keeps the session (ShareModel.swift, FPSShared).
    FlowplanAppGroup: appGroup,
    NSExtension: {
      NSExtensionAttributes: { NSExtensionActivationRule: ACTIVATION_RULE },
      NSExtensionPointIdentifier: "com.apple.share-services",
      NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).ShareViewController",
    },
  });
}

const entitlements = (appGroup) => plist.build({ "com.apple.security.application-groups": [appGroup] });

const withShareFiles = (config, { appGroup }) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      for (const file of swiftFiles()) {
        if (file === "ShareStrings.swift") fs.writeFileSync(path.join(dir, file), swiftTable());
        else fs.copyFileSync(path.join(SOURCES, file), path.join(dir, file));
      }
      fs.writeFileSync(path.join(dir, "Info.plist"), infoPlist(appGroup));
      fs.writeFileSync(path.join(dir, `${TARGET}.entitlements`), entitlements(appGroup));
      return config;
    },
  ]);

const withShareTarget = (config, { bundleIdentifier, deploymentTarget }) =>
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

module.exports = (config, options) => withShareTarget(withShareFiles(config, options), options);
module.exports.ACTIVATION_RULE = ACTIVATION_RULE;
module.exports.TARGET = TARGET;
