// iOS 26: the widgets are reloaded by a push when something they show changes
// (WidgetKit push, README → Widgets). WidgetKit hands the app one token for
// all its widgets (WidgetCenter.currentPushInfo; the extension's push
// handler also keeps it in the App Group, modules/flowplan-native). Every
// signed-in profile whose instance sends through the relay registers it
// there as "ios-widgets" – also profiles that are not active, whose widgets
// are on the screen too – and hands the relay token to its instance with its
// own device token (POST /api/mobile/widget-push). The push has no content;
// the widgets ask their instances themselves, as on every reload.
//
// Older instances (no endpoint: 404) and phones before iOS 26 keep the
// timeline refreshes; nothing else changes for them. Nothing here logs a
// token.
import { Platform } from "react-native";
import { widgetPushToken } from "../../modules/flowplan-native/src";
import {
  isDeviceToken,
  needsWidgetRegistration,
  registerWithRelay,
  sendWidgetPushToken,
  unregisterFromRelay,
  type WidgetPushRecord,
} from "../push-relay";
import { store } from "../store";
import { bundleId, http, pushEnvironment, RELAY, sha256, supportOf } from "./push";

// Instances without the endpoint, asked again after a day.
const missing = new Map<string, number>();
let running: Promise<void> | null = null;

export function syncWidgetPush(): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  running ??= sync().finally(() => {
    running = null;
  });
  return running;
}

async function sync() {
  const token = await widgetPushToken();
  if (!token || !isDeviceToken("ios-widgets", token)) return;
  const tokenHash = await sha256(token);
  const environment = pushEnvironment();
  const now = Date.now();
  for (const profile of store.profiles().profiles) {
    const deviceToken = store.deviceTokenOf(profile.id);
    const record = store.widgetPushRecord(profile.id);
    if (!deviceToken) continue;
    if (!needsWidgetRegistration(record, { relay: RELAY, instance: profile.server, tokenHash, environment }, now)) continue;
    if ((missing.get(profile.server) ?? 0) > now - 86_400_000) continue;
    if ((await supportOf(profile.server)) !== "yes") continue;
    let relayToken: string;
    let expiresAt: string;
    try {
      ({ relayToken, expiresAt } = await registerWithRelay(RELAY, { platform: "ios-widgets", token, environment, bundleId: bundleId(), instance: profile.server }, http, now));
    } catch {
      // An older relay without "ios-widgets", or not reachable: next time.
      continue;
    }
    const sent = await sendWidgetPushToken(profile.server, deviceToken, { relayToken, relayUrl: RELAY }, http);
    // Signed out or removed meanwhile, or the instance cannot use it.
    if (sent !== "ok" || store.deviceTokenOf(profile.id) !== deviceToken || !store.profiles().profiles.some((p) => p.id === profile.id)) {
      void unregisterFromRelay(RELAY, relayToken, http);
      if (sent === "missing") missing.set(profile.server, now);
      if (sent === "signedOut") store.setWidgetPushRecord(profile.id, null);
      continue;
    }
    if (record) void unregisterFromRelay(record.relay, record.relayToken, http);
    const next: WidgetPushRecord = { v: 1, relay: RELAY, instance: profile.server, environment, tokenHash, relayToken, expiresAt, registeredAt: now };
    store.setWidgetPushRecord(profile.id, next);
  }
}

// A profile signed out or removed: its widget push registration goes at the
// relay (the instance's entry goes with the device's).
export function leaveWidgetPush(profileId: string) {
  const record = store.widgetPushRecord(profileId);
  store.setWidgetPushRecord(profileId, null);
  if (record) void unregisterFromRelay(record.relay, record.relayToken, http);
}
