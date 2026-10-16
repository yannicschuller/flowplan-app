// Native pieces of the Flowplan app that no Expo module covers (Swift in
// ios/, Kotlin in android/).
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

export type SharedText = { subject: string; text: string };
export type TimerOptions = {
  title: string;
  text: string;
  label: string;
  start: number;
  url: string;
  channelId: string;
  channelName: string;
  channelDescription: string;
};

type NativeModule = {
  getManagedServer(): string | null;
  consumeSharedText(): SharedText | null;
  showTimer(options: TimerOptions): void;
  hideTimer(): void;
  addListener(event: "onShare", listener: (share: SharedText) => void): EventSubscription;
};

const native = requireOptionalNativeModule<NativeModule>("FlowplanNative");

// The address a managed installation suggests (MDM / EMM, key "server").
export function getManagedServer(): string | null {
  try {
    return native?.getManagedServer() ?? null;
  } catch {
    return null;
  }
}

// Android: text or a link shared from another app.
export function consumeSharedText(): SharedText | null {
  return Platform.OS === "android" ? (native?.consumeSharedText() ?? null) : null;
}
export function addShareListener(listener: (share: SharedText) => void) {
  return Platform.OS === "android" && native ? native.addListener("onShare", listener) : { remove() {} };
}

// Android: the running timer as an ongoing notification with a running clock.
export function showTimer(options: TimerOptions) {
  if (Platform.OS === "android") native?.showTimer(options);
}
export function hideTimer() {
  if (Platform.OS === "android") native?.hideTimer();
}
