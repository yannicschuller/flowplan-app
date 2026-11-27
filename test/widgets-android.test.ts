// The Android widgets brought up to the iOS overhaul: "My day" on Android
// (the same requests as iOS), the one grid for the list widgets (groups,
// the counter, relative days, the empty state with "New task") and "Admin
// status" with its traffic light and four rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import { DEFAULTS, extraRequests, kindOfWidget, needsSetup, normalizeConfig, OFFERED_KINDS, serverRequest, SUITE_WIDGETS } from "../src/widgets/suite";
import { groupedRows, myDayRows, MYDAY_TALL, sampleConfig, sampleExtras, sampleResult, suiteView, taskRows, type SuiteView } from "../src/widgets/present";
import { adminStatusLayout } from "../src/admin";

const { galleryStrings } = require("../plugins/widget-suite/strings") as { galleryStrings: (lang: string) => Record<string, string> };

const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";
const HABITS = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const now = Date.parse("2026-11-20T10:00:00Z");
const today = "2026-11-20";
const options = { locale: "en" as const, today, signedIn: true, now };
const root = join(__dirname, "..");

function assertNoNull(value: unknown, path = "$") {
  assert.notEqual(value, null, `${path} is null`);
  assert.notEqual(value, undefined, `${path} is undefined`);
  if (Array.isArray(value)) value.forEach((item, i) => assertNoNull(item, `${path}[${i}]`));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) assertNoNull(item, `${path}.${key}`);
}

const calendar = {
  id: "1",
  kind: "calendar",
  ok: true as const,
  data: {
    title: "Today",
    items: [
      { type: "event", title: "Early", day: today, start: "2026-11-20T07:00:00Z", end: "2026-11-20T07:30:00Z", timed: true, calendar: "Team", url: "/a" },
      { type: "event", title: "Offsite", day: today, timed: false, calendar: "Team", url: "/b" },
      { type: "event", title: "Retro", day: today, start: "2026-11-20T14:00:00Z", end: "2026-11-20T15:00:00Z", timed: true, calendar: "Team", url: "/c" },
      { type: "task", title: "A task of the calendar", day: today, timed: false, calendar: "Team", url: "/d" },
    ],
  },
};
const tasks = {
  id: "1:tasks",
  kind: "tasks",
  ok: true as const,
  data: {
    total: 12,
    overdue: 4,
    items: [
      { source: "doc", pageId: PAGE, index: 0, text: "Old", due: "2026-11-17", page: "A", url: "/", canEdit: true },
      { source: "doc", pageId: PAGE, index: 1, text: "Now", due: today, page: "A", url: "/", canEdit: true },
      { source: "doc", pageId: PAGE, index: 2, text: "Later", due: "2026-11-24", page: "A", url: "/", canEdit: true },
      { source: "doc", pageId: PAGE, index: 3, text: "Someday", page: "A", url: "/", canEdit: true },
    ],
  },
};
const journal = {
  id: "1:journal",
  kind: "journal",
  ok: true as const,
  data: {
    journal: null,
    habits: { id: HABITS, name: "Habits", done: 1, total: 3, canWrite: true, url: "/h", items: [
      { fieldId: "a", name: "Run", done: true },
      { fieldId: "b", name: "Read", done: false },
      { fieldId: "c", name: "No sugar", done: false },
    ] },
  },
};
const myDay = (view: SuiteView) => {
  assert.equal(view.state, "myday");
  return view as Extract<SuiteView, { state: "myday" }>;
};

