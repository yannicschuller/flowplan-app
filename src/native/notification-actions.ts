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
//
// "Approve" on a workflow approval is the exception (docs/specs/workflows.md
// §11.8 in Flowplan): it opens the app on both platforms, which reads the
// confirmation secret – Face ID, Touch ID or the fingerprint – and sends it
// along (answerApproval). When that is not possible or the instance says
// no, the approval view opens and the person decides there. "Reject" works
// like the other buttons, from the lock screen (iOS: unlocked).
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { getLocales } from "expo-localization";
import { setActionSession, setActionTexts } from "../../modules/flowplan-notify/src";
import { locale, pickLocale, setLocale } from "../i18n";
import { tn } from "../i18n-notify";
import { approvalRequest, buttonRequest, categoryButtons, notificationData, opensApp, type ButtonRequest } from "../notification-buttons";
import { approvalOutcome, approveBody } from "../approval-key";
import { safePath } from "../navigation";
import { approvalVerifier, createApprovalKey, readApprovalSecret, registerAgain } from "./approvals";
import { timeoutSignal } from "../server";
import { store } from "../store";
import { localDay } from "../summary";
import { IDEMPOTENCY_HEADER, newIdempotencyKey } from "../idempotency";

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
    approve: tn("actionApprove"),
    reject: tn("actionReject"),
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

async function ask(request: ButtonRequest | ReturnType<typeof approveBody>) {
  const server = store.server(),
    token = store.deviceToken();
  if (!server || !token) return { ok: false as const, error: "", status: 0, body: null };
  // One Idempotency-Key per tap: the retry without an answer acts at most once.
  const idempotencyKey = newIdempotencyKey();
  for (let attempt = 0; ; attempt++)
    try {
      const response = await fetch(`${server}/api/mobile/notifications?lang=${encodeURIComponent(locale())}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", [IDEMPOTENCY_HEADER]: idempotencyKey },
        body: JSON.stringify(request),
        signal: timeoutSignal(20_000),
      });
      const body = (await response.json().catch(() => null)) as { unread?: unknown; error?: unknown; decision?: unknown } | null;
      if (response.ok) return { ok: true as const, unread: typeof body?.unread === "number" ? body.unread : null, status: response.status, body };
      return { ok: false as const, error: typeof body?.error === "string" ? body.error : "", status: response.status, body };
    } catch {
      if (attempt > 0) return { ok: false as const, error: "", status: 0, body: null };
    }
}

// Answers a tapped button (Android; on iOS Swift does).
export async function answerButton(response: Notifications.NotificationResponse) {
  if (Platform.OS === "ios") return;
  const request = buttonRequest(response, localDay());
  const identifier = response.notification.request.identifier;
  if (!request) return;
  // Through the push relay a notification names its instance: its id goes
  // to that instance only (the active profile's).
  const origin = notificationData(response).origin;
  const key = `${identifier}|${request.action}`;
  if (answered.has(key)) return;
  answered.add(key);
  const result = origin !== undefined && origin !== store.server() ? { ok: false as const, error: "" } : await ask(request);
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
    // "Approve" opens the app; the listener there answers it.
    if (opensApp((data as { actionIdentifier?: unknown }).actionIdentifier)) return;
    setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
    await answerButton(data as unknown as Notifications.NotificationResponse);
  });
  void Notifications.registerTaskAsync(TASK).catch(() => {});
}

// A notice in the app's own words (also a banner while the app is open);
// with `url` tapping it opens that page.
async function notice(title: string, body: string, url?: string | null) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: url ? { url } : {} },
    trigger: Platform.OS === "android" ? { channelId: "inbox" } : null,
  }).catch(() => {});
}

// "Approve" tapped (both platforms, the app now in front): the biometrics
// open the confirmation secret, the instance decides with it. Otherwise –
// no key yet, cancelled, refused – the approval view opens.
export async function answerApproval(response: Notifications.NotificationResponse, open: (path: string) => void) {
  const tap = approvalRequest(response);
  if (!tap) return;
  const identifier = response.notification.request.identifier;
  const key = `${identifier}|approve`;
  if (answered.has(key)) return;
  answered.add(key);
  const path = tap.url ? safePath(tap.url) : null;
  const fallback = (message = "") => {
    if (path) open(path);
    if (message) void notice(tn("actionFailedTitle"), message);
  };
  const profileId = store.profiles().active;
  // A notification of another instance than the active profile's: nothing to approve here.
  if (!profileId || (tap.origin !== null && tap.origin !== store.server())) return fallback(tn("approveOtherInstance"));
  if (!approvalVerifier(profileId)) {
    // Android makes the key now (asking for the fingerprint); it reaches the
    // instance with the next registration – this time the view decides.
    await createApprovalKey(profileId, tn("approvePrompt"));
    return fallback();
  }
  let secret: string | null = null;
  try {
    secret = await readApprovalSecret(profileId, tn("approvePrompt"));
  } catch {
    // Cancelled, or the biometrics did not match.
    return fallback();
  }
  if (!secret) return fallback(tn("approveSetUpAgain"));
  const result = await ask(approveBody(tap, secret));
  const outcome = approvalOutcome(result.status, result.body as { error?: unknown; decision?: unknown } | null);
  if (outcome.kind === "approved") {
    await Notifications.dismissNotificationAsync(identifier).catch(() => {});
    if (result.ok && result.unread !== null) await Notifications.setBadgeCountAsync(result.unread).catch(() => {});
    await notice(tn("approvedTitle"), tn("approvedBody"));
    return;
  }
  // The instance knows no key of this installation (or no device): the
  // registration goes again, with the verifier.
  if (outcome.register) registerAgain();
  fallback(outcome.message || tn("actionFailedBody"));
}

// The buttons while the app runs: Android's (the background task covers a
// closed app), and on both platforms "Approve", which opens the app – also
// the one that started it.
export function onNotificationButton(open: (path: string) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (opensApp(response.actionIdentifier)) void answerApproval(response, open);
    else void answerButton(response);
  });
  const initial = Notifications.getLastNotificationResponse();
  if (initial && opensApp(initial.actionIdentifier)) {
    Notifications.clearLastNotificationResponse();
    void answerApproval(initial, open);
  }
  return subscription;
}
