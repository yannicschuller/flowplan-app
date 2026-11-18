// The update check's rules without React Native (test/android.test.ts):
// what the website's answer must look like, when to ask again, whether a
// version is offered, whether the downloaded APK is the one to install and
// which files of the cache go (src/android-update.ts).
const DAY = 24 * 60 * 60 * 1000;
const LATER = 7 * DAY;

// size (bytes) and sha256 (hex) of the APK: from the GitHub release, when
// the website knows them (flowplan-website lib/android.ts).
export type UpdateInfo = { version: string; versionCode: number; url: string; size?: number; sha256?: string };
export type CheckState = { at: number; skipped?: string; skippedAt?: number };

export function parseUpdateInfo(value: unknown): UpdateInfo | null {
  if (!value || typeof value !== "object") return null;
  const { version, versionCode, url, size, sha256 } = value as Record<string, unknown>;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode <= 0) return null;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  const info: UpdateInfo = { version, versionCode, url };
  if (typeof size === "number" && Number.isInteger(size) && size > 0) info.size = size;
  if (typeof sha256 === "string" && /^[0-9a-f]{64}$/i.test(sha256)) info.sha256 = sha256.toLowerCase();
  return info;
}

export function parseCheckState(raw: string | null): CheckState {
  try {
    const value = JSON.parse(raw || "null") as CheckState | null;
    if (value && typeof value.at === "number") return value;
  } catch {}
  return { at: 0 };
}

// Whether to look again now, and whether to offer `info` to this build.
export const due = (state: CheckState, now: number) => now - state.at >= DAY;
export function offer(info: UpdateInfo, installed: number, state: CheckState, now: number) {
  if (info.versionCode <= installed) return false;
  return !(state.skipped === info.version && now - (state.skippedAt || 0) < LATER);
}


// What Android read from the downloaded APK (modules/flowplan-native AppUpdates.kt).
export type DownloadedApk = { packageName: string; versionCode: number; size: number; sha256: string };
export type ApkProblem = "unreadable" | "package" | "version" | "size" | "hash";

// Why the downloaded file must not go to the installer, or null: it is this
// app, newer than the installed build and – where the website names them –
// exactly the published size and SHA-256. (The installer itself refuses an
// APK signed with another key.)
export function apkProblem(info: UpdateInfo, apk: DownloadedApk | null, installed: number, packageName: string): ApkProblem | null {
  if (!apk) return "unreadable";
  if (apk.packageName !== packageName) return "package";
  if (!(apk.versionCode > installed)) return "version";
  if (info.size !== undefined && apk.size !== info.size) return "size";
  if (info.sha256 !== undefined && apk.sha256.toLowerCase() !== info.sha256) return "hash";
  return null;
}

// The downloaded update's name in the cache's update folder.
export const apkName = (version: string) => `Flowplan-${version.replace(/[^0-9.]/g, "")}.apk`;
// The files to delete: every APK (a download that stopped, an update that
// was installed or cancelled) – on start, before a download and after the
// installer.
export const staleApks = (names: readonly string[]) => names.filter((name) => /\.apk$/i.test(name));

// The bar: 0–1, or null while the size is unknown.
export function progressOf(received: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(1, received / total));
}
export const megabytes = (bytes: number) => (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
