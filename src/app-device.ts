// This device's key for an instance (#133 in Flowplan, lib/app-devices.ts):
// the instance gives the app's long sign-in to a password sign-in only when
// the app proves it is the app – the user agent alone, which any browser can
// send, no longer counts. On the first launch of a profile the app makes a
// random id and secret, keeps them in the keychain / Keystore (store.ts) and
// puts them into the instance's page only (bridge-script.ts:
// window.FlowplanApp.deviceKey). The sign-in form sends them with the
// password; the instance registers the key at the first sign-in of an
// account on this device and wants the same secret afterwards.
//
// One key per profile, kept apart from PROFILE_KEYS (those go on every
// switch): it goes only with the profile. Pure functions – store.ts hands
// in the keychain and the random bytes, the tests a Map.
import { base64Url } from "./sign-in";
import { profileKey } from "./profiles";

export type AppDeviceKey = { id: string; secret: string };

const ID = /^[A-Za-z0-9_-]{16,64}$/;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;

// The keychain entry of a profile's key (the profile id is checked there).
export function appDeviceEntry(profileId: string) {
  profileKey(profileId, "deviceToken");
  return `flowplan.profile.${profileId}.appDevice`;
}

export function parseAppDevice(raw: string | null): AppDeviceKey | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AppDeviceKey> | null;
    return value && typeof value.id === "string" && typeof value.secret === "string" && ID.test(value.id) && SECRET.test(value.secret)
      ? { id: value.id, secret: value.secret }
      : null;
  } catch {
    return null;
  }
}

// 16 random bytes for the id, 32 for the secret, base64url.
export function newAppDevice(random: (bytes: number) => Uint8Array): AppDeviceKey {
  const key = { id: base64Url(random(16)), secret: base64Url(random(32)) };
  if (!ID.test(key.id) || !SECRET.test(key.secret)) throw new Error("no randomness");
  return key;
}

// The profile's key, made and kept on first use. null when the keychain
// does not keep it (the sign-in then lasts like a browser's – better than a
// key that changes with every launch).
export function appDeviceFor(
  profileId: string,
  keychain: { read: (key: string) => string | null; write: (key: string, value: string | null) => void },
  random: (bytes: number) => Uint8Array,
): AppDeviceKey | null {
  let entry: string;
  try {
    entry = appDeviceEntry(profileId);
  } catch {
    return null;
  }
  const stored = parseAppDevice(keychain.read(entry));
  if (stored) return stored;
  let key: AppDeviceKey;
  try {
    key = newAppDevice(random);
  } catch {
    return null;
  }
  keychain.write(entry, JSON.stringify(key));
  return parseAppDevice(keychain.read(entry))?.secret === key.secret ? key : null;
}
