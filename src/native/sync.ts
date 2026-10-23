// Brings widgets, the badge and the running timer up to date with the
// instance: in the app (after changes the page reports, on returning to the
// foreground), in the background (background-task.ts) and for Android's
// widget requests (widget-task.ts).
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { requestWidgetUpdate } from "react-native-android-widget";
import { hideTimer, showTimer } from "../../modules/flowplan-native/src";
import { locale, t } from "../i18n";
import { timeoutSignal } from "../server";
import { store } from "../store";
import { inboxWidget, isSummary, localDay, tasksWidget, timerProps, widgetProps, type Summary } from "../summary";
import { adminLiveWidget, adminStatusWidget, adminStorageWidget, isAdminSummary, type AdminState } from "../admin";
import { renderAdminLive, renderAdminStatus, renderAdminStorage, renderInbox, renderTasks } from "../widgets/android";
import type * as IosWidgets from "../widgets/ios";
import { refreshSuite } from "./suite";

// expo-widgets only on iOS: Android draws its widgets with
// react-native-android-widget, the timer as notification.
// A personal test build may come without the widget extension (app.config.ts).
const withWidgets = (Constants.expoConfig?.extra as { widgets?: boolean } | undefined)?.widgets !== false;
const ios: typeof IosWidgets | null = Platform.OS === "ios" && withWidgets ? require("../widgets/ios") : null;

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

// GET /api/mobile/admin-summary (administrators only, lib/mobile-admin.ts in
// Flowplan). undefined: not reachable now – the last state stays.
export async function fetchAdminState(server: string | null = store.server(), token: string | null = store.deviceToken()): Promise<AdminState | undefined> {
  if (!server || !token) return null;
  try {
    const response = await fetch(`${server}/api/mobile/admin-summary`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: timeoutSignal(15_000),
    });
    if (response.status === 401) return null;
    if (response.status === 403 || response.status === 404) return { kind: "notAdmin" };
    const data = await response.json().catch(() => null);
    return response.ok && isAdminSummary(data) ? { kind: "data", data } : undefined;
  } catch {
    return undefined;
  }
}

// What the administrators' widgets show after a summary: asked only when
// the summary says the person administers the instance.
export async function adminStateFor(summary: Summary | null): Promise<AdminState> {
  if (!summary) return null;
  if (!summary.admin) return { kind: "notAdmin" };
  const state = await fetchAdminState();
  return state === undefined ? store.adminState() : state;
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
  if ("summary" in result) await apply(result.summary, await adminStateFor(result.summary));
  else if ("signedOut" in result) {
    store.setDeviceToken(null);
    await apply(null);
  }
  return result;
}

let lastTimer = "";

// Without a summary (signed out) the administrators' widgets are cleared too.
export async function apply(summary: Summary | null, admin: AdminState = null) {
  store.setSummary(summary);
  store.setAdminState(summary ? admin : null);
  await Promise.allSettled([
    updateWidgets(summary, summary ? admin : null),
    updateTimer(summary),
    Notifications.setBadgeCountAsync(summary?.unread ?? 0),
    // The configurable widgets: one batched request (Android) or a reload
    // of the extension (iOS); signed out they ask to sign in.
    refreshSuite(),
  ]);
}

export async function updateWidgets(summary: Summary | null = store.summary(), admin: AdminState = store.adminState()) {
  const lang = locale();
  const tasks = tasksWidget(summary, lang),
    inbox = inboxWidget(summary, lang),
    status = adminStatusWidget(admin, lang),
    live = adminLiveWidget(admin, lang),
    storage = adminStorageWidget(admin, lang);
  if (ios) {
    // Each widget on its own: one that fails does not keep the others
    // empty. widgetProps: no null reaches the App Group (summary.ts).
    try {
      ios.localizeSamples(lang);
    } catch {}
    const updates: [string, { updateSnapshot: (props: never) => void }, object][] = [
      ["tasks", ios.tasksWidget, tasks],
      ["inbox", ios.inboxWidget, inbox],
      ["instance", ios.adminStatusWidget, status],
      ["live", ios.adminLiveWidget, live],
      ["storage", ios.adminStorageWidget, storage],
    ];
    for (const [name, widget, props] of updates) {
      try {
        widget.updateSnapshot(widgetProps(props) as never);
      } catch (error) {
        if (__DEV__) console.warn(`Flowplan: ${name} widget not updated`, error);
      }
    }
    return;
  }
  await Promise.allSettled([
    requestWidgetUpdate({ widgetName: "FlowplanTasks", renderWidget: (info) => renderTasks(tasks, info.height) }),
    requestWidgetUpdate({ widgetName: "FlowplanInbox", renderWidget: () => renderInbox(inbox) }),
    requestWidgetUpdate({ widgetName: "FlowplanInstance", renderWidget: () => renderAdminStatus(status) }),
    requestWidgetUpdate({ widgetName: "FlowplanLive", renderWidget: (info) => renderAdminLive(live, info.height) }),
    requestWidgetUpdate({ widgetName: "FlowplanStorage", renderWidget: () => renderAdminStorage(storage) }),
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
