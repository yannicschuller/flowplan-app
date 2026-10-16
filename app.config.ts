// The whole native configuration of the app: `expo prebuild` generates the
// Xcode and Gradle projects from it (ios/ and android/ are not kept in the
// repository). See README → How it works.
import type { ExpoConfig } from "expo/config";
import { existsSync } from "node:fs";
import { buildNumber } from "./src/version";

const { version } = require("./package.json") as { version: string };
const build = buildNumber(version, process.env.FLOWPLAN_BUILD);
const BUNDLE_ID = "app.flowplan.mobile";
const APP_GROUP = `group.${BUNDLE_ID}`;
const BACKGROUND = { light: "#fcfbf8", dark: "#16151b" };
const BRAND = "#4146e6";
// Android push needs a Firebase project (README → Push notifications); the
// release workflow writes the file from a secret.
const googleServices = process.env.GOOGLE_SERVICES_JSON || "./google-services.json";

const config: ExpoConfig = {
  name: "Flowplan",
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
    bundleIdentifier: BUNDLE_ID,
    buildNumber: String(build),
    supportsTablet: true,
    appleTeamId: process.env.IOS_TEAM_ID || undefined,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ["de", "en", "fr"],
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
    entitlements: {
      "com.apple.security.application-groups": [APP_GROUP],
    },
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
        enableBackgroundRemoteNotifications: true,
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
    [
      "expo-widgets",
      {
        bundleIdentifier: `${BUNDLE_ID}.widgets`,
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
            },
            android: null,
          },
          {
            name: "FlowplanInbox",
            displayName: "Flowplan Inbox",
            description: "Unread notifications.",
            ios: { supportedFamilies: ["systemSmall", "accessoryCircular", "accessoryInline"] },
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
  ],
  extra: {
    appGroup: APP_GROUP,
    // Expo's push service needs the project of the app (README → Push).
    ...(process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {}),
  },
};

export default config;
