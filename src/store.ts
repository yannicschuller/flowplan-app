// What the app remembers: the instance, this installation's id, the device
// token for widgets (lib/mobile-devices.ts in Flowplan), the last summary and
// the app lock. In the keychain / Keystore, readable after the first unlock so
// that background refreshes work while the phone is locked.
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import type { Summary } from "./summary";

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const KEYS = {
  server: "flowplan.server",
  installation: "flowplan.installation",
  deviceToken: "flowplan.deviceToken",
  summary: "flowplan.summary",
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

export const store = {
  server: () => read(KEYS.server),
  setServer: (server: string | null) => write(KEYS.server, server),

  // A random id per installation; the instance keeps one entry per id.
  installationId() {
    let value = read(KEYS.installation);
    if (!value) {
      value = randomUUID();
      write(KEYS.installation, value);
    }
    return value;
  },

  deviceToken: () => read(KEYS.deviceToken),
  setDeviceToken: (token: string | null) => write(KEYS.deviceToken, token),

  summary(): Summary | null {
    try {
      return JSON.parse(read(KEYS.summary) || "null");
    } catch {
      return null;
    }
  },
  setSummary: (summary: Summary | null) => write(KEYS.summary, summary ? JSON.stringify(summary) : null),

  appLock: () => read(KEYS.appLock) === "1",
  setAppLock: (on: boolean) => write(KEYS.appLock, on ? "1" : null),

  pushAsked: () => read(KEYS.pushAsked) === "1",
  setPushAsked: () => write(KEYS.pushAsked, "1"),

  // Signing out of the instance or changing it: nothing of it stays.
  forgetInstance() {
    write(KEYS.deviceToken, null);
    write(KEYS.summary, null);
  },
};
