// The buttons on Flowplan's push notifications are answered in Swift on iOS
// (ios/NotificationActions.swift); the app hands over what they need. Android
// answers them in JavaScript (src/native/notification-actions.ts).
import { requireOptionalNativeModule } from "expo";

type NativeModule = {
  setSession(session: { server: string; token: string; lang: string } | null): boolean;
  setTexts(texts: { failedTitle: string; failedBody: string }): void;
};

const native = requireOptionalNativeModule<NativeModule>("FlowplanNotify");

export const hasNativeActions = () => !!native;

// Instance, device token and language (null: signed out).
export function setActionSession(session: { server: string; token: string; lang: string } | null) {
  try {
    return native?.setSession(session) ?? false;
  } catch {
    return false;
  }
}

export function setActionTexts(texts: { failedTitle: string; failedBody: string }) {
  try {
    native?.setTexts(texts);
  } catch {}
}
