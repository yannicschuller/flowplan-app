// What the app remembers: the profiles (instances, profiles.ts), this
// installation's id, per profile the device token for widgets
// (lib/mobile-devices.ts in Flowplan) and the last summary, and the app lock.
// In the keychain / Keystore, readable after the first unlock so that
// background refreshes work while the phone is locked.
import * as SecureStore from "expo-secure-store";
import { getRandomBytes, randomUUID } from "expo-crypto";
import {
  activeProfile,
  LASTING_KEYS,
  lastingKey,
  loadProfiles,
  PROFILE_KEYS,
  PROFILES_KEY,
  parseSignedIn,
  profileKey,
  serializeProfiles,
  SIGNED_IN_KEY,
  withSignedIn,
  type ProfileKey,
  type ProfileState,
} from "./profiles";
import type { Summary } from "./summary";
import { parseAdminState, type AdminState } from "./admin";
import { parseLiveRecords, parseRecord, type LiveRecords, type PushRecord } from "./push-relay";
import { appDeviceEntry, appDeviceFor, type AppDeviceKey } from "./app-device";
import { parseMotion, type Motion } from "./motion";
import { parseCopyInfo, type CopyInfo } from "./offline-offer";

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const KEYS = {
  installation: "flowplan.installation",
  appLock: "flowplan.appLock",
  pushAsked: "flowplan.pushAsked",
  updateCheck: "flowplan.updateCheck",
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

  // What the administrators' widgets show (admin.ts).
  adminState(): AdminState {
    const key = activeKey("adminSummary");
    return key ? parseAdminState(read(key)) : null;
  },
  setAdminState(state: AdminState) {
    const key = activeKey("adminSummary");
    if (key) write(key, state ? JSON.stringify(state) : null);
  },

  appLock: () => read(KEYS.appLock) === "1",
  setAppLock: (on: boolean) => write(KEYS.appLock, on ? "1" : null),

  pushAsked: () => read(KEYS.pushAsked) === "1",
  setPushAsked: () => write(KEYS.pushAsked, "1"),

  // Android outside the stores: when the app last looked for an update and
  // the version the person said "later" to (src/android-update.ts).
  updateCheck: () => read(KEYS.updateCheck),
  setUpdateCheck: (value: string) => write(KEYS.updateCheck, value),

  // A profile's registration with the push relay (by id: also read while
  // leaving it). The device token itself is not kept, only its hash.
  pushRecord: (id: string): PushRecord | null => parseRecord(read(profileKey(id, "push"))),
  setPushRecord: (id: string, record: PushRecord | null) => write(profileKey(id, "push"), record ? JSON.stringify(record) : null),
  liveRecords: (id: string): LiveRecords => parseLiveRecords(read(profileKey(id, "livePush"))),
  setLiveRecords: (id: string, records: LiveRecords) => write(profileKey(id, "livePush"), Object.keys(records).length ? JSON.stringify(records) : null),

  // Whether a profile has been signed in on this phone at least once (#69:
  // one that never was can get another address from the profile screen).
  everSignedIn: (id: string) => parseSignedIn(read(SIGNED_IN_KEY)).includes(id),
  setEverSignedIn(id: string, signedIn: boolean) {
    const list = parseSignedIn(read(SIGNED_IN_KEY));
    const next = withSignedIn(list, id, signedIn);
    if (next.join() !== list.join()) write(SIGNED_IN_KEY, next.length ? JSON.stringify(next) : null);
  },

  // A profile's device key for its instance's page (app-device.ts), made
  // on its first launch.
  appDevice: (id: string): AppDeviceKey | null => appDeviceFor(id, { read, write }, getRandomBytes),
  // A profile that is gone takes its key along.
  forgetAppDevice(id: string) {
    try {
      write(appDeviceEntry(id), null);
    } catch {}
  },

  // The person's "Animations" in Flowplan as the profile's page last
  // reported it (motion.ts); null until it did.
  motion: (id: string): Motion | null => parseMotion(read(lastingKey(id, "motion"))),
  setMotion: (id: string, motion: Motion) => write(lastingKey(id, "motion"), motion),
  // Whether offline use was offered on this profile (offline-offer.ts):
  // asked once, whatever the answer.
  offlineOffered: (id: string) => read(lastingKey(id, "offlineOffer")) === "1",
  setOfflineOffered: (id: string) => write(lastingKey(id, "offlineOffer"), "1"),
  // Android: what the page last reported of its copy (the service worker's).
  offlineInfo: (id: string): CopyInfo | null => parseCopyInfo(read(lastingKey(id, "offlineInfo"))),
  setOfflineInfo: (id: string, info: CopyInfo) => write(lastingKey(id, "offlineInfo"), JSON.stringify(info)),
  // A profile that is gone: what was kept across switches goes too.
  forgetLasting(id: string) {
    try {
      for (const key of LASTING_KEYS) write(lastingKey(id, key), null);
    } catch {}
  },

  // Leaving an instance (another profile, signing out, removing it): nothing
  // of it stays on the phone.
  forgetInstance(id: string | null = state().active) {
    if (!id) return;
    for (const key of PROFILE_KEYS) write(profileKey(id, key), null);
  },
};
