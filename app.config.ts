// The whole native configuration of the app: `expo prebuild` generates the
// Xcode and Gradle projects from it (ios/ and android/ are not kept in the
// repository). See README → How it works.
import type { ExpoConfig } from "expo/config";
import { existsSync, readFileSync } from "node:fs";
import { buildNumber } from "./src/version";

// The native texts of the widgets, controls and App Shortcuts (German,
// English, French): Localizable.strings of the app and the widget extension.
const nativeStrings = require("./plugins/widget-suite/strings") as {
  strings: Record<string, { de: string; fr: string }>;
  gallery: Record<string, { label: string[]; description: string[] }>;
  localizable: (table: Record<string, { de: string; fr: string }>, lang: string) => Record<string, string>;
  galleryStrings: (lang: string) => Record<string, string>;
};
// Siri, Shortcuts, Focus filter and the controls of plugins/intents.
const intentStrings = require("./plugins/intents/strings") as { localizable: (lang: string) => Record<string, string> };
const locale = (lang: "de" | "en" | "fr") => {
  const json = JSON.parse(readFileSync(`./locales/${lang}.json`, "utf8")) as { ios: Record<string, string>; android: Record<string, string> };
  return {
    ...json,
    ios: { ...json.ios, "Localizable.strings": { ...nativeStrings.localizable(nativeStrings.strings, lang), ...intentStrings.localizable(lang) } },
    // The widget gallery (labels and descriptions) in the person's language.
    android: { ...json.android, ...nativeStrings.galleryStrings(lang) },
  };
};
// The configurable widgets on Android and their first size (cells).
const SUITE_ANDROID: [string, [number, number]][] = [
  ["FlowplanCapture", [4, 1]],
  ["FlowplanTaskList", [4, 2]],
  ["FlowplanAgenda", [4, 2]],
  ["FlowplanPinned", [4, 2]],
  ["FlowplanCounter", [2, 2]],
  ["FlowplanJournal", [4, 2]],
  ["FlowplanTime", [4, 2]],
  ["FlowplanMentions", [4, 2]],
  ["FlowplanForms", [2, 2]],
];
// Android widgets: name, label and description from the gallery table.
const androidWidget = (name: string, size: Record<string, unknown>) => ({
  name,
  label: `@string/widget_label_${name.toLowerCase()}`,
  description: nativeStrings.gallery[name].description[1],
  updatePeriodMillis: 1800000,
  ...size,
});

const { version } = require("./package.json") as { version: string };
const build = buildNumber(version, process.env.FLOWPLAN_BUILD);
const BUNDLE_ID = "app.flowplan.mobile";
// A test build for your own iPhone with a free Apple ID (Xcode "Personal
// Team", README → Testing on your iPhone): FLOWPLAN_PERSONAL=1. Apple gives
// free accounts no push, so the build leaves it out, uses a bundle ID of its
// own and – unless FLOWPLAN_WIDGETS=1 – no widgets (they need an App Group).
const PERSONAL = process.env.FLOWPLAN_PERSONAL === "1";
const WIDGETS = !PERSONAL || process.env.FLOWPLAN_WIDGETS === "1";
const IOS_BUNDLE_ID = process.env.FLOWPLAN_BUNDLE_ID || (PERSONAL ? `${BUNDLE_ID}.personal` : BUNDLE_ID);
const APP_GROUP = `group.${IOS_BUNDLE_ID}`;
const BACKGROUND = { light: "#fcfbf8", dark: "#16151b" };
const BRAND = "#4146e6";
// Android push needs a Firebase project (README → Push notifications); the
// release workflow writes the file from a secret.
const googleServices = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";

