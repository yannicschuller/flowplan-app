// iOS: the app in several windows (iPad: Split View, Slide Over, Stage
// Manager, "Open in new window") and Handoff of the page a window shows
// (modules/flowplan-ipad, src/windows.ts).
//
// - Info.plist: more than one scene, and the activity types the app
//   advertises and continues – "app.flowplan.page" (a page, also from the
//   Mac app flowplan-desktop) and "app.flowplan.window" (asks for a new
//   window with a page).
// - SceneDelegate.swift (Expo's template): every window's root component
//   gets { flowplanWindow: { scene, url, shortcut } } – its id, the page of a
//   new window or of a page window iPadOS brings back, and the quick action
//   on the app icon that started the app.
const { withDangerousMod, withInfoPlist } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const ACTIVITY_TYPES = ["app.flowplan.page", "app.flowplan.window"];
const MARKER = "  // Extension point for config plugins.\n";
const DONE = "flowplanWindow";

const SCENE_CODE = `
  // iPad windows (plugins/with-ipad.js, src/windows.ts): each window's
  // root component gets its id and – for a page window – its page.
  private var flowplanWindow: [AnyHashable: Any]?

  override var initialProperties: [AnyHashable: Any]? {
    flowplanWindow
  }

  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    var window: [String: Any] = ["scene": session.persistentIdentifier]
    // "Open in new window", or a page window that iPadOS restores.
    let opened = connectionOptions.userActivities.first { $0.activityType == "app.flowplan.window" }
    if let url = opened?.userInfo?["url"] as? String {
      window["url"] = url
    } else if let restored = session.stateRestorationActivity,
              restored.userInfo?["window"] as? String == "page",
              let url = restored.userInfo?["url"] as? String {
      window["url"] = url
    }
    // A quick action on the app icon that starts the app: with scenes, iOS
    // hands it to the scene, not to the launch options expo-quick-actions
    // reads (src/native/actions.ts). Its id and parameters (path, link).
    if let item = connectionOptions.shortcutItem {
      var shortcut: [String: Any] = ["id": item.type]
      for (key, value) in item.userInfo ?? [:] {
        if let value = value as? String { shortcut[key] = value }
      }
      window["shortcut"] = shortcut
    }
    flowplanWindow = ["flowplanWindow": window]
    super.scene(scene, willConnectTo: session, options: connectionOptions)
  }

  // The page of a page window (modules/flowplan-ipad marks it), so it comes
  // back with the window; the main window starts on the instance.
  @objc(stateRestorationActivityForScene:)
  func stateRestorationActivity(for scene: UIScene) -> NSUserActivity? {
    guard let activity = scene.userActivity, activity.userInfo?["window"] as? String == "page" else { return nil }
    return activity
  }
`;

function patchSceneDelegate(contents) {
  if (contents.includes(DONE)) return contents;
  if (!contents.includes(MARKER)) throw new Error("with-ipad: SceneDelegate.swift is not Expo's template (no extension point).");
  let next = contents.replace(MARKER, `${MARKER}${SCENE_CODE}`);
  if (!/^import UIKit$/m.test(next)) next = next.replace(/^(internal import Expo\n)/m, "$1import UIKit\n");
  return next;
}

const withIPad = (config) => {
  config = withInfoPlist(config, (config) => {
    const plist = config.modResults;
    const manifest = plist.UIApplicationSceneManifest || {
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
        ],
      },
    };
    plist.UIApplicationSceneManifest = { ...manifest, UIApplicationSupportsMultipleScenes: true };
    plist.NSUserActivityTypes = [...new Set([...(plist.NSUserActivityTypes || []), ...ACTIVITY_TYPES])];
    // Split View, Slide Over and Stage Manager need every orientation.
    plist.UIRequiresFullScreen = false;
    return config;
  });
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName, "SceneDelegate.swift");
      fs.writeFileSync(file, patchSceneDelegate(fs.readFileSync(file, "utf8")));
      return config;
    },
  ]);
};

module.exports = withIPad;
module.exports.patchSceneDelegate = patchSceneDelegate;
