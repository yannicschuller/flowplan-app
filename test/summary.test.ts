import { test } from "node:test";
import assert from "node:assert/strict";
import { dueLabel, inboxWidget, isSummary, localDay, tasksWidget, timerProps, type Summary } from "../src/summary";

const summary: Summary = {
  name: "Ada",
  unread: 3,
  tasks: {
    due: 2,
    overdue: 1,
    open: 4,
    items: [
      { text: "Send offer", page: "Sales", due: "2026-03-03", url: "/#page=a" },
      { text: "Call Ben", page: "Journal", due: "2026-03-04", url: "/#page=b" },
      { text: "Plan trip", page: "Ideas", due: null, url: "/#page=c&row=d" },
    ],
  },
  timer: { start: 1_700_000_000_000, title: "Write offer", database: "Work", url: "/#page=e&row=f" },
  today: "2026-03-04",
  at: 1,
};

test("the summary is recognised", () => {
  assert.ok(isSummary(summary));
  assert.ok(isSummary({ ...summary, timer: null }));
  assert.ok(!isSummary({ error: "Bitte melde dich an." }));
  assert.ok(!isSummary(null));
  assert.equal(localDay(new Date(2026, 0, 5)), "2026-01-05");
});

test("due dates read like in Flowplan", () => {
  assert.equal(dueLabel("2026-03-04", "2026-03-04", "de"), "Heute");
  assert.equal(dueLabel("2026-03-05", "2026-03-04", "en"), "Tomorrow");
  assert.equal(dueLabel("2026-03-03", "2026-03-04", "fr"), "Hier");
  assert.equal(dueLabel(null, "2026-03-04", "de"), "");
  assert.match(dueLabel("2026-03-20", "2026-03-04", "en"), /Mar/);
});

test("widgets get finished texts and links into the app", () => {
  const tasks = tasksWidget(summary, "en");
  assert.equal(tasks.headline, "2 due");
  assert.equal(tasks.detail, "1 overdue");
  assert.ok(tasks.late);
  assert.deepEqual(
    tasks.items.map((i) => [i.text, i.due, i.late]),
    [
      ["Send offer", "Yesterday", true],
      ["Call Ben", "Today", false],
      ["Plan trip", "", false],
    ],
  );
  assert.equal(tasks.items[2].url, "flowplan://open?path=%2F%23page%3Dc%26row%3Dd");
  assert.equal(tasks.unreadLabel, "3 unread");
  assert.equal(tasks.timer?.title, "Write offer");
  const signedOut = tasksWidget(null, "de");
  assert.equal(signedOut.signedIn, false);
  assert.equal(signedOut.headline, "In Flowplan anmelden");
  assert.equal(inboxWidget(summary, "de").label, "3 ungelesen");
  assert.equal(inboxWidget({ ...summary, unread: 0 }, "fr").label, "Tout est lu");
  assert.equal(inboxWidget(null, "en").url, "flowplan://open?path=%2F");
  const quiet = tasksWidget({ ...summary, tasks: { due: 0, overdue: 0, open: 0, items: [] } }, "de");
  assert.equal(quiet.headline, "Nichts fällig");
  assert.equal(quiet.detail, "");
});

test("the running timer becomes the Live Activity", () => {
  const timer = timerProps(summary, "de")!;
  assert.equal(timer.title, "Write offer");
  assert.equal(timer.database, "Work");
  assert.equal(timer.label, "Zeiterfassung");
  assert.equal(timer.url, "flowplan://open?path=%2F%23page%3De%26row%3Df");
  assert.equal(timerProps({ ...summary, timer: null }, "de"), null);
  assert.equal(timerProps(null, "de"), null);
  // A record without a title shows the database's name.
  assert.equal(timerProps({ ...summary, timer: { ...summary.timer!, title: "" } }, "en")!.title, "Work");
});
