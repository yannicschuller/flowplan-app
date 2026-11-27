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
import { inboxWidget, isSummary, localDay, studyOf, tasksWidget, timerProps, widgetProps, type Summary } from "../summary";
import { adminLiveWidget, adminStatusWidget, adminStorageWidget, isAdminSummary, nextAdminState, type AdminState } from "../admin";
import { renderAdminLive, renderAdminStatus, renderAdminStorage, renderInbox, renderTasks } from "../widgets/android";
import { setQuickActions } from "./actions";
import { syncShortcuts } from "../android/shortcuts";
import type * as IosWidgets from "../widgets/ios";
import { clearSuiteAnswers, refreshSuite, timeZone } from "./suite";
import { http } from "./push";
import { leaveWidgetPush, syncWidgetPush } from "./widget-push";
import { setDevicePush } from "../push-relay";
import { syncSpotlight } from "./spotlight";
import { syncLocalReminders } from "./local-reminders";
import { endLiveActivity, watchLiveActivity, type PushTokenActivity } from "./live-push";

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
    // The time zone: the study day of flashcards (summary.study).
    const response = await fetch(`${server}/api/mobile/summary?today=${localDay()}&zone=${encodeURIComponent(timeZone())}`, {
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
// Unreachable or refused while the summary answered: the last numbers stay
// (never "sign in" next to a summary that just answered).
export async function adminStateFor(summary: Summary | null, server: string | null = store.server(), token: string | null = store.deviceToken()): Promise<AdminState> {
  if (!summary) return null;
  if (!summary.admin) return { kind: "notAdmin" };
  return nextAdminState(await fetchAdminState(server, token), store.adminState());
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

// Another profile became active: this one's instance keeps the phone for its
// widgets but sends it no notifications any more (POST /api/mobile/device
// { push: false }). An instance too old for that – or one whose session
// ended – is left as before: entry, token and answers go, its widgets ask
// to sign in. Not reachable now: told again later (retryPushOff).
export async function quietInstance(profileId: string, server: string, token: string): Promise<"kept" | "left" | "pending"> {
  const { result, widgetPush } = await setDevicePush(server, token, false, http);
  if (store.profiles().active === profileId) return "kept";
  if (result === "ok") {
    store.setPushOffPending(profileId, false);
    // The instance dropped the widgets' push registration (the relay
    // refused it): a new one.
    if (widgetPush === false && store.widgetPushRecord(profileId)) {
      store.setWidgetPushRecord(profileId, null);
      void syncWidgetPush();
    }
    return "kept";
  }
  if (result === "failed") {
    store.setPushOffPending(profileId, true);
    return "pending";
  }
  store.setPushOffPending(profileId, false);
  leaveWidgetPush(profileId);
  store.forgetInstance(profileId);
  await clearSuiteAnswers(profileId);
  if (result === "missing") await leaveInstance(server, token);
  void refreshSuite({ force: true });
  return "left";
}

// Profiles that are not active and whose instance has not yet heard that
// the phone wants no pushes from it.
export async function retryPushOff() {
  const state = store.profiles();
  for (const profile of state.profiles) {
    if (profile.id === state.active || !store.pushOffPending(profile.id)) continue;
    const token = store.deviceTokenOf(profile.id);
    if (!token) {
      store.setPushOffPending(profile.id, false);
      continue;
    }
    await quietInstance(profile.id, profile.server, token);
  }
}

// Fetches and shows; offline the last summary stays.
// Every registration (each start of the app) renews the device token and
// ends the previous one. A refresh still underway with the previous token
// would otherwise show its 401 as "signed out" – and clear the new token –
// or overwrite what the newer refresh showed: it starts over with the
// current token instead.
export async function refresh(attempt = 0): Promise<FetchResult> {
  const server = store.server(),
    token = store.deviceToken();
  const renewed = () => attempt < 2 && !!token && (store.server() !== server || store.deviceToken() !== token);
  const result = await fetchSummary(server, token);
  if (renewed()) return refresh(attempt + 1);
  if ("summary" in result) {
    const admin = await adminStateFor(result.summary, server, token);
    if (renewed()) return refresh(attempt + 1);
    await apply(result.summary, admin);
  } else if ("signedOut" in result) {
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
    // iOS: pages and open tasks in Spotlight; signed out it is emptied.
    syncSpotlight(summary),
    // Due tasks as the phone's own reminders, where the instance cannot push.
    syncLocalReminders(summary),
    studyActions(summary),
  ]);
}

// "Lernen" among the quick actions (iOS) and app shortcuts (Android) once
// the person has flashcards – and away again without.
let lastStudy: boolean | null = null;
async function studyActions(summary: Summary | null) {
  if (!summary) return;
  const study = !!studyOf(summary);
  if (study === lastStudy) return;
  lastStudy = study;
  if (Platform.OS === "android") await syncShortcuts(true, study);
  else setQuickActions(true, study);
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
    requestWidgetUpdate({ widgetName: "FlowplanInstance", renderWidget: (info) => renderAdminStatus(status, info.height) }),
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
      endLiveActivity("timer");
      await Promise.allSettled(running.map((activity) => activity.end("immediate")));
      lastTimer = "";
      return;
    }
    if (key === lastTimer && running.length) return;
    if (running.length) {
      await running[0].update(props);
      watchLiveActivity("timer", running[0] as PushTokenActivity);
      await Promise.allSettled(running.slice(1).map((activity) => activity.end("immediate")));
    } else {
      // iOS starts Live Activities only while the app is in the foreground;
      // in the background this fails and the next foreground refresh starts it.
      watchLiveActivity("timer", ios.timerActivity.start(props, props.url) as PushTokenActivity);
    }
    lastTimer = key;
  } catch {}
}