test("My day is a widget on Android too: registered, offered, medium and large", () => {
  assert.equal(SUITE_WIDGETS.myday, "FlowplanMyDay");
  assert.equal(kindOfWidget("FlowplanMyDay"), "myday");
  assert.ok(OFFERED_KINDS.includes("myday"));
  assert.ok(!needsSetup("myday", normalizeConfig("myday", {})));
  const plugins = config.plugins ?? [];
  const android = plugins.find((p) => Array.isArray(p) && p[0] === "react-native-android-widget") as [string, { widgets: Record<string, unknown>[] }];
  const widget = android[1].widgets.find((w) => w.name === "FlowplanMyDay");
  assert.ok(widget);
  assert.equal(widget.label, "@string/widget_label_flowplanmyday");
  assert.equal(widget.widgetFeatures, "reconfigurable|configuration_optional");
  assert.deepEqual([widget.targetCellWidth, widget.targetCellHeight, widget.minWidth], [4, 2, "250dp"]);
  // No small size: it needs a medium widget's width.
  const sizes = plugins.find((p) => Array.isArray(p) && p[0] === "./plugins/with-android-widget-sizes") as [string, Record<string, { minResizeWidth: string }>];
  assert.equal(sizes[1].FlowplanMyDay.minResizeWidth, "250dp");
  // Its name and description in the picker, in every language.
  for (const lang of ["de", "en", "fr", "pl", "pt", "ru", "zh"]) {
    const strings = galleryStrings(lang);
    assert.ok(strings.widget_label_flowplanmyday && strings.widget_flowplanmyday_description, lang);
  }
  assert.equal(galleryStrings("de").widget_label_flowplanmyday, "Mein Tag");
  assert.equal(galleryStrings("fr").widget_label_flowplanmyday, "Ma journée");
});

test("My day asks for what iOS asks for: today's calendar, my open tasks and the habits", () => {
  assert.deepEqual(DEFAULTS.myday, { sources: [] });
  const chosen = normalizeConfig("myday", { sources: [{ pageId: PAGE, viewId: "cal" }, { pageId: "nonsense" }], habitsId: HABITS, range: "week" });
  assert.deepEqual(chosen, { sources: [{ pageId: PAGE, viewId: "cal" }], habitsId: HABITS });
  assert.deepEqual(serverRequest("myday", chosen), { kind: "calendar", config: { sources: [{ pageId: PAGE, viewId: "cal" }], range: "today", tasks: false, max: 10 } });
  assert.deepEqual(extraRequests("myday", chosen), [
    { key: "tasks", kind: "tasks", config: { source: "mine", filter: "open", max: 10 } },
    { key: "journal", kind: "journal", config: { habitsId: HABITS } },
  ]);
  // No habit database chosen: no habits (as the journal widget).
  assert.deepEqual(extraRequests("myday", normalizeConfig("myday", {}))[1].config, {});
  // The same shapes as the Swift configuration.
  const swift = readFileSync(join(root, "plugins/widget-suite/ios/SuiteIntents.swift"), "utf8");
  assert.match(swift, /FPRequest\(kind: "calendar", config: \["sources": sources, "range": "today", "tasks": false, "max": 10\]\)/);
  assert.match(swift, /FPRequest\(kind: "tasks", config: \["source": "mine", "filter": "open", "max": 10\]\)/);
  // The app's own kind never goes to the instance.
  const suite = readFileSync(join(root, "src/widgets/suite.ts"), "utf8");
  assert.match(suite, /export type ServerKind = InstanceKind \| /);
});

test("My day: appointments still to come, tasks due today or overdue, today's habits", () => {
  const view = myDay(suiteView("myday", normalizeConfig("myday", {}), calendar, { ...options, extras: { tasks, journal }, fetchedAt: now - 60_000 }));
  assert.equal(view.title, "My day");
  // The appointment over already and the calendar's task are left out.
  assert.deepEqual(view.events.map((event) => event.title), ["Offsite", "Retro"]);
  assert.equal(view.events[0].when, "All day");
  assert.match(view.events[1].when, /–/);
  assert.deepEqual(view.tasks.map((task) => [task.text, task.group, task.due]), [
    ["Old", 0, "Overdue · 3 d"],
    ["Now", 1, "Today"],
  ]);
  assert.ok(view.tasks.every((task) => task.complete));
  assert.equal(view.habits?.items.length, 3);
  assert.equal(view.headline, "2 appointments · 2 tasks · 1/3");
  assert.deepEqual(view.headings, { events: "Appointments", tasks: "Due", habits: "Habits" });
  assert.equal(view.today, today);
  assert.ok(view.updated?.startsWith("Updated "));
  assertNoNull(view);

  // Just checked off: drawn done, no longer counted; a habit tapped counts.
  const marks = { pending: { [`task:doc:${PAGE}::1`]: now - 1000, [`habit:${HABITS}:b`]: now - 1000 }, failed: {} };
  const tapped = myDay(suiteView("myday", normalizeConfig("myday", {}), calendar, { ...options, marks, extras: { tasks, journal } }));
  assert.equal(tapped.tasks[1].done, true);
  assert.equal(tapped.headline, "2 appointments · 1 tasks · 2/3");

  // Habits behind a PIN stay out; German texts.
  const locked = { ...journal, data: { journal: null, habits: { id: HABITS, locked: true } } };
  const de = myDay(suiteView("myday", normalizeConfig("myday", {}), calendar, { ...options, locale: "de", extras: { tasks, journal: locked } }));
  assert.equal(de.habits, undefined);
  assert.equal(de.title, "Mein Tag");
  assert.equal(de.headline, "2 Termine · 2 Aufgaben");
  assert.deepEqual(de.headings, { events: "Termine", tasks: "Fällig", habits: "Gewohnheiten" });
});

