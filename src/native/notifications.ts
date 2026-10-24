// Push notifications: the app asks once after the first sign-in, registers
// with the instance (App.tsx → register; through the push relay, push.ts,
// or – for older instances – with an Expo push token) and opens the right
// page when a notification is tapped. expo-notifications shows them,
// keeps the permission, the categories and their buttons, the badge and
// the app's own reminders.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { t } from "../i18n";
import { safePath } from "../navigation";
import { isButton } from "../notification-buttons";
import { store } from "../store";

export function setUpNotifications() {
  // In the app, a new notification shows as banner without a sound: the
  // instance's inbox is right there.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
  // At every start, so that the channel's name and description follow the
  // app's language (Android keeps them as last created; the timer channel in
  // the native module does the same).
  if (Platform.OS === "android")
    void Notifications.setNotificationChannelAsync("inbox", {
      name: t("channelInbox"),
      description: t("channelInboxText"),
      importance: Notifications.AndroidImportance.HIGH,
      showBadge: true,
    }).catch(() => {});
}

export type PushState = "granted" | "denied" | "undetermined";

export async function pushPermission(): Promise<PushState> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as PushState;
  } catch {
    return "denied";
  }
}

export async function askForPush(): Promise<PushState> {
  try {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return status as PushState;
  } catch {
    return "denied";
  }
}

// The Expo push token – only for instances without the push relay – when
// push is allowed and the build knows its Expo project (EXPO_PROJECT_ID,
// README → Push notifications); otherwise null.
let warnedAboutProject = false;
export async function expoPushToken(): Promise<string | null> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) {
    // A build without EXPO_PROJECT_ID: instances with the relay still push.
    if (__DEV__ && !warnedAboutProject) {
      warnedAboutProject = true;
      console.warn("Flowplan: no Expo project in this build (EXPO_PROJECT_ID) – instances without the push relay cannot push.");
    }
    return null;
  }
  if ((await pushPermission()) !== "granted") return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    // Android without Firebase configuration, simulators, no network.
    return null;
  }
}

// The path a notification wants to open (data.url, e.g. "/#page=…"); none
// for its buttons, which do their work without opening anything
// (notification-actions.ts), and none for a notification of another
// instance than the active profile's (data.origin, push relay).
export function notificationPath(response: Notifications.NotificationResponse | null, server: string | null = store.server()): string | null {
  if (isButton(response?.actionIdentifier)) return null;
  const data = response?.notification.request.content.data as { url?: unknown; origin?: unknown } | undefined;
  if (data?.origin !== undefined && data.origin !== server) return null;
  return typeof data?.url === "string" ? safePath(data.url) : null;
}

export function onNotificationOpened(listener: (path: string) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const path = notificationPath(response);
    if (path) listener(path);
  });
  // The notification that started the app.
  const initial = notificationPath(Notifications.getLastNotificationResponse());
  if (initial) {
    listener(initial);
    Notifications.clearLastNotificationResponse();
  }
  return subscription;
}

export function onNotificationReceived(listener: () => void) {
  return Notifications.addNotificationReceivedListener(() => listener());
}