const config: ExpoConfig = {
  name: PERSONAL ? "Flowplan Test" : "Flowplan",
  slug: "flowplan",
  owner: process.env.EXPO_OWNER || undefined,
  version,
  scheme: "flowplan",
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  backgroundColor: BACKGROUND.light,
  primaryColor: BRAND,
  locales: { de: locale("de"), en: locale("en"), fr: locale("fr") },
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    buildNumber: String(build),
    supportsTablet: true,
    appleTeamId: process.env.IOS_TEAM_ID || undefined,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ["de", "en", "fr"],
      // The web app records audio (voice notes: getUserMedia({ audio })) and
      // takes files with <input type=file accept="image/*"> (pages,
      // whiteboard), for which the web view offers "Take Photo or Video";
      // the app's own capture screen (widgets, Siri) records voice memos
      // (expo-audio) and takes photos (expo-image-picker, which on Android
      // brings the CAMERA permission); the document scanner (VisionKit,
      // modules/flowplan-capture) uses the camera too. That is the camera and microphone use
      // these texts describe (also in locales/*.json). Photos are chosen with
      // the system picker, which needs no photo library permission.
      NSCameraUsageDescription: "Flowplan uses the camera when you take a photo for a page or a whiteboard, or scan a document.",
      NSMicrophoneUsageDescription: "Flowplan uses the microphone when you record a voice note or a video for a page.",
      NSPhotoLibraryAddUsageDescription: "Flowplan saves images to your photos when you ask it to.",
      NSFaceIDUsageDescription: "Flowplan uses Face ID to unlock the app when the app lock is on.",
      // Voice notes of the page become text on the phone itself
      // (modules/flowplan-speech, on-device only).
      NSSpeechRecognitionUsageDescription: "Flowplan turns your voice notes into text on this device.",
      UIViewControllerBasedStatusBarAppearance: true,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1", "1C8F.1"] },
      ],
    },
    ...(WIDGETS ? { entitlements: { "com.apple.security.application-groups": [APP_GROUP] } } : {}),
  },
  android: {
    package: BUNDLE_ID,
    versionCode: build,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      backgroundImage: "./assets/adaptive-background.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: BRAND,
    },
    ...(existsSync(googleServices) ? { googleServicesFile: googleServices } : {}),
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.POST_PROMOTED_NOTIFICATIONS",
      "android.permission.USE_BIOMETRIC",
      "android.permission.VIBRATE",
    ],
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    intentFilters: [
      // "Teilen" from other apps: text and links (the capture screen; before
      // signing in the instance's share target).
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "text/plain" }],
      },
      // Photos and PDFs, one or several: the app's capture screen
      // (src/screens/ShareCapture.tsx, modules/flowplan-android).
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "application/pdf" }],
      },
      {
        action: "SEND_MULTIPLE",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "application/pdf" }],
      },
    ],
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    [
      "expo-build-properties",
      {
        ios: { deploymentTarget: "16.4" },
        android: { minSdkVersion: 26 },
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-logo.png",
        imageWidth: 112,
        resizeMode: "contain",
        backgroundColor: BACKGROUND.light,
        dark: { image: "./assets/splash-logo.png", backgroundColor: BACKGROUND.dark },
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: BRAND,
        defaultChannel: "inbox",
        mode: process.env.APS_ENVIRONMENT === "development" ? "development" : "production",
        enableRemoteNotifications: !PERSONAL,
        enableBackgroundRemoteNotifications: !PERSONAL,
      },
    ],
    [
      "expo-local-authentication",
      { faceIDPermission: "Flowplan uses Face ID to unlock the app when the app lock is on." },
    ],
    "expo-background-task",
    "expo-secure-store",
    "expo-web-browser",
    "expo-localization",
    "expo-quick-actions",
    // The capture screen: voice memos (recording goes on with the screen
    // locked, shown as Live Activity / ongoing notification) and photos.
    [
      "expo-audio",
      {
        microphonePermission: "Flowplan uses the microphone when you record a voice note or a video for a page.",
        enableBackgroundRecording: true,
        enableBackgroundPlayback: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: false,
        cameraPermission: "Flowplan uses the camera when you take a photo for a page or a whiteboard, or scan a document.",
        microphonePermission: "Flowplan uses the microphone when you record a voice note or a video for a page.",
      },
    ],
    // iOS: the configurable widgets, controls and App Shortcuts in Swift,
    // added to expo-widgets' extension and the app. Before expo-widgets:
    // mods run last-added first (plugins/with-widget-suite.js).
    // iOS: Siri and Shortcuts, the Focus filter and two more controls, on
    // top of the suite (plugins/with-intents.js) – listed before it, so it
    // runs after it.
    WIDGETS && "./plugins/with-intents",
    WIDGETS && "./plugins/with-widget-suite",
    // iOS: the share extension (links, text, images and PDFs from other apps
    // into the inbox, a page or a database), in the App Group like the
    // widgets, whose session it reads (plugins/with-capture.js).
    WIDGETS && ["./plugins/with-capture", { appGroup: APP_GROUP, bundleIdentifier: `${IOS_BUNDLE_ID}.share`, deploymentTarget: "17.0" }],
    // iOS: home screen and lock screen widgets, and the running timer as Live
    // Activity (lock screen, Dynamic Island) – written with Expo UI (SwiftUI).
    WIDGETS && [
      "expo-widgets",
      {
        bundleIdentifier: `${IOS_BUNDLE_ID}.widgets`,
        groupIdentifier: APP_GROUP,
        enablePushNotifications: false,
        widgets: [
          {
            name: "FlowplanTasks",
            displayName: nativeStrings.gallery.FlowplanTasks.label[1],
            description: nativeStrings.gallery.FlowplanTasks.description[1],
            ios: {
              // systemExtraLarge: the iPad's widest widget.
              supportedFamilies: ["systemSmall", "systemMedium", "systemLarge", "systemExtraLarge", "accessoryRectangular", "accessoryInline"],
              // Built into the extension: the widget has its layout and the
              // gallery its sample before the app has ever run.
              initialLayout: "./src/widgets/ios.tsx",
              // Settings (iOS 17): what else besides the tasks due.
              configuration: {
                title: "Flowplan",
                parameters: {
                  show: { title: "Show", type: "enum", values: [{ name: "Tasks and inbox", value: "all" }, { name: "Tasks only", value: "tasks" }], default: "all" },
                  timer: { title: "Running timer", type: "boolean", default: true },
                },
              },
            },
            android: null,
          },
          {
            name: "FlowplanInbox",
            displayName: nativeStrings.gallery.FlowplanInbox.label[1],
            description: nativeStrings.gallery.FlowplanInbox.description[1],
            ios: { supportedFamilies: ["systemSmall", "accessoryCircular", "accessoryInline"], initialLayout: "./src/widgets/ios.tsx" },
            android: null,
          },
          // Administrators of the instance (src/admin.ts); others see
          // "Administrators only". One thing each, chosen in the settings.
          {
            name: "FlowplanInstance",
            displayName: nativeStrings.gallery.FlowplanInstance.label[1],
            description: nativeStrings.gallery.FlowplanInstance.description[1],
            ios: {
              supportedFamilies: ["systemSmall", "systemMedium", "accessoryRectangular", "accessoryInline"],
              initialLayout: "./src/widgets/ios.tsx",
              configuration: {
                title: "Flowplan Instance",
                parameters: {
                  show: { title: "Show", type: "enum", values: [{ name: "State", value: "state" }, { name: "Last backup", value: "backup" }, { name: "Version", value: "version" }], default: "state" },
                },
              },
            },
            android: null,
          },
          {
            name: "FlowplanLive",
            displayName: nativeStrings.gallery.FlowplanLive.label[1],
            description: nativeStrings.gallery.FlowplanLive.description[1],
            ios: {
              supportedFamilies: ["systemSmall", "systemMedium", "systemLarge", "accessoryCircular", "accessoryRectangular"],
              initialLayout: "./src/widgets/ios.tsx",
              configuration: {
                title: "Flowplan Live",
                parameters: {
                  metric: {
                    title: "Metric",
                    type: "enum",
                    values: [
                      { name: "Active now", value: "active" },
                      { name: "Requests/min", value: "requests" },
                      { name: "Error rate (1 h)", value: "errors" },
                      { name: "Sign-ins today", value: "signins" },
                    ],
                    default: "active",
                  },
                },
              },
            },
            android: null,
          },
          {
            name: "FlowplanStorage",
            displayName: nativeStrings.gallery.FlowplanStorage.label[1],
            description: nativeStrings.gallery.FlowplanStorage.description[1],
            ios: {
              supportedFamilies: ["systemSmall", "systemMedium", "accessoryCircular", "accessoryRectangular"],
              initialLayout: "./src/widgets/ios.tsx",
              configuration: {
                title: "Flowplan Storage",
                parameters: {
                  metric: {
                    title: "Metric",
                    type: "enum",
                    values: [
                      { name: "Disk used", value: "disk" },
                      { name: "Database and files", value: "database" },
                      { name: "Fullest workspace", value: "quota" },
                    ],
                    default: "disk",
                  },
                },
              },
            },
            android: null,
          },
        ],
      },
    ],
    // Android: the gallery's English labels and descriptions (translations:
    // locales above); before react-native-android-widget so that its
    // untranslatable descriptions are replaced (mods run last-added first).
    "./plugins/with-widget-gallery",
    // Android: home screen widgets (RemoteViews, rendered from React). The
    // configurable ones have settings per widget ("Configure" on the home
    // screen, src/screens/WidgetConfig.tsx) but work without them.
    [
      "react-native-android-widget",
      {
        widgets: [
          androidWidget("FlowplanTasks", { minWidth: "250dp", minHeight: "110dp", targetCellWidth: 4, targetCellHeight: 2, maxResizeWidth: "500dp", maxResizeHeight: "500dp", resizeMode: "horizontal|vertical" }),
          androidWidget("FlowplanInbox", { minWidth: "110dp", minHeight: "110dp", targetCellWidth: 2, targetCellHeight: 2, resizeMode: "none" }),
          androidWidget("FlowplanInstance", { minWidth: "110dp", minHeight: "110dp", targetCellWidth: 2, targetCellHeight: 2, maxResizeWidth: "400dp", maxResizeHeight: "250dp", resizeMode: "horizontal|vertical" }),
          androidWidget("FlowplanLive", { minWidth: "110dp", minHeight: "110dp", targetCellWidth: 2, targetCellHeight: 2, maxResizeWidth: "500dp", maxResizeHeight: "300dp", resizeMode: "horizontal|vertical" }),
          androidWidget("FlowplanStorage", { minWidth: "110dp", minHeight: "110dp", targetCellWidth: 2, targetCellHeight: 2, maxResizeWidth: "400dp", maxResizeHeight: "250dp", resizeMode: "horizontal|vertical" }),
          ...SUITE_ANDROID.map(([name, cells]) =>
            androidWidget(name, {
              minWidth: cells[0] > 2 ? "250dp" : "110dp",
              minHeight: "110dp",
              targetCellWidth: cells[0],
              targetCellHeight: cells[1],
              maxResizeWidth: "500dp",
              maxResizeHeight: "500dp",
              resizeMode: "horizontal|vertical",
              widgetFeatures: "reconfigurable|configuration_optional",
            }),
          ),
        ],
      },
    ],
    "./plugins/with-managed-config",
    // Android: static app shortcuts, the share sheet's name for several files.
    "./plugins/with-android-extras",
    "./plugins/with-android-signing",
  ].filter((plugin) => plugin !== false) as ExpoConfig["plugins"],
  extra: {
    appGroup: APP_GROUP,
    // Without the widget extension (personal test build) the app leaves
    // widgets and Live Activity out.
    widgets: WIDGETS,
    // Expo's push service needs the project of the app (README → Push).
    ...(process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {}),
  },
};

export default config;
