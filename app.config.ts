// The whole native configuration of the app: `expo prebuild` generates the
// Xcode and Gradle projects from it (ios/ and android/ are not kept in the
// repository). See README → How it works.
import type { ExpoConfig } from "expo/config";
import { existsSync } from "node:fs";
import { buildNumber } from "./src/version";

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
  locales: {
    de: "./locales/de.json",
    en: "./locales/en.json",
    fr: "./locales/fr.json",
  },
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
      // whiteboard), for which the web view offers "Take Photo or Video" –
      // that is the camera and microphone use these texts describe (also in
      // locales/*.json). On Android the system camera app takes the picture
      // for that chooser, so the app needs no CAMERA permission there; add it
      // (android.permissions below) only when the web app itself captures
      // video or photos (getUserMedia({ video }), <input capture>).
      NSCameraUsageDescription: "Flowplan uses the camera when you take a photo for a page or a whiteboard.",
      NSMicrophoneUsageDescription: "Flowplan uses the microphone when you record a voice note or a video for a page.",
      NSPhotoLibraryAddUsageDescription: "Flowplan saves images to your photos when you ask it to.",
      NSFaceIDUsageDescription: "Flowplan uses Face ID to unlock the app when the app lock is on.",
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
      // "Teilen" from other apps: text and links go to the instance's share target.
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "text/plain" }],
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
            displayName: "Flowplan",
            description: "Tasks due, the inbox and the running timer.",
            ios: {
              // systemExtraLarge: the iPad's widest widget.
              supportedFamilies: ["systemSmall", "systemMedium", "systemLarge", "systemExtraLarge", "accessoryRectangular", "accessoryInline"],
              // Built into the extension: the widget has its layout and the
              // gallery its sample before the app has ever run.
              initialLayout: "./src/widgets/ios.tsx",
            },
            android: null,
          },
          {
            name: "FlowplanInbox",
            displayName: "Flowplan Inbox",
            description: "Unread notifications.",
            ios: { supportedFamilies: ["systemSmall", "accessoryCircular", "accessoryInline"], initialLayout: "./src/widgets/ios.tsx" },
            android: null,
          },
        ],
      },
    ],
    // Android: home screen widgets (RemoteViews, rendered from React).
    [
      "react-native-android-widget",
      {
        widgets: [
          {
            name: "FlowplanTasks",
            label: "Flowplan",
            description: "Tasks due, the inbox and the running timer.",
            minWidth: "250dp",
            minHeight: "110dp",
            targetCellWidth: 4,
            targetCellHeight: 2,
            maxResizeWidth: "500dp",
            maxResizeHeight: "500dp",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000,
          },
          {
            name: "FlowplanInbox",
            label: "Flowplan Inbox",
            description: "Unread notifications.",
            minWidth: "110dp",
            minHeight: "110dp",
            targetCellWidth: 2,
            targetCellHeight: 2,
            resizeMode: "none",
            updatePeriodMillis: 1800000,
          },
        ],
      },
    ],
    "./plugins/with-managed-config",
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
