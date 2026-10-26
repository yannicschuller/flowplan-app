// Android pieces of the Flowplan app (Kotlin in android/): "Share" from other
// apps, the app shortcuts on the launcher icon, the Material You palette for
// the widgets, the "Quick capture" Quick Settings tile and the progress of the
// predictive back gesture. Everything is a no-op elsewhere.
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

// A photo or PDF from the share, copied into the app's cache (file://).
export type SharedFile = { uri: string; name: string; type: string; size: number };
// What came with "Share": text and/or a link, files; `skipped` names what was
// not taken (other types, too large, more than 10).
export type SharedContent = { subject: string; text: string; files: SharedFile[]; skipped: string[] };
export type ShortcutIcon = "page" | "database" | "inbox" | "tasks" | "search" | "voice" | "profile" | "note" | "capture";
export type Shortcut = { id: string; label: string; longLabel: string; url: string; icon: ShortcutIcon };
// The system palette's tones (Android 12+), e.g. "accent1_600": "#4A5BBF".
export type MaterialPalette = Record<string, string>;

type NativeModule = {
  takeShare(): Promise<SharedContent | null>;
  clearShare(): void;
  leave(): void;
  setShortcuts(items: Shortcut[], profile: string | null): boolean;
  reportShortcutUsed(id: string): void;
  materialColors(): MaterialPalette | null;
  canAddTile(): boolean;
  requestAddTile(label: string): boolean;
  setPredictiveBack?(enabled: boolean): boolean;
  addListener(event: "onShare", listener: () => void): EventSubscription;
  addListener(event: "onBackProgress", listener: (event: unknown) => void): EventSubscription;
};

const native = Platform.OS === "android" ? requireOptionalNativeModule<NativeModule>("FlowplanAndroid") : null;
const quiet = <T>(run: () => T, fallback: T): T => {
  try {
    return run();
  } catch {
    return fallback;
  }
};

// The share that opened the app or arrived since; null when there is none.
export async function takeShare(): Promise<SharedContent | null> {
  if (!native) return null;
  try {
    return await native.takeShare();
  } catch {
    return null;
  }
}
// A new share while the app runs: take it with takeShare().
export function addShareListener(listener: () => void) {
  return native ? native.addListener("onShare", listener) : { remove() {} };
}
// The copies of the last share are no longer needed.
export const clearShare = () => quiet(() => native?.clearShare(), undefined);
// Back to the app that shared.
export const leaveApp = () => quiet(() => native?.leave(), undefined);

export const setShortcuts = (items: Shortcut[], profile: string | null) => quiet(() => native?.setShortcuts(items, profile) ?? false, false);
export const reportShortcutUsed = (id: string) => quiet(() => native?.reportShortcutUsed(id), undefined);

export const materialColors = (): MaterialPalette | null => quiet(() => native?.materialColors() ?? null, null);

export const canAddTile = () => quiet(() => native?.canAddTile() ?? false, false);
export const requestAddTile = (label: string) => quiet(() => native?.requestAddTile(label) ?? false, false);

// The predictive back gesture (Android 14+; the back button on older ones):
// while on, back is the app's and its progress arrives as events – phase
// "start", "progress" (0–1), then "cancel" or "commit" (the back itself),
// with the edge the swipe began at. src/back.ts parseBackProgress checks them.
export const setPredictiveBack = (enabled: boolean) => quiet(() => native?.setPredictiveBack?.(enabled) ?? false, false);
export function addBackProgressListener(listener: (event: unknown) => void) {
  return native ? native.addListener("onBackProgress", listener) : { remove() {} };
}
