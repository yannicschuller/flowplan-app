// Android without a store: the APK comes from flowplan.org/download, and the
// app asks there once a day whether a newer one is out
// (flowplan-website app/api/android/route.ts). A newer one is offered with
// "Download" (the browser fetches the APK, Android's installer updates the
// app in place – same signature, the data stays) or "Later" (asked again
// for that version after a week). Builds for a store (FLOWPLAN_ANDROID_UPDATES=0)
// leave it to the store.
import { Alert, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { store } from "./store";
import { t } from "./i18n";
import { due, offer, parseCheckState, parseUpdateInfo } from "./android/update-check";

const updatesOn = () => Platform.OS === "android" && Constants.expoConfig?.extra?.androidUpdates !== false;
const feed = () => String(Constants.expoConfig?.extra?.androidUpdateFeed || "https://flowplan.org/api/android");

let running = false;
export async function checkAndroidUpdate(now = Date.now()) {
  if (!updatesOn() || running) return;
  const state = parseCheckState(store.updateCheck());
  if (!due(state, now)) return;
  running = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(feed(), { cache: "no-store", signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!response.ok) return;
    const info = parseUpdateInfo(await response.json());
    store.setUpdateCheck(JSON.stringify({ ...state, at: now }));
    const installed = Number(Application.nativeBuildVersion) || 0;
    if (!info || !offer(info, installed, state, now)) return;
    Alert.alert(t("updateTitle", { version: info.version }), t("updateText"), [
      {
        text: t("updateLater"),
        style: "cancel",
        onPress: () => store.setUpdateCheck(JSON.stringify({ at: now, skipped: info.version, skippedAt: now })),
      },
      { text: t("updateNow"), onPress: () => void Linking.openURL(info.url) },
    ]);
  } catch {
    // Offline or the site is down: next time.
  } finally {
    running = false;
  }
}
