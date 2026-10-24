// An app extension target of its own in the Xcode project that prebuild
// generates, embedded in the app (Embed Foundation Extensions): the share
// extension (with-capture.js) and the Notification Service Extension
// (with-notification-service.js). Its files are written into
// ios/<target>/ by the plugin itself; this adds the target, its build
// settings (signing, version, Swift 5), the dependency and the embedding.
const EMBED = "Embed Foundation Extensions";

// The build phase of a target with this name (or the first of its type).
function buildPhase(project, type, targetUuid, name) {
  const section = project.hash.project.objects[type];
  const target = project.pbxNativeTargetSection()[targetUuid];
  if (!section || !target?.buildPhases) return null;
  const phase = target.buildPhases.find((p) => (!name || p.comment === name) && section[p.value]);
  return phase ? section[phase.value] : null;
}

// target: name; bundleIdentifier; deploymentTarget; sources (Swift files in
// ios/<target>/); files (more files shown in the project navigator, e.g. the
// entitlements); config: the Expo config (team, version, build number).
function addExtensionTarget(project, { target: name, bundleIdentifier, deploymentTarget, sources, files = [], config }) {
  if (project.pbxTargetByName(name)) return;
  const mainTarget = project.getFirstTarget().uuid;
  const quoted = (value) => `"${value}"`;
  const settings = (configuration) => ({
    PRODUCT_NAME: quoted("$(TARGET_NAME)"),
    PRODUCT_BUNDLE_IDENTIFIER: quoted(bundleIdentifier),
    INFOPLIST_FILE: `${name}/Info.plist`,
    GENERATE_INFOPLIST_FILE: "NO",
    CODE_SIGN_ENTITLEMENTS: quoted(`${name}/${name}.entitlements`),
    CODE_SIGN_STYLE: "Automatic",
    ...(config.ios?.appleTeamId ? { DEVELOPMENT_TEAM: config.ios.appleTeamId } : {}),
    IPHONEOS_DEPLOYMENT_TARGET: quoted(deploymentTarget),
    TARGETED_DEVICE_FAMILY: quoted("1,2"),
    SWIFT_VERSION: "5.0",
    SWIFT_OPTIMIZATION_LEVEL: quoted(configuration === "Debug" ? "-Onone" : "-O"),
    ...(configuration === "Debug" ? { SWIFT_ACTIVE_COMPILATION_CONDITIONS: quoted("DEBUG $(inherited)") } : { SWIFT_COMPILATION_MODE: "wholemodule" }),
    APPLICATION_EXTENSION_API_ONLY: "YES",
    SKIP_INSTALL: "YES",
    CLANG_ENABLE_MODULES: "YES",
    LD_RUNPATH_SEARCH_PATHS: quoted("$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"),
    // The extension's version follows the app's (App Store Connect checks).
    MARKETING_VERSION: quoted(config.version ?? "1.0"),
    CURRENT_PROJECT_VERSION: quoted(config.ios?.buildNumber ?? "1"),
  });
  const configurations = project.addXCConfigurationList(
    ["Debug", "Release"].map((configuration) => ({ name: configuration, isa: "XCBuildConfiguration", buildSettings: settings(configuration) })),
    "Release",
    `Build configuration list for PBXNativeTarget "${name}"`,
  );
  const product = project.addProductFile(name, {
    basename: `${name}.appex`,
    group: EMBED,
    explicitFileType: "wrapper.app-extension",
    settings: { ATTRIBUTES: ["RemoveHeadersOnCopy"] },
    includeInIndex: 0,
    path: `${name}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  });
  const target = {
    uuid: project.generateUuid(),
    pbxNativeTarget: {
      isa: "PBXNativeTarget",
      name,
      productName: name,
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
  project.addBuildPhase(sources, "PBXSourcesBuildPhase", "Sources", target.uuid, "app_extension", '""');
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid, "app_extension", '""');
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid, "app_extension", '""');
  if (!buildPhase(project, "PBXCopyFilesBuildPhase", mainTarget, EMBED)) project.addBuildPhase([], "PBXCopyFilesBuildPhase", EMBED, mainTarget, "app_extension", '""');
  const embed = buildPhase(project, "PBXCopyFilesBuildPhase", mainTarget, EMBED);
  if (!embed.files.some((file) => file.value === product.uuid)) embed.files.push({ value: product.uuid, comment: `${product.basename} in ${product.group}` });
  if (!project.pbxBuildFileSection()[product.uuid]) project.addToPbxBuildFileSection(product);
  // The extension's folder in the project navigator. Its Info.plist stays
  // out: the project would reuse the widget extension's file reference of
  // the same name (the build takes INFOPLIST_FILE anyway).
  const { uuid: group } = project.addPbxGroup([...sources, ...files], name, name);
  const groups = project.hash.project.objects.PBXGroup;
  const root = Object.keys(groups).find((key) => typeof groups[key] === "object" && groups[key].name === undefined && groups[key].path === undefined);
  if (root) project.addToPbxGroup(group, root);
}

module.exports = { addExtensionTarget, buildPhase, EMBED };
