import { test } from "node:test";
import assert from "node:assert/strict";
import { activitiesFrom, DEFAULT_CHOICES, focusActivity, incidentActivity, jobsActivity, meetingActivity, pollInterval, recordingActivity } from "../src/activities";
import { captureRequest, doLink, meetingLink } from "../src/navigation";

const now = Date.parse("2026-10-22T10:00:00Z");
const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";
const ROW = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function assertNoNull(value: unknown, path = "$") {
  assert.notEqual(value, null, `${path} is null`);
  if (Array.isArray(value)) value.forEach((item, i) => assertNoNull(item, `${path}[${i}]`));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) assertNoNull(item, `${path}.${key}`);
}

test("focus counts down to the end of focus, then of the break; idle is nothing", () => {
  const data = { phase: "focus", startedAt: now - 5 * 60_000, focusEndsAt: now + 20 * 60_000, breakEndsAt: now + 25 * 60_000, task: { title: "Write offer", database: "Work", url: `/#page=${PAGE}` } };
  const focus = focusActivity(data, "en", now)!;
  assert.equal(focus.phase, "focus");
  assert.equal(focus.endsAt, now + 20 * 60_000);
  assert.equal(focus.title, "Write offer");
  assert.equal(focus.stopLabel, "End");
  const pause = focusActivity({ ...data, phase: "break" }, "de", now + 21 * 60_000)!;
  assert.equal(pause.phase, "break");
  assert.equal(pause.label, "Pause");
  assert.equal(pause.endsAt, now + 25 * 60_000);
  assert.equal(focusActivity({ phase: "idle", startedAt: null, focusEndsAt: null, breakEndsAt: null, task: null }, "en", now), undefined);
  assert.equal(focusActivity({ ...data, task: null }, "fr", now)!.title, "Concentration");
});

test("meeting now: time left and notes – open the note or create it", () => {
  const meeting = { title: "Weekly", start: "2026-10-22T09:30:00Z", end: "2026-10-22T10:30:00Z", startMs: now - 30 * 60_000, endMs: now + 30 * 60_000, calendar: "Team", url: `/#page=${PAGE}&row=${ROW}`, pageId: PAGE, rowId: ROW, date: "2026-10-22", note: null, canCreateNote: true };
  const props = meetingActivity({ title: "Meeting", now: meeting, next: null }, "en", now)!;
  assert.equal(props.end, now + 30 * 60_000);
  assert.ok(props.notesUrl.startsWith("flowplan://meeting?"));
  assert.deepEqual(meetingLink(props.notesUrl), { pageId: PAGE, rowId: ROW, date: "2026-10-22", start: meeting.start, end: meeting.end });
  const withNote = meetingActivity({ now: { ...meeting, note: { id: ROW, url: `/#page=${ROW}` } } }, "en", now)!;
  assert.equal(withNote.notesUrl, `flowplan://open?path=${encodeURIComponent(`/#page=${ROW}`)}`);
  assert.equal(meetingActivity({ now: null, next: meeting }, "en", now), undefined);
});

test("imports and exports: progress, indeterminate without one, the state when done", () => {
  const running = jobsActivity({ running: 2, items: [{ id: "1", kind: "import", name: "Import", label: "Notion", status: "running", progress: 40 }, { id: "2", kind: "export", name: "Export", label: "", status: "running", progress: null }] }, "en")!;
  assert.equal(running.progress, 0.4);
  assert.equal(running.more, 1);
  const indeterminate = jobsActivity({ items: [{ name: "Export", label: "", status: "running", progress: null }] }, "en")!;
  assert.equal(indeterminate.progress, -1);
  const done = jobsActivity({ items: [{ name: "Import", label: "ZIP", status: "done", progress: 100 }] }, "de")!;
  assert.equal(done.statusLabel, "Fertig");
  assert.equal(jobsActivity({ items: [] }, "en"), undefined);
  // Polled often while a job runs.
  assert.equal(pollInterval({ jobs: { items: [{ status: "running" }] } }), 5_000);
  assert.equal(pollInterval({}), 60_000);
});

test("an incident shows only while there is one", () => {
  assert.equal(incidentActivity({ level: "ok", issues: [] }, "en"), undefined);
  const incident = incidentActivity({ level: "critical", issues: [{ code: "disk_full", text: "Disk over 90 %" }, { code: "error_rate", text: "Error rate raised" }], url: "/#settings=admin" }, "en")!;
  assert.equal(incident.headline, "Disk over 90 %");
  assert.equal(incident.detail, "+1 more");
  assert.equal(incident.levelLabel, "Critical");
});

test("choices switch activities off; all props are free of null", () => {
  const answers = {
    focus: { phase: "focus", startedAt: now, focusEndsAt: now + 60_000, breakEndsAt: null, task: null },
    meeting: { now: { title: "x", startMs: now - 1, endMs: now + 60_000, pageId: PAGE, rowId: ROW, date: "2026-10-22", start: "s", end: "", note: null, canCreateNote: false, url: null, calendar: null } },
    jobs: { items: [{ name: "Import", label: null, status: "running", progress: null }] },
    incident: { level: "warning", issues: [], url: null },
  };
  const all = activitiesFrom(answers, { locale: "fr", choices: DEFAULT_CHOICES, recording: now, now });
  assert.deepEqual(Object.keys(all).filter((k) => all[k as keyof typeof all]), ["focus", "meeting", "jobs", "incident", "recording"]);
  assertNoNull(all);
  const some = activitiesFrom(answers, { locale: "en", choices: { meeting: false, jobs: false, incident: false }, recording: null, now });
  assert.ok(some.focus && !some.meeting && !some.jobs && !some.incident && !some.recording);
  assert.equal(recordingActivity(now, "de")!.stopLabel, "Aufnahme beenden");
});

test("app links are checked: capture, steps of the app, meeting notes", () => {
  assert.deepEqual(captureRequest(`flowplan://capture?mode=voice&target=${PAGE.toUpperCase()}&record=1`), { mode: "voice", target: PAGE, record: true });
  assert.deepEqual(captureRequest("flowplan://capture?mode=note&target=../../x"), { mode: "note" });
  assert.equal(captureRequest("flowplan://capture?mode=video"), null);
  assert.equal(captureRequest("https://evil.example/capture?mode=note"), null);
  assert.deepEqual(doLink("flowplan://do?action=focus.start&minutes=50"), { action: "focus.start", minutes: 50 });
  assert.deepEqual(doLink("flowplan://do?action=focus.start&minutes=9999"), { action: "focus.start", minutes: 25 });
  assert.equal(doLink("flowplan://do?action=capture.upload"), null);
  assert.equal(doLink("flowplan://open?action=focus.stop"), null);
  assert.equal(meetingLink(`flowplan://meeting?pageId=${PAGE}&rowId=nope&date=2026-10-22&start=x`), null);
});
