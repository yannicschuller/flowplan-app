// Starts, updates and ends the Live Activities (iOS, expo-widgets) and the
// ongoing notifications (Android, modules/flowplan-native) of what runs
// now: focus, the meeting now, imports and exports, an incident (for
// administrators) and a voice memo being recorded (activities.ts). The app
// asks the instance while it is in front (every minute, every few seconds
// while a job runs), in the background task and after its own actions.
// iOS starts Live Activities only while the app is in front; updates and
// ends also work in the background. Each activity's push token goes to the
// push relay and the instance (live-push.ts), so instances that support it
// can update and end them while the app sleeps.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { addUserInteractionListener } from "expo-widgets";
import { donateShortcut, hideOngoing, showOngoing, type OngoingOptions } from "../../modules/flowplan-native/src";
import { activitiesFrom, ACTIVITY_KINDS, DEFAULT_CHOICES, pollInterval, type Activities, type ActivityChoices, type ActivityKind } from "../activities";
import { locale, t } from "../i18n";
import type { DO_ACTIONS } from "../navigation";
import { store } from "../store";
import { localDay } from "../summary";
import { widgetAction, widgetData, type ActionName } from "../widgets/api";
import type * as IosWidgets from "../widgets/ios";
import { connection, timeZone } from "./suite";
import { endLiveActivity, stopWatchingLiveActivities, watchLiveActivity, type PushTokenActivity } from "./live-push";

const withWidgets = (Constants.expoConfig?.extra as { widgets?: boolean } | undefined)?.widgets !== false;
const ios: typeof IosWidgets | null = Platform.OS === "ios" && withWidgets ? require("../widgets/ios") : null;

// ---- The person's choices (app settings) ----

const CHOICES_KEY = "flowplan.activities";
export function activityChoices(): ActivityChoices {
  try {
    return { ...DEFAULT_CHOICES, ...(JSON.parse(SecureStore.getItem(CHOICES_KEY) || "{}") as Partial<ActivityChoices>) };
  } catch {
    return DEFAULT_CHOICES;
  }
}
export function setActivityChoices(choices: ActivityChoices) {
  try {
    SecureStore.setItem(CHOICES_KEY, JSON.stringify(choices));
  } catch {}
  void refreshActivities();
}

// ---- What runs ----

let recordingSince: number | null = null;
let last: Activities = {};
let lastKeys: Partial<Record<ActivityKind, string>> = {};
let answers: Parameters<typeof activitiesFrom>[0] = {};

// Asks the instance once (one batched request) and shows what runs.
export async function refreshActivities(options: { foreground?: boolean } = {}) {
  const target = connection();
  if (!target) {
    answers = {};
    await show({}, options.foreground ?? false);
    return;
  }
  const kinds: ("focus" | "meeting" | "jobs" | "incident")[] = ["focus", "meeting", "jobs"];
  // Administrators only (the summary says so); the instance checks again.
  if (store.summary()?.admin) kinds.push("incident");
  const result = await widgetData(
    target,
    kinds.map((kind) => ({ id: kind, kind, config: {} })),
    { today: localDay(), zone: timeZone() },
  );
  if (result.ok) {
    answers = {};
    for (const kind of kinds) {
      const answer = result.value.get(kind);
      if (answer?.ok) answers[kind] = answer.data;
    }
  }
  await show(activitiesFrom(answers, { locale: locale(), choices: activityChoices(), recording: recordingSince }), options.foreground ?? false);
}

export const nextPoll = () => pollInterval(answers);

// The app's own voice memo (screens/Capture.tsx).
export function setRecording(since: number | null) {
  recordingSince = since;
  void show(activitiesFrom(answers, { locale: locale(), choices: activityChoices(), recording: since }), true);
}

async function show(next: Activities, foreground: boolean) {
  for (const kind of ACTIVITY_KINDS) {
    const props = next[kind];
    const key = props ? JSON.stringify(props) : "";
    if (key === (lastKeys[kind] ?? "") && (kind !== "recording" || !!props === !!last[kind])) continue;
    try {
      if (Platform.OS === "android") showAndroid(kind, next);
      else await showIos(kind, next, foreground);
      lastKeys[kind] = key;
    } catch {}
  }
  last = next;
}

