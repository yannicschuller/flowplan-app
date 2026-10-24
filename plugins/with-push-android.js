// Android: one FCM service only. modules/flowplan-push declares
// FlowplanMessagingService, which decrypts the push relay's messages and
// hands everything on to expo-notifications; expo-notifications' own
// service is removed from the merged manifest, so that it cannot take
// MESSAGING_EVENT first and show a relay message undecrypted (Firebase
// delivers to one service). Local notifications, channels, categories and
// the response handling stay expo-notifications'. Without
// google-services.json (GOOGLE_SERVICES_JSON) Firebase does not start and
// Android simply has no push.
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const EXPO_SERVICE = "expo.modules.notifications.service.ExpoFirebaseMessagingService";
const SERVICE = "app.flowplan.push.FlowplanMessagingService";

// The manifest (as config-plugins read it) without expo-notifications' FCM
// service: tools:node="remove" takes it out of the merged manifest.
function oneMessagingService(androidManifest) {
  const manifest = androidManifest.manifest;
  manifest.$ = { ...(manifest.$ || {}), "xmlns:tools": manifest.$?.["xmlns:tools"] || "http://schemas.android.com/tools" };
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.service = [
    ...(application.service || []).filter((service) => service.$?.["android:name"] !== EXPO_SERVICE),
    { $: { "android:name": EXPO_SERVICE, "tools:node": "remove" } },
  ];
  return androidManifest;
}

const withPushAndroid = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = oneMessagingService(config.modResults);
    return config;
  });

module.exports = withPushAndroid;
module.exports.EXPO_SERVICE = EXPO_SERVICE;
module.exports.SERVICE = SERVICE;
module.exports.oneMessagingService = oneMessagingService;
