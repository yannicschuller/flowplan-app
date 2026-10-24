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

const TARGET = "FlowplanShare";
const SOURCES = path.join(__dirname, "capture");
const EMBED = "Embed Foundation Extensions";
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

// The build phase of a target with this name (or the first of its type).
function buildPhase(project, type, targetUuid, name) {
  const section = project.hash.project.objects[type];
  const target = project.pbxNativeTargetSection()[targetUuid];
  if (!section || !target?.buildPhases) return null;
  const phase = target.buildPhases.find((p) => (!name || p.comment === name) && section[p.value]);
  return phase ? section[phase.value] : null;
}

const withShareTarget = (config, { bundleIdentifier, deploymentTarget }) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    if (project.pbxTargetByName(TARGET)) return config;
    const mainTarget = project.getFirstTarget().uuid;
    const quoted = (value) => `"${value}"`;
    const settings = (name) => ({
      PRODUCT_NAME: quoted("$(TARGET_NAME)"),
      PRODUCT_BUNDLE_IDENTIFIER: quoted(bundleIdentifier),
      INFOPLIST_FILE: `${TARGET}/Info.plist`,
      GENERATE_INFOPLIST_FILE: "NO",
      CODE_SIGN_ENTITLEMENTS: quoted(`${TARGET}/${TARGET}.entitlements`),
      CODE_SIGN_STYLE: "Automatic",
      ...(config.ios?.appleTeamId ? { DEVELOPMENT_TEAM: config.ios.appleTeamId } : {}),
      IPHONEOS_DEPLOYMENT_TARGET: quoted(deploymentTarget),
      TARGETED_DEVICE_FAMILY: quoted("1,2"),
      SWIFT_VERSION: "5.0",
      SWIFT_OPTIMIZATION_LEVEL: quoted(name === "Debug" ? "-Onone" : "-O"),
      ...(name === "Debug" ? { SWIFT_ACTIVE_COMPILATION_CONDITIONS: quoted("DEBUG $(inherited)") } : { SWIFT_COMPILATION_MODE: "wholemodule" }),
      APPLICATION_EXTENSION_API_ONLY: "YES",
      SKIP_INSTALL: "YES",
      CLANG_ENABLE_MODULES: "YES",
      LD_RUNPATH_SEARCH_PATHS: quoted("$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"),
      // The extension's version follows the app's (App Store Connect checks).
      MARKETING_VERSION: quoted(config.version ?? "1.0"),
      CURRENT_PROJECT_VERSION: quoted(config.ios?.buildNumber ?? "1"),
    });
    const configurations = project.addXCConfigurationList(
      ["Debug", "Release"].map((name) => ({ name, isa: "XCBuildConfiguration", buildSettings: settings(name) })),
      "Release",
      `Build configuration list for PBXNativeTarget "${TARGET}"`,
    );
    const product = project.addProductFile(TARGET, {
      basename: `${TARGET}.appex`,
      group: EMBED,
      explicitFileType: "wrapper.app-extension",
      settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
      includeInIndex: 0,
      path: `${TARGET}.appex`,
      sourceTree: "BUILT_PRODUCTS_DIR",
    });
    const target = {
      uuid: project.generateUuid(),
      pbxNativeTarget: {
        isa: "PBXNativeTarget",
        name: TARGET,
        productName: TARGET,
        productReference: product.fileRef,
        productType: quoted("com.apple.product-type.app-extension"),
        buildConfigurationList: configurations.uuid,
        buildPhases: [],
        buildRules: [],
        dependencies: [],
      },
    };
    project.addToPbxNativeTargetSection(target);
    project.addToPbxProjectSection(target);
    const projectSection = project.pbxProjectSection()[project.getFirstProject().uuid];
    projectSection.attributes.TargetAttributes ??= {};
    projectSection.attributes.TargetAttributes[target.uuid] = { LastSwiftMigration: 1250 };
    // The app builds the extension first and embeds it.
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    project.addTargetDependency(mainTarget, [target.uuid]);
    project.addBuildPhase(swiftFiles(), "PBXSourcesBuildPhase", "Sources", target.uuid, "app_extension", '""');
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid, "app_extension", '""');
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid, "app_extension", '""');
    if (!buildPhase(project, "PBXCopyFilesBuildPhase", mainTarget, EMBED)) project.addBuildPhase([], "PBXCopyFilesBuildPhase", EMBED, mainTarget, "app_extension", '""');
    const embed = buildPhase(project, "PBXCopyFilesBuildPhase", mainTarget, EMBED);
    if (!embed.files.some((file) => file.value === product.uuid)) embed.files.push({ value: product.uuid, comment: `${product.basename} in ${product.group}` });
    if (!project.pbxBuildFileSection()[product.uuid]) project.addToPbxBuildFileSection(product);
    // The extension's folder in the project navigator. Its Info.plist stays
    // out: the project would reuse the widget extension's file reference of
    // the same name (the build takes INFOPLIST_FILE anyway).
    const { uuid: group } = project.addPbxGroup([...swiftFiles(), `${TARGET}.entitlements`], TARGET, TARGET);
    const groups = project.hash.project.objects.PBXGroup;
    const root = Object.keys(groups).find((key) => typeof groups[key] === "object" && groups[key].name === undefined && groups[key].path === undefined);
    if (root) project.addToPbxGroup(group, root);
    return config;
  });

module.exports = (config, options) => withShareTarget(withShareFiles(config, options), options);
module.exports.ACTIVATION_RULE = ACTIVATION_RULE;
module.exports.TARGET = TARGET;
