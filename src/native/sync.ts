// Brings widgets, the badge and the running timer up to date with the
// instance: in the app (after changes the page reports, on returning to the
// foreground), in the background (background-task.ts) and for Android's
// widget requests (widget-task.ts).
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { requestWidgetUpdate } from "react-native-android-widget";
import { hideTimer, showTimer } from "../../modules/flowplan-native/src";
import { locale, t } from "../i18n";
import { timeoutSignal } from "../server";
import { store } from "../store";
import { inboxWidget, isSummary, localDay, tasksWidget, timerProps, type Summary } from "../summary";
import { renderInbox, renderTasks } from "../widgets/android";
import type * as IosWidgets from "../widgets/ios";

// expo-widgets only on iOS: Android draws its widgets with
// react-native-android-widget, the timer as notification.
const ios: typeof IosWidgets | null = Platform.OS === "ios" ? require("../widgets/ios") : null;

export type FetchResult = { summary: Summary } | { signedOut: true } | { failed: true };

// GET /api/mobile/summary with this installation's device token.
export async function fetchSummary(server: string | null = store.server(), token: string | null = store.deviceToken()): Promise<FetchResult> {
  if (!server || !token) return { signedOut: true };
  try {
    const response = await fetch(`${server}/api/mobile/summary?today=${localDay()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: timeoutSignal(15_000),
    });
    if (response.status === 401) return { signedOut: true };
    const data = await response.json().catch(() => null);
    return response.ok && isSummary(data) ? { summary: data } : { failed: true };
  } catch {
    return { failed: true };
  }
}

// The app leaves the instance: its entry there (device token, push) goes.
export async function leaveInstance(server: string, token: string | null) {
  if (!token) return;
  try {
    await fetch(`${server}/api/mobile/unregister`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: timeoutSignal(8000),
    });
  } catch {}
}

// Fetches and shows; offline the last summary stays.
export async function refresh(): Promise<FetchResult> {
  const result = await fetchSummary();
  if ("summary" in result) await apply(result.summary);
  else if ("signedOut" in result) {
    store.setDeviceToken(null);
    await apply(null);
  }
  return result;
}

let lastTimer = "";

export async function apply(summary: Summary | null) {
  store.setSummary(summary);
  await Promise.allSettled([updateWidgets(summary), updateTimer(summary), Notifications.setBadgeCountAsync(summary?.unread ?? 0)]);
}

export async function updateWidgets(summary: Summary | null = store.summary()) {
  const lang = locale();
  const tasks = tasksWidget(summary, lang),
    inbox = inboxWidget(summary, lang);
  if (ios) {
    try {
      ios.tasksWidget.updateSnapshot(tasks);
      ios.inboxWidget.updateSnapshot(inbox);
    } catch {}
    return;
  }
  await Promise.allSettled([
    requestWidgetUpdate({ widgetName: "FlowplanTasks", renderWidget: (info) => renderTasks(tasks, info.height) }),
    requestWidgetUpdate({ widgetName: "FlowplanInbox", renderWidget: () => renderInbox(inbox) }),
  ]);
}

// The running timer: Live Activity on iOS, ongoing notification on Android.
export async function updateTimer(summary: Summary | null) {
  const props = timerProps(summary, locale());
  const key = props ? `${props.start}|${props.title}|${props.database}` : "";
  if (Platform.OS === "android") {
    if (key === lastTimer) return;
    lastTimer = key;
    if (!props) return hideTimer();
    showTimer({
      title: props.title,
      text: props.database,
      label: props.label,
      start: props.start,
      url: props.url,
      channelId: "timer",
      channelName: t("channelTimer"),
      channelDescription: t("channelTimerText"),
    });
    return;
  }
  if (!ios) return;
  try {
    const running = ios.timerActivity.getInstances();
    if (!props) {
      await Promise.allSettled(running.map((activity) => activity.end("immediate")));
      lastTimer = "";
      return;
    }
    if (key === lastTimer && running.length) return;
    if (running.length) {
      await running[0].update(props);
      await Promise.allSettled(running.slice(1).map((activity) => activity.end("immediate")));
    } else {
      // iOS starts Live Activities only while the app is in the foreground;
      // in the background this fails and the next foreground refresh starts it.
      ios.timerActivity.start(props, props.url);
    }
    lastTimer = key;
  } catch {}
}
