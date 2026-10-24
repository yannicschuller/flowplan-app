// The buttons on the instance's push notifications: "Done" and "Tomorrow" on
// a task that is due, "Reply" (with text) and "Mark as read" on comments and
// mentions (src/notification-buttons.ts). They work without opening the app:
//
// - iOS answers them in Swift (modules/flowplan-notify) – the system gives a
//   button a few seconds in the background, too few to load JavaScript. The
//   app hands over the session and the texts;
// - Android starts this JavaScript in the background for them
//   (expo-notifications' background task, defined at start-up in index.ts);
//   while the app is open the response listener answers instead.
//
// Both call POST /api/mobile/notifications with the device token; the
// notification goes, the badge follows, and what fails becomes a
// notification that opens the page.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { getLocales } from "expo-localization";
import { setActionSession, setActionTexts } from "../../modules/flowplan-notify/src";
import { locale, pickLocale, setLocale } from "../i18n";
import { tn } from "../i18n-notify";
import { buttonRequest, categoryButtons, type ButtonRequest } from "../notification-buttons";
import { timeoutSignal } from "../server";
import { store } from "../store";
import { localDay } from "../summary";

const TASK = "flowplan-notification-button";
// Android may report a button twice (background task and listener).
const answered = new Set<string>();

// Categories and their buttons in the app's language (again at every start:
// the system keeps them).
export async function setUpNotificationButtons() {
  const texts = {
    done: tn("actionDone"),
    tomorrow: tn("actionTomorrow"),
    reply: tn("actionReply"),
    send: tn("actionReplySend"),
    placeholder: tn("actionReplyPlaceholder"),
    read: tn("actionRead"),
  };
  setActionTexts({ failedTitle: tn("actionFailedTitle"), failedBody: tn("actionFailedBody") });
  await Promise.allSettled(categoryButtons(texts).map((category) => Notifications.setNotificationCategoryAsync(category.identifier, category.actions)));
}

// The session the iOS buttons act with: the active profile's instance and
// device token (null when signed out). Written only when it changed.
let lastSession = "";
export function syncButtonSession() {
  if (Platform.OS !== "ios") return;
  const server = store.server(),
    token = store.deviceToken();
  const session = server && token ? { server, token, lang: locale() } : null;
  const key = JSON.stringify(session);
  if (key === lastSession) return;
  if (setActionSession(session) || !session) lastSession = key;
}

async function ask(request: ButtonRequest) {
  const server = store.server(),
    token = store.deviceToken();
  if (!server || !token) return { ok: false as const, error: "" };
  try {
    const response = await fetch(`${server}/api/mobile/notifications?lang=${encodeURIComponent(locale())}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: timeoutSignal(20_000),
    });
    const body = (await response.json().catch(() => null)) as { unread?: unknown; error?: unknown } | null;
    if (response.ok) return { ok: true as const, unread: typeof body?.unread === "number" ? body.unread : null };
    return { ok: false as const, error: typeof body?.error === "string" ? body.error : "" };
  } catch {
    return { ok: false as const, error: "" };
  }
}

// Answers a tapped button (Android; on iOS Swift does).
export async function answerButton(response: Notifications.NotificationResponse) {
  if (Platform.OS === "ios") return;
  const request = buttonRequest(response, localDay());
  const identifier = response.notification.request.identifier;
  if (!request) return;
  const key = `${identifier}|${request.action}`;
  if (answered.has(key)) return;
  answered.add(key);
  const result = await ask(request);
  // The notification has been dealt with either way (Android keeps it,
  // with a spinner after a reply, until it is replaced or dismissed).
  await Notifications.dismissNotificationAsync(identifier).catch(() => {});
  if (result.ok) {
    if (result.unread !== null) await Notifications.setBadgeCountAsync(result.unread).catch(() => {});
    return;
  }
  const url = (response.notification.request.content.data as { url?: unknown } | undefined)?.url;
  await Notifications.scheduleNotificationAsync({
    content: { title: tn("actionFailedTitle"), body: result.error || tn("actionFailedBody"), data: typeof url === "string" ? { url } : {} },
    trigger: Platform.OS === "android" ? { channelId: "inbox" } : null,
  }).catch(() => {});
}

// Android: buttons tapped while the app is closed or in the background.
export function defineNotificationButtonTask() {
  if (Platform.OS !== "android") return;
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data }) => {
    if (!data || !("actionIdentifier" in data)) return;
    setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
    await answerButton(data as unknown as Notifications.NotificationResponse);
  });
  void Notifications.registerTaskAsync(TASK).catch(() => {});
}

// Android with the app open: the listener gets the buttons.
export function onNotificationButton() {
  return Notifications.addNotificationResponseReceivedListener((response) => void answerButton(response));
}
