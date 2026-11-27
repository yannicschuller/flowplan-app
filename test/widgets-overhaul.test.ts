// The widget overhaul (2026): fewer widgets (merged ones keep working where
// they are), one grid (relative dates, groups, counters, the footer with the
// last update), "Today" with the next appointment and unread mentions, "My
// day" and "Admin status".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extraRequests,
  IOS_KINDS,
  LEGACY_KINDS,
  needsSetup,
  normalizeConfig,
  OFFERED_KINDS,
  RETIRED_KINDS,
  serverRequest,
  SUITE_KINDS,
} from "../src/widgets/suite";
import { suiteView, updatedLine } from "../src/widgets/present";
import { taskRows } from "../src/widgets/present";
import { adminStatusWidget, freshness, sampleAdminSummary } from "../src/admin";

const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";
const now = Date.parse("2026-11-20T10:00:00Z");
const options = { locale: "en" as const, today: "2026-11-20", signedIn: true, now };
const root = join(__dirname, "..");

test("fewer widgets: the merged and the given-up ones are no longer offered, but still known", () => {
  assert.deepEqual([...LEGACY_KINDS], ["counter", "reading", "event"]);
  assert.deepEqual([...RETIRED_KINDS], ["mentions", "forms"]);
  for (const kind of [...LEGACY_KINDS, ...RETIRED_KINDS]) {
    assert.ok(SUITE_KINDS.includes(kind), kind);
    assert.ok(!OFFERED_KINDS.includes(kind), kind);
  }
  assert.deepEqual([...OFFERED_KINDS], ["capture", "tasks", "calendar", "pinned", "journal", "time", "study", "metric", "deadline", "myday"]);
  // iOS keeps the merged ones (their widgets stay on screens) and has My day.
  assert.ok(IOS_KINDS.includes("myday") && IOS_KINDS.includes("counter") && !IOS_KINDS.includes("mentions"));
  const settings = readFileSync(join(root, "src/screens/Settings.tsx"), "utf8");
  assert.match(settings, /OFFERED_KINDS\.map\(\(kind\)/);
});

test("Key figure: a dashboard (as before) or a database, which asks for the counter with its history", () => {
  const dashboard = normalizeConfig("metric", { dashboardId: PAGE, widgetId: "w1" });
  assert.deepEqual(serverRequest("metric", dashboard), { kind: "metric", config: { dashboardId: PAGE, widgetId: "w1" } });
  const database = normalizeConfig("metric", { source: "database", pageId: PAGE, aggregate: "sum", fieldId: "amount" });
  assert.deepEqual(database, { source: "database", pageId: PAGE, aggregate: "sum", fieldId: "amount" });
  assert.ok(!needsSetup("metric", database));
  assert.ok(needsSetup("metric", normalizeConfig("metric", { source: "database" })));
  assert.deepEqual(serverRequest("metric", database), { kind: "counter", config: { pageId: PAGE, aggregate: "sum", fieldId: "amount", history: true } });
  const view = suiteView("metric", database, {
    id: "1",
    kind: "counter",
    ok: true,
    data: { title: "Orders", formatted: "42", label: "Records", history: [{ day: "2026-11-07", value: 30 }, { day: "2026-11-20", value: 42 }], url: "/" },
  }, options);
  assert.ok(view.state === "counter");
  if (view.state !== "counter") return;
  assert.equal(view.value, "42");
  assert.equal(view.delta, "+12 · last 2 days");
  assert.equal(view.trend, "up");
});

test("Pages: favorites, recently opened (the continue-reading answer) or one page; lists fill the widget", () => {
  const recent = normalizeConfig("pinned", { mode: "recent" });
  assert.equal(recent.mode, "recent");
  assert.deepEqual(serverRequest("pinned", recent), { kind: "reading", config: { source: "recent", max: 6 } });
  assert.equal(serverRequest("pinned", normalizeConfig("pinned", {})).config.max, 10);
  // Old settings with five tasks: the widget still asks for ten and shows what fits.
  assert.equal(serverRequest("tasks", normalizeConfig("tasks", { max: 5 })).config.max, 10);
  const view = suiteView("pinned", recent, { id: "1", kind: "reading", ok: true, data: { title: "Recently opened", items: [{ id: "1", title: "Handbook", kind: "book", progress: 0.5, url: "/" }] } }, options);
  assert.ok(view.state === "reading" && view.items[0].progress === 0.5 && view.kind === "pinned");
});

test("Today: the next appointment (small size) and the unread mentions come with the same request", () => {
  const config = normalizeConfig("calendar", { sources: [{ pageId: PAGE, viewId: "cal" }], range: "3days" });
  assert.deepEqual(extraRequests("calendar", config), [
    { key: "event", kind: "event", config: { calendars: [`${PAGE}:cal`], within: "48h", showJoin: true, max: 3 } },
    { key: "mentions", kind: "mentions", config: { show: "all", unreadOnly: true, max: 1 } },
  ]);
  assert.deepEqual(extraRequests("tasks", normalizeConfig("tasks", {})), []);
  const view = suiteView("calendar", config, { id: "1", kind: "calendar", ok: true, data: { title: "Today", items: [] } }, {
    ...options,
    extras: {
      event: { id: "e", kind: "event", ok: true, data: { items: [{ title: "Retro", start: "2026-11-20T10:25:00Z", end: "2026-11-20T11:00:00Z", allDay: false, joinUrl: "https://meet.example.com/x", url: "/" }] } },
      mentions: { id: "m", kind: "mentions", ok: true, data: { unread: { mentions: 2, assignments: 1 }, items: [] } },
    },
  });
  assert.ok(view.state === "calendar");
  if (view.state !== "calendar") return;
  assert.equal(view.next?.title, "Retro");
  assert.equal(view.next?.countdown, "in 25 min");
  assert.equal(view.next?.join, "https://meet.example.com/x");
  assert.equal(view.unread, 3);
  // An instance without the further answers: just the list.
  const plain = suiteView("calendar", config, { id: "1", kind: "calendar", ok: true, data: { items: [] } }, options);
  assert.ok(plain.state === "calendar" && !plain.next && plain.unread === 0);
});

test("one grid: a clear counter, groups, relative days and the quick add of an empty list", () => {
  const view = suiteView("tasks", normalizeConfig("tasks", {}), {
    id: "1",
    kind: "tasks",
    ok: true,
    data: {
      title: "My tasks",
      total: 24,
      overdue: 10,
      items: [
        { source: "doc", pageId: PAGE, index: 0, text: "Old", due: "2026-11-10", page: "A", url: "/", canEdit: true },
        { source: "doc", pageId: PAGE, index: 1, text: "Now", due: "2026-11-20", page: "A", url: "/", canEdit: true },
        { source: "doc", pageId: PAGE, index: 2, text: "Friday", due: "2026-11-27", page: "A", url: "/", canEdit: true },
        { source: "doc", pageId: PAGE, index: 3, text: "Soon", due: "2026-11-24", page: "A", url: "/", canEdit: true },
      ],
    },
  }, options);
  assert.ok(view.state === "tasks");
  if (view.state !== "tasks") return;
  assert.equal(view.headline, "24 open · 10 overdue");
  assert.deepEqual(view.items.map((item) => [item.due, item.group]), [
    ["Overdue · 10 d", 0],
    ["Today", 1],
    ["Nov 27", 2],
    ["Tuesday", 2],
  ]);
  assert.deepEqual(view.groups, ["Overdue", "Today", "Later"]);
  // Tall widgets: headings where the group changes (half a row each).
  assert.deepEqual(taskRows(view.items, 10).map((row) => row.heading), [0, 1, 2, undefined]);
  assert.deepEqual(taskRows(view.items, 3).map((row) => row.heading), [undefined, undefined, undefined]);
  const empty = suiteView("tasks", normalizeConfig("tasks", {}), { id: "1", kind: "tasks", ok: true, data: { total: 0, items: [] } }, options);
  assert.ok(empty.state === "tasks" && empty.headline === "All done" && empty.add.url === "flowplan://capture?mode=task");
});

test("the footer: when the answer came, a warning when older than an hour; not on quick capture", () => {
  assert.deepEqual(updatedLine(now - 12 * 60_000, now, "en").old, false);
  const old = updatedLine(now - 2 * 3_600_000, now, "de");
  assert.ok(old.old && old.updated.startsWith("Stand "));
  const view = suiteView("study", normalizeConfig("study", {}), { id: "1", kind: "study", ok: true, data: { due: 3, decks: [] } }, { ...options, fetchedAt: now - 5 * 60_000 });
  assert.ok(view.updated?.startsWith("Updated ") && view.old === false);
  const capture = suiteView("capture", normalizeConfig("capture", {}), { id: "1", kind: "capture", ok: true, data: { target: { id: PAGE, name: "Inbox" } } }, { ...options, fetchedAt: now });
  assert.equal(capture.updated, undefined);
  // iOS (expo-widgets): the live text's words around the duration.
  assert.deepEqual([freshness(now, now, "de").before, freshness(now, now, "en").after], ["vor", "ago"]);
});

test("Admin status: health, errors in the last hour, backup age, free disk – the light is the worst", () => {
  const summary = sampleAdminSummary(now);
  const status = adminStatusWidget({ kind: "data", data: summary }, "en", now);
  assert.deepEqual(status.rows.map((row) => row.id), ["health", "errors", "backup", "disk"]);
  assert.deepEqual(status.rows.map((row) => row.value), ["1 notice", "3", "3 h ago", "38 GB · 38%"]);
  assert.equal(status.light, "notice");
  assert.equal(status.title, "Admin status");
  // A failed backup turns it red; statistics off: no error count.
  const failed = adminStatusWidget({ kind: "data", data: { ...summary, health: { ...summary.health, state: "ok", notices: [] }, backup: { ...summary.backup, failed: true }, live: null } }, "en", now);
  assert.equal(failed.light, "problem");
  assert.equal(failed.rows[1].value, "–");
  const fine = adminStatusWidget({ kind: "data", data: { ...summary, health: { ...summary.health, state: "ok", notices: [] } } }, "de", now);
  assert.equal(fine.light, "ok");
  assert.equal(fine.lightLabel, "Alles in Ordnung");
});

test("iOS: one header, card and footer for every widget; the footer counts on its own", () => {
  const views = readFileSync(join(root, "plugins/widget-suite/ios/SuiteViews.swift"), "utf8");
  // The footer: a live relative text, the fetch time of the answer.
  assert.match(views, /let key: LocalizedStringKey = "\\\(Text\(fetched, style: \.relative\)\) ago"/);
  assert.match(views, /let fetched: Date = entry\.fetched \?\? entry\.date/);
  assert.match(views, /private var footer: Bool \{ entry\.kind != "capture" && !family\.isAccessory \}/);
  // Rows come from the height the family really has.
  assert.match(views, /struct FPCard<Content: View>: View \{[\s\S]*?GeometryReader \{ proxy in/);
  const provider = readFileSync(join(root, "plugins/widget-suite/ios/SuiteProvider.swift"), "utf8");
  assert.match(provider, /entry\.fetched = result\.at/);
  // An entry when the answer turns an hour old (the warning shows without a reload).
  assert.match(provider, /changes\.append\(fetched\.addingTimeInterval\(FPFooter\.staleAfter \+ 1\)\)/);
  // The refresh budget is the same as before.
  assert.match(provider, /case "capture": return 6 \* 3600\n\s+case "counter", "pinned", "metric", "deadline": return 3600\n\s+default: return 1800/);
  const shared = readFileSync(join(root, "modules/flowplan-native/ios/WidgetShared.swift"), "utf8");
  // The further answers of a widget are registered before the one request.
  assert.match(shared, /for extra in also \{ FPStore\.register\(extra, profile: session\.profile\) \}/);
  const widgets = readFileSync(join(root, "plugins/widget-suite/ios/SuiteWidgets.swift"), "utf8");
  assert.match(widgets, /kind: "FlowplanMyDay"/);
  assert.doesNotMatch(widgets, /FlowplanMentions|FlowplanForms/);
  assert.doesNotMatch(readFileSync(join(root, "plugins/widget-suite/ios/SuiteIntents.swift"), "utf8"), /FPMarkReadIntent/);
});