async function showIos(kind: ActivityKind, next: Activities, foreground: boolean) {
  if (!ios) return;
  const factory = ios.liveActivities[kind] as unknown as {
    getInstances(): ({ update(props: object): Promise<void>; end(policy?: unknown, props?: object): Promise<void> } & PushTokenActivity)[];
    start(props: object, url?: string): PushTokenActivity;
  };
  const props = next[kind] as (object & { url?: string }) | undefined;
  const running = factory.getInstances();
  if (!props) {
    // A finished job ends showing its state; everything else at once.
    endLiveActivity(kind);
    await Promise.allSettled(running.map((activity) => activity.end(kind === "jobs" ? "default" : "immediate")));
    return;
  }
  if (kind === "jobs" && (props as { status?: string }).status !== "running") {
    endLiveActivity(kind);
    await Promise.allSettled(running.map((activity) => activity.end("default", props)));
    return;
  }
  if (running.length) {
    await running[0].update(props);
    watchLiveActivity(kind, running[0]);
    await Promise.allSettled(running.slice(1).map((activity) => activity.end("immediate")));
  } else if (foreground) {
    watchLiveActivity(kind, factory.start(props, props.url));
  } else {
    // Not started in the background (iOS refuses): the next time in front.
    throw new Error("background");
  }
}

function showAndroid(kind: ActivityKind, next: Activities) {
  const id = `activity-${kind}`;
  const common = { channelId: "activities", channelName: t("channelActivities"), channelDescription: t("channelActivitiesText") };
  let options: OngoingOptions | null = null;
  const a = next;
  if (kind === "focus" && a.focus)
    options = {
      ...common,
      id,
      title: a.focus.title,
      text: a.focus.untilLabel,
      label: a.focus.label,
      url: a.focus.url,
      end: a.focus.endsAt,
      actions: [{ label: a.focus.stopLabel, url: "flowplan://do?action=focus.stop" }],
    };
  if (kind === "meeting" && a.meeting)
    options = { ...common, id, title: a.meeting.title, text: a.meeting.endsLabel, label: a.meeting.label, url: a.meeting.url, end: a.meeting.end, actions: [{ label: a.meeting.notesLabel, url: a.meeting.notesUrl }] };
  if (kind === "jobs" && a.jobs && a.jobs.status === "running")
    options = {
      ...common,
      id,
      title: a.jobs.label ? `${a.jobs.name}: ${a.jobs.label}` : a.jobs.name,
      text: a.jobs.statusLabel,
      label: a.jobs.title,
      url: a.jobs.url,
      progress: a.jobs.progress < 0 ? -1 : Math.round(a.jobs.progress * 100),
    };
  if (kind === "incident" && a.incident)
    options = { ...common, id, title: a.incident.headline, text: a.incident.detail || a.incident.levelLabel, label: a.incident.title, url: a.incident.url };
  if (kind === "recording" && a.recording)
    options = { ...common, id, title: a.recording.title, text: a.recording.label, label: a.recording.label, url: a.recording.url, start: a.recording.start, actions: [{ label: a.recording.stopLabel, url: "flowplan://do?action=recording.stop" }] };
  if (options) showOngoing(options);
  else hideOngoing(id);
}

// ---- Actions from Live Activities, links and the app ----

let stopRecording: (() => void) | null = null;
export function onStopRecording(handler: (() => void) | null) {
  stopRecording = handler;
}

// flowplan://do?action=… (controls, notification buttons, Siri; checked
// by navigation.ts → doLink).
export async function runAppAction(action: (typeof DO_ACTIONS)[number], minutes = 25) {
  if (action === "recording.stop") return stopRecording?.();
  const target = connection();
  if (!target) return;
  await widgetAction(target, action as ActionName, action === "focus.start" ? { minutes, breakMinutes: 5 } : {});
  if (action === "focus.start") donateShortcut("focus");
  await refreshActivities({ foreground: true });
}

// The "End" and "Stop" buttons of the Live Activities (iOS 17+).
export function listenToActivityButtons() {
  if (!ios) return { remove() {} };
  return addUserInteractionListener((event) => {
    if (event.source === "FlowplanFocus" && event.target === "stop") void runAppAction("focus.stop");
    if (event.source === "FlowplanRecording" && event.target === "stop") void runAppAction("recording.stop");
  });
}

// Signed out or another profile: nothing of the previous one keeps running.
export async function endAllActivities() {
  answers = {};
  lastKeys = {};
  stopWatchingLiveActivities();
  await show({ recording: last.recording }, false);
  if (Platform.OS === "android") for (const kind of ACTIVITY_KINDS) if (kind !== "recording") hideOngoing(`activity-${kind}`);
  if (ios)
    for (const kind of ACTIVITY_KINDS) {
      if (kind === "recording") continue;
      const factory = ios.liveActivities[kind] as unknown as { getInstances(): { end(policy?: unknown): Promise<void> }[] };
      await Promise.allSettled(factory.getInstances().map((activity) => activity.end("immediate")));
    }
}
