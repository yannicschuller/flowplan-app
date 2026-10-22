// What the app remembers: the profiles (instances, profiles.ts), this
// installation's id, per profile the device token for widgets
// (lib/mobile-devices.ts in Flowplan) and the last summary, and the app lock.
// In the keychain / Keystore, readable after the first unlock so that
// background refreshes work while the phone is locked.
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import {
  activeProfile,
  loadProfiles,
  PROFILE_KEYS,
  PROFILES_KEY,
  profileKey,
  serializeProfiles,
  type ProfileKey,
  type ProfileState,
} from "./profiles";
import type { Summary } from "./summary";

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const KEYS = {
  installation: "flowplan.installation",
  appLock: "flowplan.appLock",
  pushAsked: "flowplan.pushAsked",
} as const;

function read(key: string) {
  try {
    return SecureStore.getItem(key, options);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) void SecureStore.deleteItemAsync(key, options);
    else SecureStore.setItem(key, value, options);
  } catch {}
}

// Read once (the first read moves a single address of an older version into
// the first profile), then kept here and written through.
let profiles: ProfileState | null = null;
const state = () => (profiles ??= loadProfiles(read, write));
// The active profile's own key: nothing of one instance reaches another.
const activeKey = (key: ProfileKey) => {
  const id = state().active;
  return id ? profileKey(id, key) : null;
};

export const store = {
  profiles: () => state(),
  setProfiles(next: ProfileState) {
    profiles = next;
    write(PROFILES_KEY, serializeProfiles(next));
  },
  // The active profile's instance.
  server: () => activeProfile(state())?.server ?? null,

  // A random id per installation; the instance keeps one entry per id.
  installationId() {
    let value = read(KEYS.installation);
    if (!value) {
      value = randomUUID();
      write(KEYS.installation, value);
    }
    return value;
  },

  deviceToken() {
    const key = activeKey("deviceToken");
    return key ? read(key) : null;
  },
  setDeviceToken(token: string | null) {
    const key = activeKey("deviceToken");
    if (key) write(key, token);
  },

  summary(): Summary | null {
    const key = activeKey("summary");
    try {
      return JSON.parse((key && read(key)) || "null");
    } catch {
      return null;
    }
  },
  setSummary(summary: Summary | null) {
    const key = activeKey("summary");
    if (key) write(key, summary ? JSON.stringify(summary) : null);
  },

  appLock: () => read(KEYS.appLock) === "1",
  setAppLock: (on: boolean) => write(KEYS.appLock, on ? "1" : null),

  pushAsked: () => read(KEYS.pushAsked) === "1",
  setPushAsked: () => write(KEYS.pushAsked, "1"),

  // Leaving an instance (another profile, signing out, removing it): nothing
  // of it stays on the phone.
  forgetInstance(id: string | null = state().active) {
    if (!id) return;
    for (const key of PROFILE_KEYS) write(profileKey(id, key), null);
  },
};
