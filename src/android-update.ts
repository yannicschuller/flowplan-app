// Android without a store: the APK comes from flowplan.org/download, and the
// app asks there once a day whether a newer one is out
// (flowplan-website app/api/android/route.ts). A newer one is offered with
// "Update" or "Later" (asked again for that version after a week).
//
// "Update" installs it in the app (#379): the APK is downloaded into the
// cache's flowplan-updates folder with a bar that can be cancelled
// (screens/UpdateProgress.tsx), checked – this app, newer than the installed
// build, the size and SHA-256 the website names – and handed to Android's
// package installer (modules/flowplan-native AppUpdates.kt), which updates
// the app in place only when it is signed with the same key; sign-in and
// data stay. Without "Install unknown apps" for Flowplan the app opens that
// switch first and goes on when the person returns. The APK is deleted when
// the installer closes, before every download and on the next start.
// Whatever fails, the error is shown with the old way as a way out: the
// browser downloads the APK.
//
// Builds for a store (FLOWPLAN_ANDROID_UPDATES=0) leave it to the store.
import { Alert, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import { updateInstaller, type UpdateInstaller } from "../modules/flowplan-native/src";
import { store } from "./store";
import { t, type TextKey } from "./i18n";
import { apkName, apkProblem, due, offer, parseCheckState, parseUpdateInfo, staleApks, type ApkProblem, type UpdateInfo } from "./android/update-check";

const updatesOn = () => Platform.OS === "android" && Constants.expoConfig?.extra?.androidUpdates !== false;
const feed = () => String(Constants.expoConfig?.extra?.androidUpdateFeed || "https://flowplan.org/api/android");
const installedBuild = () => Number(Application.nativeBuildVersion) || 0;

// The download in progress, for the sheet (null: none).
export type UpdateProgress = { version: string; received: number; total: number };
let progress: UpdateProgress | null = null;
const listeners = new Set<(value: UpdateProgress | null) => void>();
function setProgress(value: UpdateProgress | null) {
  progress = value;
  for (const listener of listeners) listener(value);
}
export const currentUpdateProgress = () => progress;
export function onUpdateProgress(listener: (value: UpdateProgress | null) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
let abort: AbortController | null = null;
// "Cancel" on the sheet.
export function cancelUpdate() {
  abort?.abort();
}

const folder = () => new Directory(Paths.cache, "flowplan-updates");
// Every APK in the update folder and (from elsewhere, earlier) the cache itself.
function cleanUp() {
  for (const dir of [folder(), Paths.cache]) {
    try {
      if (!dir.exists) continue;
      const files = dir.list().filter((entry): entry is File => entry instanceof File);
      const stale = new Set(staleApks(files.map((file) => file.name)));
      for (const file of files) if (stale.has(file.name)) file.delete();
    } catch {}
  }
}

let running = false;
// While an update downloads or the installer or the settings are open
// (returning from them makes the app active again).
let updating = false;
let cleaned = false;
export async function checkAndroidUpdate(now = Date.now()) {
  if (!updatesOn() || running || updating) return;
  if (!cleaned) {
    cleaned = true;
    cleanUp();
  }
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
    if (!info || !offer(info, installedBuild(), state, now)) return;
    Alert.alert(t("updateTitle", { version: info.version }), t("updateText"), [
      {
        text: t("updateLater"),
        style: "cancel",
        onPress: () => store.setUpdateCheck(JSON.stringify({ at: now, skipped: info.version, skippedAt: now })),
      },
      { text: t("updateNow"), onPress: () => void update(info, now) },
    ]);
  } catch {
    // Offline or the site is down: next time.
  } finally {
    running = false;
  }
}

const PROBLEMS: Record<ApkProblem, TextKey> = {
  unreadable: "updateErrorUnreadable",
  package: "updateErrorPackage",
  version: "updateErrorVersion",
  size: "updateErrorFile",
  hash: "updateErrorFile",
};
class UpdateError extends Error {}

async function update(info: UpdateInfo, now: number) {
  const installer = updateInstaller();
  // An older build without the installer: the browser, as before.
  if (!installer) return void Linking.openURL(info.url);
  updating = true;
  try {
    if (!(await mayInstall(installer, now))) return;
    const file = await download(info);
    if (!file) return;
    const problem = apkProblem(info, await installer.inspect(file.uri), installedBuild(), Application.applicationId || "");
    if (problem) throw new UpdateError(t(PROBLEMS[problem]));
    const outcome = await installer.install(file.uri);
    if (outcome === "failed") throw new UpdateError(t("updateErrorInstall"));
  } catch (error) {
    setProgress(null);
    const message = error instanceof UpdateError ? error.message : String((error as Error)?.message || error);
    Alert.alert(t("updateFailed"), `${message}\n\n${t("updateFallback")}`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("updateInBrowser"), onPress: () => void Linking.openURL(info.url) },
    ]);
  } finally {
    // Installed (when Android did not restart the app first), cancelled or failed: the file goes.
    cleanUp();
    updating = false;
  }
}

// "Install unknown apps" for Flowplan: on, or switched on in the settings now.
async function mayInstall(installer: UpdateInstaller, now: number) {
  if (installer.canInstall()) return true;
  const go = await new Promise<boolean>((resolve) =>
    Alert.alert(t("updateAllowTitle"), t("updateAllowText"), [
      { text: t("cancel"), style: "cancel", onPress: () => resolve(false) },
      { text: t("updateAllowOpen"), onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
  if (!go) return false;
  // Some Android versions restart the app when the switch changes: then the
  // next start asks again instead of waiting a day.
  const before = store.updateCheck();
  store.setUpdateCheck(JSON.stringify({ ...parseCheckState(before), at: 0 }));
  const allowed = await installer.openSettings().catch(() => installer.canInstall());
  store.setUpdateCheck(JSON.stringify({ ...parseCheckState(before), at: now }));
  if (!allowed) throw new UpdateError(t("updateErrorNotAllowed"));
  return true;
}

// The APK into the update folder, with the sheet's bar; null: cancelled.
async function download(info: UpdateInfo): Promise<File | null> {
  cleanUp();
  const dir = folder();
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, apkName(info.version));
  const controller = new AbortController();
  abort = controller;
  setProgress({ version: info.version, received: 0, total: info.size || -1 });
  try {
    return await File.downloadFileAsync(info.url, target, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => setProgress({ version: info.version, received: bytesWritten, total: totalBytes > 0 ? totalBytes : info.size || -1 }),
    });
  } catch (error) {
    if (controller.signal.aborted) return null;
    throw error;
  } finally {
    abort = null;
    setProgress(null);
  }
}
