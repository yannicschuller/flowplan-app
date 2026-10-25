// What runs right now, as Live Activities (iOS: lock screen, Dynamic Island)
// and ongoing notifications (Android, Live Updates on Android 16): focus,
// the meeting now, imports and exports, an incident of the instance (for
// administrators, only while there is one) and a voice memo being recorded.
// Made from the instance's widget answers (POST /api/mobile/widgets/data,
// kinds focus, meeting, jobs, incident) – finished texts, no null (the
// props reach a property list on iOS). Pure functions, tested in
// test/activities.test.ts; native/activities.ts starts, updates and ends.
import { t, type Locale } from "./i18n";
import { appLink } from "./navigation";
import { pageLink } from "./widgets/present";

export const ACTIVITY_KINDS = ["focus", "meeting", "jobs", "incident", "recording"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type FocusProps = {
  phase: "focus" | "break";
  label: string;
  title: string;
  // The clock counts down to this (ms).
  endsAt: number;
  // The whole phase, for the bar (ms).
  startedAt: number;
  untilLabel: string;
  stopLabel: string;
  url: string;
};
export type MeetingProps = { label: string; title: string; calendar: string; start: number; end: number; endsLabel: string; notesLabel: string; notesUrl: string; url: string };
export type JobsProps = { title: string; name: string; label: string; status: string; statusLabel: string; progress: number; more: number; url: string };
export type IncidentProps = { title: string; level: "warning" | "critical"; levelLabel: string; headline: string; detail: string; url: string };
export type RecordingProps = { title: string; label: string; start: number; stopLabel: string; url: string };

export type Activities = {
  focus?: FocusProps;
  meeting?: MeetingProps;
  jobs?: JobsProps;
  incident?: IncidentProps;
  recording?: RecordingProps;
};

type Data = Record<string, unknown> | null | undefined;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const clock = (ms: number, locale: Locale) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

// Which Live Activities the person wants (app settings); focus, voice
// memos and the timer always show while they run.
export type ActivityChoices = { meeting: boolean; jobs: boolean; incident: boolean };
export const DEFAULT_CHOICES: ActivityChoices = { meeting: true, jobs: true, incident: true };

export function focusActivity(data: Data, locale: Locale, now = Date.now()): FocusProps | undefined {
  if (!data || (data.phase !== "focus" && data.phase !== "break")) return undefined;
  const started = num(data.startedAt),
    focusEnd = num(data.focusEndsAt),
    breakEnd = num(data.breakEndsAt);
  if (started === null || focusEnd === null) return undefined;
  const inBreak = data.phase === "break" || now >= focusEnd;
  const endsAt = inBreak ? (breakEnd ?? focusEnd) : focusEnd;
  if (endsAt <= now) return undefined;
  const task = (data.task ?? null) as Data;
  return {
    phase: inBreak ? "break" : "focus",
    label: t(inBreak ? "focusBreak" : "focus", {}, locale),
    title: str(task?.title) || t(inBreak ? "focusBreak" : "focus", {}, locale),
    endsAt,
    startedAt: inBreak ? focusEnd : started,
    untilLabel: t("focusEndsAt", { time: clock(endsAt, locale) }, locale),
    stopLabel: t("focusEnd", {}, locale),
    url: task ? pageLink(task.url) : appLink("/"),
  };
}

// The texts of the focus and timer views for pushes from the instance
// (lib/live-activity-push.ts in Flowplan): ActivityKit replaces the whole
// content state on a push, so the instance sends every prop the views read
// (focusActivity above, timerProps in summary.ts) – with these labels, in
// this language and time zone ("{time}" is filled in with clock()'s
// format). Labels only, nothing of the person's data.
export type LiveActivityLabels = {
  locale: Locale;
  timeZone: string;
  focus: { focus: string; break: string; until: string; stop: string };
  timer: { label: string };
};
export function liveActivityLabels(locale: Locale, timeZone: string): LiveActivityLabels {
  return {
    locale,
    timeZone,
    focus: {
      focus: t("focus", {}, locale),
      break: t("focusBreak", {}, locale),
      until: t("focusEndsAt", { time: "{time}" }, locale),
      stop: t("focusEnd", {}, locale),
    },
    timer: { label: t("widgetTimer", {}, locale) },
  };
}

// The meeting that runs now; "Open notes" opens its note or creates it
// (flowplan://meeting, App.tsx → meeting.note).
export function meetingActivity(data: Data, locale: Locale, now = Date.now()): MeetingProps | undefined {
  const meeting = (data?.now ?? null) as Data;
  if (!meeting) return undefined;
  const start = num(meeting.startMs),
    end = num(meeting.endMs);
  if (start === null || end === null || end <= now) return undefined;
  const note = (meeting.note ?? null) as Data;
  const query = new URLSearchParams({
    pageId: str(meeting.pageId),
    rowId: str(meeting.rowId),
    date: str(meeting.date),
    start: str(meeting.start),
    end: str(meeting.end),
  });
  return {
    label: t("meetingNow", {}, locale),
    title: str(meeting.title),
    calendar: str(meeting.calendar),
    start,
    end,
    endsLabel: t("meetingEnds", { time: clock(end, locale) }, locale),
    notesLabel: t("meetingNotes", {}, locale),
    notesUrl: note ? pageLink(note.url) : meeting.canCreateNote === true ? `flowplan://meeting?${query}` : pageLink(meeting.url),
    url: pageLink(meeting.url),
  };
}

// The first running import or export (others counted); a finished one
// stays a moment with its state.
export function jobsActivity(data: Data, locale: Locale): JobsProps | undefined {
  const items = Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]) : [];
  const running = items.filter((j) => j.status === "running");
  const job = running[0] ?? items[0];
  if (!job) return undefined;
  const status = str(job.status) || "running";
  const progress = num(job.progress);
  return {
    title: t("jobsTitle", {}, locale),
    name: str(job.name),
    label: str(job.label),
    status,
    statusLabel: t(status === "running" ? "jobRunning" : status === "done" ? "jobDone" : "jobFailed", {}, locale),
    // 0–1; -1: no estimate (indeterminate bar).
    progress: status === "done" ? 1 : progress === null ? -1 : Math.min(1, Math.max(0, progress / 100)),
    more: Math.max(0, running.length - 1),
    url: appLink("/#settings"),
  };
}
export const jobsRunning = (data: Data) => Array.isArray(data?.items) && (data.items as Record<string, unknown>[]).some((j) => j.status === "running");

