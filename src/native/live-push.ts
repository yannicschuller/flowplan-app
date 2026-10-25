// Live Activities through the push relay (iOS): the timer's and focus'
// activities – those whose state the instance changes and pushes itself –
// get a push token from ActivityKit (expo-widgets, pushType token). The app
// registers it with the relay as platform "ios-liveactivity" for the active
// profile's instance – only when that instance already sends through the
// relay (push.ts) – and hands the relay token to the instance at once
// (POST /api/mobile/live-activity with the device token) and with every
// registration (liveActivityRelayTokens). When the activity ends, its relay
// token is deleted at the relay and the instance.
//
// What the instance sends to a Live Activity is the activity's state as
// ActivityKit shows it (expo-widgets' ContentState { name, props }), which
// the system renders itself – it cannot be end-to-end encrypted (PROTOCOL.md
// §3). The app keeps updating them itself as before (polling while in front,
// the background task).
import { Platform } from "react-native";
import { allowLiveRegistration, isDeviceToken, isLiveKind, registerWithRelay, sendLiveToken, unregisterFromRelay, type LiveKind } from "../push-relay";
import { activeProfile } from "../profiles";
import { store } from "../store";
import { bundleId, http, liveLabels, sha256 } from "./push";

export type PushTokenActivity = {
  addPushTokenListener?: (listener: (event: { activityId: string; pushToken: string }) => void) => { remove(): void };
  getPushToken?: () => Promise<string | null>;
};

const watching = new Map<LiveKind, { remove(): void }>();
let history: number[] = [];
let listener: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

// App.tsx registers again with the instance when it has no endpoint for a
// single token (a few seconds later, once for several).
export function onLiveTokensChanged(next: (() => void) | null) {
  listener = next;
}
function registerAgain() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => listener?.(), 3000);
}
async function tellInstance(instance: string, kind: LiveKind, relayToken: string | null, relay: string) {
  const deviceToken = store.deviceToken();
  if (!deviceToken || store.server() !== instance) return;
  if ((await sendLiveToken(instance, deviceToken, { kind, relayToken, relayUrl: relay, ...(relayToken ? { labels: liveLabels() } : {}) }, http)) === "missing") registerAgain();
}

// A started or running activity of this kind: its token, now and whenever
// it changes.
export function watchLiveActivity(kind: string, activity: PushTokenActivity | null | undefined) {
  if (Platform.OS !== "ios" || !isLiveKind(kind) || !activity || watching.has(kind)) return;
  try {
    const subscription = activity.addPushTokenListener?.((event) => void liveToken(kind, event?.pushToken));
    watching.set(kind, subscription ?? { remove() {} });
    void activity
      .getPushToken?.()
      .then((token) => {
        if (token) void liveToken(kind, token);
      })
      .catch(() => {});
  } catch {}
}

async function liveToken(kind: LiveKind, token: unknown) {
  const profile = activeProfile(store.profiles());
  if (!profile || !isDeviceToken("ios-liveactivity", token)) return;
  // Only where the instance sends through the relay.
  const record = store.pushRecord(profile.id);
  if (!record || record.platform !== "ios" || record.instance !== profile.server) return;
  const tokenHash = await sha256(token);
  const existing = store.liveRecords(profile.id)[kind];
  if (existing && existing.tokenHash === tokenHash && existing.relay === record.relay && existing.instance === profile.server) return;
  const now = Date.now();
  if (!allowLiveRegistration(history, now)) return;
  history = [...history.filter((at) => now - at < 60 * 60 * 1000), now];
  try {
    const registration = await registerWithRelay(
      record.relay,
      { platform: "ios-liveactivity", token, environment: record.environment ?? "production", bundleId: bundleId(), instance: profile.server },
      http,
    );
    if (store.profiles().active !== profile.id || !watching.has(kind)) {
      // Left or ended meanwhile.
      void unregisterFromRelay(record.relay, registration.relayToken, http);
      return;
    }
    if (existing) void unregisterFromRelay(existing.relay, existing.relayToken, http);
    store.setLiveRecords(profile.id, {
      ...store.liveRecords(profile.id),
      [kind]: { relayToken: registration.relayToken, tokenHash, relay: record.relay, instance: profile.server, registeredAt: now },
    });
    await tellInstance(profile.server, kind, registration.relayToken, record.relay);
  } catch {}
}

// The activity of this kind ended: its relay token goes.
export function endLiveActivity(kind: string) {
  if (!isLiveKind(kind)) return;
  watching.get(kind)?.remove();
  watching.delete(kind);
  const profile = activeProfile(store.profiles());
  if (!profile) return;
  const records = store.liveRecords(profile.id);
  const entry = records[kind];
  if (!entry) return;
  delete records[kind];
  store.setLiveRecords(profile.id, records);
  void unregisterFromRelay(entry.relay, entry.relayToken, http);
  void tellInstance(profile.server, kind, null, entry.relay);
}

// Signed out or another profile (push.ts → leavePush deletes the tokens).
export function stopWatchingLiveActivities() {
  for (const subscription of watching.values()) subscription.remove();
  watching.clear();
}
