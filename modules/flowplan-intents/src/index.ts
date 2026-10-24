// Siri, Shortcuts and Focus filters (iOS, Swift in ios/): what the App
// Intents of the app share with the JavaScript side. Android has none of it.
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

type NativeModule = {
  setProfiles(json: string): void;
  focusFilter(): string | null;
  addListener(event: "onFocusFilter", listener: () => void): EventSubscription;
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("FlowplanIntents") : null;

// The profiles the Focus filter offers (id, name, address, the active one).
export function setIntentProfiles(json: string) {
  try {
    native?.setProfiles(json);
  } catch {}
}

// The Focus filter now, as JSON text (plugins/intents/app/FlowplanFocusFilter.swift).
export function focusFilterText(): string | null {
  try {
    return native?.focusFilter() ?? null;
  } catch {
    return null;
  }
}

export function addFocusFilterListener(listener: () => void) {
  return native ? native.addListener("onFocusFilter", listener) : { remove() {} };
}