test("My day: nothing left is an empty state with New task; missing extras are just left out", () => {
  const empty = myDay(suiteView("myday", normalizeConfig("myday", {}), { ...calendar, data: { items: [] } }, { ...options, extras: { tasks: { ...tasks, data: { total: 0, items: [] } }, journal: null } }));
  assert.equal(empty.events.length + empty.tasks.length, 0);
  assert.equal(empty.habits, undefined);
  assert.equal(empty.empty, "Nothing left for today");
  assert.deepEqual(empty.add, { label: "New task", url: "flowplan://capture?mode=task" });
  // The calendar answered, the others did not (yet).
  const alone = myDay(suiteView("myday", normalizeConfig("myday", {}), calendar, options));
  assert.equal(alone.events.length, 2);
  assert.equal(alone.headline, "2 appointments");
  // The calendar failed: the widget says why, as every widget does.
  assert.equal(suiteView("myday", normalizeConfig("myday", {}), { id: "1", kind: "calendar", ok: false, status: 0, error: "" }, options).state, "closed");
});

test("My day on Android: two columns in medium, one column in large, the rows from the height", () => {
  const counts = { events: 5, tasks: 6, habits: true };
  // Medium (4×2, about 190 dp with the footer): one row per column.
  assert.deepEqual(myDayRows(counts, 190, true), { columns: true, events: 1, tasks: 1 });
  assert.deepEqual(myDayRows({ ...counts, habits: false }, 190, true), { columns: true, events: 2, tasks: 2 });
  // Only appointments: one column over the whole width.
  assert.equal(myDayRows({ events: 3, tasks: 0, habits: false }, 190, true).columns, false);
  // Large (4×4, about 400 dp): half the rows (up to four) for the
  // appointments, the tasks in the rest.
  assert.deepEqual(myDayRows(counts, 400, true), { columns: false, events: 2, tasks: 3 });
  assert.deepEqual(myDayRows(counts, 520, true), { columns: false, events: 4, tasks: 4 });
  // Few tasks: the appointments take the rows they leave.
  assert.deepEqual(myDayRows({ events: 8, tasks: 1, habits: false }, 400, true), { columns: false, events: 6, tasks: 1 });
  assert.ok(MYDAY_TALL > 190 && MYDAY_TALL < 400);
  // The renderer draws both and checks off with the tasks' and habits' own actions.
  const android = readFileSync(join(root, "src/widgets/android-suite.tsx"), "utf8");
  assert.match(android, /case "myday": \{/);
  assert.match(android, /myDayRows\(\{ events: view\.events\.length, tasks: view\.tasks\.length, habits: !!habits \}, size\.height, !framed\)/);
  assert.match(android, /action=\{SUITE_CLICKS\.habit\}/);
  assert.match(android, /action=\{SUITE_CLICKS\.complete\}/);
});

test("one grid on Android: groups need room, no day under Today, days above Today's entries", () => {
  const view = suiteView("tasks", normalizeConfig("tasks", {}), tasks, options);
  assert.ok(view.state === "tasks");
  if (view.state !== "tasks") return;
  assert.equal(view.headline, "12 open · 4 overdue");
  assert.equal(view.short, "12 open");
  const tall = taskRows(view.items, 10);
  assert.deepEqual(tall.map((row) => row.heading), [0, 1, 2, undefined]);
  // Under the heading "Today" the row does not say "Today" again.
  assert.deepEqual(tall.map((row) => row.showDue), [true, false, true, true]);
  assert.ok(taskRows(view.items, 3).every((row) => row.heading === undefined && row.showDue));
  // "Today" over several days: the day as a heading, relative.
  const week = suiteView("calendar", normalizeConfig("calendar", { range: "week" }), {
    id: "1",
    kind: "calendar",
    ok: true,
    data: {
      items: [
        { type: "event", title: "A", day: today, start: "2026-11-20T12:00:00Z", timed: true, url: "/" },
        { type: "event", title: "B", day: "2026-11-21", start: "2026-11-21T12:00:00Z", timed: true, url: "/" },
        { type: "event", title: "C", day: "2026-11-23", timed: false, url: "/" },
      ],
    },
  }, options);
  assert.ok(week.state === "calendar");
  if (week.state !== "calendar") return;
  assert.deepEqual(week.items.map((item) => item.dayLabel), ["Today", "Tomorrow", "Monday"]);
  // The header's day, as the language writes it ("20 Fri", "Fr., 20.").
  assert.ok(week.date.includes("Fri") && week.date.includes("20"), week.date);
  const days = groupedRows(week.items, 5, (item) => item.dayLabel, 3);
  assert.ok(days.headings);
  assert.deepEqual(days.rows.map((row) => row.heading), ["Today", "Tomorrow", "Monday"]);
  // Too little room for headings: the short day in front of the time.
  assert.equal(groupedRows(week.items, 2, (item) => item.dayLabel, 3).headings, false);
  // Just today: no headings at all.
  const one = suiteView("calendar", normalizeConfig("calendar", {}), calendar, options);
  assert.ok(one.state === "calendar" && one.items.every((item) => item.dayLabel === ""));
  // Empty lists: "All done" with "New task" in every size.
  const android = readFileSync(join(root, "src/widgets/android-suite.tsx"), "utf8");
  assert.match(android, /\{view\.items\.length \? null : <AddButton add=\{view\.add\} theme=\{theme\} \/>\}/);
});

test("the samples of the pickers: My day with tasks and habits, Today with its next appointment", () => {
  for (const locale of ["de", "en", "fr", "pl", "pt", "ru", "zh"] as const) {
    const extras = sampleExtras("myday", locale, today, now);
    assert.deepEqual(Object.keys(extras), ["tasks", "journal"]);
    const view = myDay(suiteView("myday", sampleConfig("myday"), sampleResult("myday", locale, today, now), { ...options, locale, extras }));
    assert.ok(view.events.length === 2 && view.tasks.length === 2 && view.habits?.items.length === 3, locale);
    assertNoNull(view);
  }
  assert.deepEqual(Object.keys(sampleExtras("calendar", "en", today, now)), ["event", "mentions"]);
  assert.deepEqual(sampleExtras("tasks", "en", today, now), {});
  const previews = readFileSync(join(root, "src/native/suite.ts"), "utf8");
  assert.match(previews, /extras: sampleExtras\(kind, lang, localDay\(\), now\)/);
});

test("My day's settings on Android: calendars and the habit database", () => {
  const screen = readFileSync(join(root, "src/screens/WidgetConfig.tsx"), "utf8");
  assert.match(screen, /case "calendar":\n\s+case "myday": \{/);
  assert.match(screen, /kind === "myday" \? "calendar"/);
  assert.match(screen, /widgetOptions\(target, "journal"\)\.then\(\(answer\) => answer\.ok && setHabitOptions\(list\(answer\.value\.habits\)\)\)/);
});

test("Admin status on Android: the traffic light and the four rows as far as they fit", () => {
  // A 2×2 widget (about 180 dp): all four rows; low ones fewer, attention first.
  assert.deepEqual(adminStatusLayout(180, false), { rows: 4, detail: false });
  assert.equal(adminStatusLayout(180, true).rows, 3);
  assert.equal(adminStatusLayout(110, false).rows, 1);
  // Tall: the first issue in words too.
  assert.deepEqual(adminStatusLayout(250, false), { rows: 4, detail: true });
  const android = readFileSync(join(root, "src/widgets/android.tsx"), "utf8");
  assert.match(android, /text=\{`● \$\{props\.lightLabel \|\| props\.headline\}`\}/);
  assert.match(android, /const shown = rows >= list\.length \? list : \[\.\.\.attention,/);
  for (const file of ["src/native/widget-task.ts", "src/native/sync.ts"])
    assert.match(readFileSync(join(root, file), "utf8"), /renderAdminStatus\([^)]*\)?[^)]*\.height, (widgetInfo|info)\.width\)/, file);
});
