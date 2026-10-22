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

// Apple Pencil double-tap or squeeze, with the action set in the iPad's
// settings (lib/stylus.ts in Flowplan).
export type PencilAction = {
  gesture: "tap" | "squeeze";
  preferred: "switchEraser" | "switchPrevious" | "showColorPalette" | "showInkAttributes" | "showContextualPalette" | "ignore";
};

type NativeModule = {
  getManagedServer(): string | null;
  consumeSharedText(): SharedText | null;
  showTimer(options: TimerOptions): void;
  hideTimer(): void;
  startPencil(): void;
  setEdgeSwipe?(enabled: boolean): void;
  addListener(event: "onShare", listener: (share: SharedText) => void): EventSubscription;
  addListener(event: "onPencil", listener: (action: PencilAction) => void): EventSubscription;
  addListener(event: "onEdgeSwipe", listener: () => void): EventSubscription;
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

// iPad: Apple Pencil double-tap and squeeze.
export function addPencilListener(listener: (action: PencilAction) => void) {
  if (Platform.OS !== "ios" || !native) return { remove() {} };
  const subscription = native.addListener("onPencil", listener);
  native.startPencil();
  return subscription;
}

// iOS: the swipe from the left edge for "back" (Shell.tsx asks the page).
// On while the window on the instance is in front and back does something.
export function setEdgeSwipe(enabled: boolean) {
  if (Platform.OS !== "ios") return;
  try {
    native?.setEdgeSwipe?.(enabled);
  } catch {}
}
export function addEdgeSwipeListener(listener: () => void) {
  if (Platform.OS !== "ios" || !native) return { remove() {} };
  return native.addListener("onEdgeSwipe", listener);
}