// Only while there is an incident: it ends by itself when all is well.
export function incidentActivity(data: Data, locale: Locale): IncidentProps | undefined {
  if (!data || (data.level !== "warning" && data.level !== "critical")) return undefined;
  const issues = Array.isArray(data.issues) ? (data.issues as Record<string, unknown>[]) : [];
  return {
    title: t("incidentTitle", {}, locale),
    level: data.level,
    levelLabel: t(data.level === "critical" ? "incidentCritical" : "incidentWarning", {}, locale),
    headline: str(issues[0]?.text) || t("incidentTitle", {}, locale),
    detail: issues.length > 1 ? t("adminMore", { count: issues.length - 1 }, locale) : "",
    url: pageLink(data.url),
  };
}

export function recordingActivity(start: number | null, locale: Locale): RecordingProps | undefined {
  if (!start) return undefined;
  return { title: t("captureVoice", {}, locale), label: t("recording", {}, locale), start, stopLabel: t("recordStop", {}, locale), url: "flowplan://capture?mode=voice" };
}

export function activitiesFrom(
  answers: Partial<Record<"focus" | "meeting" | "jobs" | "incident", Data>>,
  options: { locale: Locale; choices: ActivityChoices; recording: number | null; now?: number },
): Activities {
  const { locale, choices } = options;
  const now = options.now ?? Date.now();
  return {
    focus: focusActivity(answers.focus, locale, now),
    meeting: choices.meeting ? meetingActivity(answers.meeting, locale, now) : undefined,
    jobs: choices.jobs ? jobsActivity(answers.jobs, locale) : undefined,
    incident: choices.incident ? incidentActivity(answers.incident, locale) : undefined,
    recording: recordingActivity(options.recording, locale),
  };
}

// How often the app asks again while it is in front: often while a job
// runs (its bar moves), otherwise every minute.
export const pollInterval = (answers: { jobs?: Data }) => (jobsRunning(answers.jobs) ? 5_000 : 60_000);
