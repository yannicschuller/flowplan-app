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

// The configurable widgets' session (iOS: the widget extension reads it
// from the App Group's keychain). token null: signed out.
export type WidgetSession = { server: string; token: string | null; profile: string; lang: string };

// An ongoing notification (Android): Android's counterpart of a Live
// Activity – focus, meeting, import/export, voice memo, incident.
export type OngoingOptions = {
  id: string;
  channelId: string;
  channelName: string;
  channelDescription: string;
  title: string;
  text: string;
  label: string;
  url: string;
  // A running clock: up from `start`, or down to `end` (ms).
  start?: number;
  end?: number;
  // 0–100, or -1 for indeterminate; left out without a bar.
  progress?: number;
  // Buttons that open the app with a link.
  actions?: { label: string; url: string }[];
};

type NativeModule = {
  getManagedServer(): string | null;
  setWidgetSession?(session: WidgetSession | null): void;
  reloadWidgets?(): void;
  consumePendingLink?(): string | null;
  donateShortcut?(name: string): void;
  showOngoing?(options: OngoingOptions): void;
  hideOngoing?(id: string): void;
  consumeSharedText(): SharedText | null;
  showTimer(options: TimerOptions): void;
  hideTimer(): void;
  startPencil(): void;
  setEdgeSwipe?(enabled: boolean): void;
  addListener(event: "onShare", listener: (share: SharedText) => void): EventSubscription;
  addListener(event: "onPencil", listener: (action: PencilAction) => void): EventSubscription;
  addListener(event: "onEdgeSwipe", listener: () => void): EventSubscription;
  addListener(event: "onAppLink", listener: (event: { url: string }) => void): EventSubscription;
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

// iOS: the session of the configurable widgets; their settings stay when it
// is cleared (signed out), their answers go.
export function setWidgetSession(session: WidgetSession | null) {
  if (Platform.OS !== "ios") return;
  try {
    native?.setWidgetSession?.(session);
  } catch {}
}
export function reloadWidgets() {
  if (Platform.OS !== "ios") return;
  try {
    native?.reloadWidgets?.();
  } catch {}
}

// iOS: links from App Shortcuts and Siri that opened the app.
export function consumePendingLink(): string | null {
  if (Platform.OS !== "ios") return null;
  try {
    return native?.consumePendingLink?.() ?? null;
  } catch {
    return null;
  }
}
export function addAppLinkListener(listener: (url: string) => void) {
  if (Platform.OS !== "ios" || !native) return { remove() {} };
  return native.addListener("onAppLink", ({ url }) => listener(url));
}

// iOS: tells Siri what the person does, for suggestions.
export function donateShortcut(name: "note" | "voice" | "timer" | "focus" | "today") {
  if (Platform.OS !== "ios") return;
  try {
    native?.donateShortcut?.(name);
  } catch {}
}

// Android: ongoing notifications for focus, meetings, imports, voice memos
// and incidents.
export function showOngoing(options: OngoingOptions) {
  if (Platform.OS !== "android") return;
  try {
    native?.showOngoing?.(options);
  } catch {}
}
export function hideOngoing(id: string) {
  if (Platform.OS !== "android") return;
  try {
    native?.hideOngoing?.(id);
  } catch {}
}
