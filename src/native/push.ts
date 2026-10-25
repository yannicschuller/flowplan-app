// Push through the Flowplan push relay (src/push-relay.ts): what the app
// hands the instance when it registers (App.tsx → register), and what goes
// when it leaves an instance.
//
// For the active profile, when push is allowed and the instance publishes
// /.well-known/flowplan-push (version 1):
//   1. the profile's X25519 key pair (modules/flowplan-push; the private key
//      stays in the keychain / Keystore);
//   2. the raw device token (APNs / FCM, expo-notifications) registered with
//      the relay for this instance → relay token – again after 30 days, for
//      a new device token, key or environment;
//   3. relay token, relay and public key go to the instance with the
//      registration – never the Expo push token as well.
// Instances without the relay get the Expo push token as before, but only
// in builds with an Expo project (EXPO_PROJECT_ID).
// Leaving (signing out, another profile, removing it): the relay tokens are
// deleted at the relay, the key on the phone; the instance's entry goes
// with /api/mobile/unregister (sync.ts → leaveInstance).
//
// Nothing here logs a token or a key.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Notifications from "expo-notifications";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { apsEnvironment, deleteDeviceKey, devicePublicKey, keepDeviceKeys, pushKeysAvailable } from "../../modules/flowplan-push/src";
import {
  DEFAULT_RELAY,
  instanceSupport,
  isDeviceToken,
  leaveRelay,
  registrationFields,
  relayOrigin,
  type Http,
  type HttpAnswer,
  type PushEnvironment,
  type PushFields,
  type RegistrationDeps,
} from "../push-relay";
import { activeProfile, type Profile } from "../profiles";
import { liveActivityLabels } from "../activities";
import { locale } from "../i18n";
import { store } from "../store";
import { expoPushToken, pushPermission } from "./notifications";

const extra = Constants.expoConfig?.extra as { pushRelay?: string; apsEnvironment?: string } | undefined;
// The relay of this build (app.config.ts, PUSH_RELAY_URL).
export const RELAY = relayOrigin(extra?.pushRelay) ?? DEFAULT_RELAY;

export const http: Http = (url, init) => fetch(url, init) as unknown as Promise<HttpAnswer>;

// The texts of the Live Activity views for the instance's pushes, in the
// app's language and the phone's time zone.
const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
export const liveLabels = () => liveActivityLabels(locale(), zone());

export const sha256 = (value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value);

export const bundleId = () => Application.applicationId ?? "app.flowplan.mobile";

// iOS: the APNs environment of the build's provisioning profile (debug
// builds: sandbox); none means App Store or TestFlight: production.
export function pushEnvironment(): PushEnvironment {
  const signed = apsEnvironment();
  if (signed === "development") return "sandbox";
  if (signed === "production") return "production";
  return extra?.apsEnvironment === "development" ? "sandbox" : "production";
}

// The raw APNs / FCM token, when push is allowed; null without (Android
// without google-services.json, simulators, no network).
export async function devicePushToken(): Promise<{ platform: "ios" | "android"; token: string } | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  if ((await pushPermission()) !== "granted") return null;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    const platform = Platform.OS;
    return typeof token.data === "string" && isDeviceToken(platform, token.data) ? { platform, token: token.data } : null;
  } catch {
    return null;
  }
}

// Whether an instance sends through the relay, asked at most once an hour.
const support = new Map<string, { value: "yes" | "no"; at: number }>();
async function supportOf(origin: string) {
  const known = support.get(origin);
  if (known && Date.now() - known.at < 60 * 60 * 1000) return known.value;
  const value = await instanceSupport(origin, http);
  if (value !== "unknown") support.set(origin, { value, at: Date.now() });
  return value;
}

// The instance answered that it sends through another relay, or signs as
// another origin (push-relay.ts → relayMismatch): for the next hour it is
// treated as an instance without the relay (Expo token, if any).
export function relayRefusedBy(origin: string) {
  support.set(origin, { value: "no", at: Date.now() });
}

// The phone's side of the registration (push-relay.ts → registrationFields).
const deps: RegistrationDeps = {
  relay: RELAY,
  bundleId: bundleId(),
  http,
  now: () => Date.now(),
  permission: async () => (await pushPermission()) === "granted",
  support: supportOf,
  keysAvailable: pushKeysAvailable,
  publicKey: devicePublicKey,
  deviceToken: devicePushToken,
  environment: pushEnvironment,
  sha256,
  expoToken: expoPushToken,
  record: (id) => store.pushRecord(id),
  setRecord: (id, record) => store.setPushRecord(id, record),
  live: (id) => store.liveRecords(id),
  setLive: (id, records) => store.setLiveRecords(id, records),
  deleteKey: (id) => void deleteDeviceKey(id),
  isActive: (id) => store.profiles().active === id,
  liveLabels,
};

// What the registration with the instance gets (lib/mobile-devices.ts in
// Flowplan) for the active profile.
export const pushFields = (profile: Profile, options: { create: boolean }): Promise<PushFields & { pending: boolean }> =>
  registrationFields(profile, options, deps);

// Leaves the relay for a profile (signing out, another profile, removing it).
export const leavePush = (profileId: string) => leaveRelay(profileId, deps);

// At start: keys of profiles that are no longer active (left while the app
// was killed, removed) go.
export function cleanUpPushKeys() {
  const active = store.profiles().active;
  keepDeviceKeys(active ? [active] : []);
}

// A new APNs / FCM token (Android refreshes them now and then): the
// registration is renewed when it differs from the registered one.
export function onDeviceTokenChanged(listener: () => void) {
  return Notifications.addPushTokenListener((token) => {
    if (typeof token.data !== "string") return;
    const profile = activeProfile(store.profiles());
    const record = profile ? store.pushRecord(profile.id) : null;
    if (!record) return;
    void sha256(token.data).then((hash) => {
      if (hash !== record.tokenHash) listener();
    });
  });
}
