// The update check's rules without React Native (test/android.test.ts):
// what the website's answer must look like, when to ask again and whether a
// version is offered (src/android-update.ts).
const DAY = 24 * 60 * 60 * 1000;
const LATER = 7 * DAY;

export type UpdateInfo = { version: string; versionCode: number; url: string };
export type CheckState = { at: number; skipped?: string; skippedAt?: number };

export function parseUpdateInfo(value: unknown): UpdateInfo | null {
  if (!value || typeof value !== "object") return null;
  const { version, versionCode, url } = value as Record<string, unknown>;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode <= 0) return null;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  return { version, versionCode, url };
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

