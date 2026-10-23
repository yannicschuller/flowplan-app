import { test } from "node:test";
import assert from "node:assert/strict";
import { configKey, DEFAULTS, kindOfWidget, needsSetup, normalizeConfig, serverConfig, SUITE_KINDS, SUITE_WIDGETS } from "../src/widgets/suite";
import { widgetAction, widgetData, widgetOptions, type WidgetRequest } from "../src/widgets/api";
import { captureLink, formatHours, pageLink, sampleResult, suiteView } from "../src/widgets/present";
import { strings } from "../src/i18n";

const PAGE = "3f2b8c1e-7d4a-4b6e-9a1c-2e5f6a7b8c9d";
const ROW = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

// No null and no undefined anywhere: iOS keeps props in a property list.
function assertNoNull(value: unknown, path = "$") {
  assert.notEqual(value, null, `${path} is null`);
  assert.notEqual(value, undefined, `${path} is undefined`);
  if (Array.isArray(value)) value.forEach((item, i) => assertNoNull(item, `${path}[${i}]`));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) assertNoNull(item, `${path}.${key}`);
}

test("every kind has a widget and a working default", () => {
  for (const kind of SUITE_KINDS) {
    assert.equal(kindOfWidget(SUITE_WIDGETS[kind]), kind);
    assert.deepEqual(normalizeConfig(kind, undefined), DEFAULTS[kind]);
  }
  assert.equal(kindOfWidget("FlowplanTasks"), null);
  // Only the counter and the form inbox need a page before they show something.
  assert.deepEqual(
    SUITE_KINDS.filter((kind) => needsSetup(kind, normalizeConfig(kind, {}))),
    ["counter", "forms"],
  );
});

test("settings are checked: unknown values fall back, ids must be ids", () => {
  assert.deepEqual(normalizeConfig("tasks", { source: "view", pageId: PAGE.toUpperCase(), viewId: "v1", filter: "today", max: 40 }), {
    source: "view",
    pageId: PAGE,
    viewId: "v1",
    filter: "today",
    max: 10,
  });
  // A view without a database is "my tasks".
  assert.deepEqual(normalizeConfig("tasks", { source: "view", pageId: "../etc", filter: "soon", max: "3" }), { source: "mine", filter: "open", max: 3 });
  assert.deepEqual(normalizeConfig("capture", { buttons: ["photo", "note", "fax"] }), { buttons: ["note", "photo"] });
  assert.deepEqual(normalizeConfig("capture", { buttons: [] }).buttons, ["note", "task", "voice", "photo"]);
  assert.deepEqual(normalizeConfig("pinned", { mode: "page", pageId: PAGE, properties: ["a", "b", "c", "a"] }), {
    mode: "page",
    pageId: PAGE,
    properties: ["a", "b"],
    max: 6,
  });
  assert.equal(normalizeConfig("pinned", { mode: "page" }).mode, "favorites");
  // Sum without a number property counts instead.
  assert.equal(normalizeConfig("counter", { pageId: PAGE, aggregate: "sum" }).aggregate, "count");
  assert.deepEqual(normalizeConfig("counter", { pageId: PAGE, aggregate: "average", fieldId: "f", groupValue: "x" }), {
    pageId: PAGE,
    aggregate: "average",
    fieldId: "f",
    history: true,
  });
  assert.equal(normalizeConfig("calendar", { sources: [{ pageId: PAGE, viewId: "cal" }, { pageId: "x" }, null] }).sources.length, 1);
  assert.deepEqual(normalizeConfig("time", { timer: { pageId: PAGE, rowId: ROW, fieldId: "t" } }), { timer: { pageId: PAGE, rowId: ROW, fieldId: "t" } });
  assert.deepEqual(normalizeConfig("time", { timer: { pageId: PAGE } }), {});
  assert.equal(normalizeConfig("forms", { pageId: PAGE, max: 9 }).max, 5);
  // App-only settings stay on the phone.
  assert.deepEqual(serverConfig("capture", normalizeConfig("capture", { targetId: PAGE, buttons: ["note"] })), { targetId: PAGE });
  assert.deepEqual(serverConfig("time", normalizeConfig("time", { timer: { pageId: PAGE, rowId: ROW, fieldId: "t" } })), {});
});

test("widgets with the same settings share a key, in any order", () => {
  assert.equal(configKey("tasks", { filter: "today", max: 5 }), configKey("tasks", { max: 5, filter: "today" }));
  assert.notEqual(configKey("tasks", { max: 5 }), configKey("mentions", { max: 5 }));
});

type Call = { url: string; init: { method?: string; headers: Record<string, string>; body?: unknown } };
function fakeFetch(answer: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: Call["init"]) => {
    const call = { url, init };
    calls.push(call);
    const { status, body } = answer(call);
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { calls, fetcher };
}
const connection = { server: "https://flowplan.example", token: "fpd_x", lang: "de" };

test("one batched data request; equal settings asked once; split above 16", async () => {
  const { calls, fetcher } = fakeFetch(({ init }) => {
    const body = JSON.parse(String(init.body)) as { widgets: WidgetRequest[] };
    return { status: 200, body: { widgets: body.widgets.map((w) => ({ id: w.id, kind: w.kind, ok: true, data: { title: w.kind } })) } };
  });
  const widgets: WidgetRequest[] = [
    { id: "1", kind: "tasks", config: { filter: "today", max: 5 } },
    { id: "2", kind: "tasks", config: { max: 5, filter: "today" } },
    { id: "3", kind: "mentions", config: {} },
  ];
  const result = await widgetData(connection, widgets, { today: "2026-10-22", zone: "Europe/Berlin" }, fetcher);
  assert.ok(result.ok);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://flowplan.example/api/mobile/widgets/data?lang=de");
  assert.equal(calls[0].init.headers.Authorization, "Bearer fpd_x");
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.widgets.length, 2);
  assert.equal(sent.today, "2026-10-22");
  assert.equal(sent.zone, "Europe/Berlin");
  assert.deepEqual([...(result.ok ? result.value.keys() : [])], ["1", "2", "3"]);

  const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), kind: "tasks" as const, config: { max: (i % 10) + 1, filter: i < 10 ? "open" : "today" } }));
  const before = calls.length;
  const split = await widgetData(connection, many, { today: "2026-10-22", zone: "UTC" }, fetcher);
  assert.equal(calls.length - before, 2);
  assert.ok(split.ok && split.value.size === 20);
});

test("401 means signed out; errors carry the instance's sentence", async () => {
  const signedOut = fakeFetch(() => ({ status: 401, body: { error: "Bitte melde dich an." } }));
  assert.deepEqual(await widgetData(connection, [{ id: "1", kind: "time", config: {} }], { today: "2026-10-22", zone: "UTC" }, signedOut.fetcher), {
    ok: false,
    signedOut: true,
  });
  const limited = fakeFetch(() => ({ status: 429, body: { error: "Zu viele Anfragen." } }));
  assert.deepEqual(await widgetAction(connection, "timer.stop", {}, limited.fetcher), { ok: false, status: 429, error: "Zu viele Anfragen." });
});

test("actions post the action with its fields; options ask for the kind", async () => {
  const { calls, fetcher } = fakeFetch(() => ({ status: 200, body: { ok: true, action: "task.complete", done: true } }));
  const result = await widgetAction(connection, "task.complete", { source: "row", pageId: PAGE, rowId: ROW }, fetcher);
  assert.ok(result.ok);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { source: "row", pageId: PAGE, rowId: ROW, action: "task.complete" });
  await widgetOptions(connection, "tasks", PAGE, fetcher);
  assert.equal(calls[1].url, `https://flowplan.example/api/mobile/widgets/options?kind=tasks&pageId=${PAGE}&lang=de`);
});

const today = "2026-10-22";
const options = { locale: "en" as const, today, signedIn: true, now: Date.parse("2026-10-22T10:00:00Z") };

test("every kind maps its answer to a view without null, also the samples", () => {
  for (const kind of SUITE_KINDS)
    for (const locale of ["de", "en", "fr"] as const) {
      const config = normalizeConfig(kind, kind === "counter" || kind === "forms" ? { pageId: PAGE } : {});
      const view = suiteView(kind, config, sampleResult(kind, locale, today, options.now), { ...options, locale });
      assert.notEqual(view.state, "closed", `${kind} ${locale}`);
      assertNoNull(view);
    }
});

test("answers with null fields still give finished texts", () => {
  const view = suiteView(
    "tasks",
    normalizeConfig("tasks", {}),
    {
      id: "x",
      kind: "tasks",
      ok: true,
      data: {
        title: "My tasks",
        total: 2,
        items: [
          { source: "row", pageId: PAGE, rowId: ROW, text: "Call Ben", due: null, page: "CRM", url: "/#page=" + PAGE, canEdit: true },
          { source: "doc", pageId: PAGE, rowId: null, index: 3, text: "Read", due: "2026-10-21", page: "Notes", url: "javascript:alert(1)", canEdit: false },
        ],
      },
    },
    options,
  );
  assertNoNull(view);
  assert.equal(view.state, "tasks");
  if (view.state !== "tasks") return;
  assert.equal(view.headline, "2 open");
  assert.deepEqual(view.items[0].complete, { source: "row", pageId: PAGE, rowId: ROW, text: "Call Ben" });
  // No rowId: left out; may not edit: no checkbox.
  assert.equal(view.items[1].complete, undefined);
  assert.equal(view.items[1].late, true);
  assert.equal(view.items[1].due, "Yesterday");
  // Only paths of the instance open; anything else the start page.
  assert.equal(view.items[1].url, "flowplan://open?path=%2F");
  assert.equal(view.items[0].url, `flowplan://open?path=${encodeURIComponent("/#page=" + PAGE)}`);
});

test("signed out, not set up, gone, locked and encrypted widgets say so and show no content", () => {
  const tasks = normalizeConfig("tasks", {});
  assert.equal(suiteView("tasks", tasks, null, { ...options, signedIn: false }).state, "closed");
  const signedOut = suiteView("tasks", tasks, null, { ...options, signedIn: false });
  assert.ok(signedOut.state === "closed" && signedOut.message === "Open Flowplan to sign in" && signedOut.url === "flowplan://open?path=%2F");
  const setup = suiteView("counter", normalizeConfig("counter", {}), null, options);
  assert.ok(setup.state === "closed" && setup.reason === "setup");
  const gone = suiteView("tasks", tasks, { id: "x", kind: "tasks", ok: false, status: 404, error: "Seite nicht gefunden." }, options);
  assert.ok(gone.state === "closed" && gone.reason === "gone");
  const locked = suiteView("pinned", normalizeConfig("pinned", { pageId: PAGE }), { id: "x", kind: "pinned", ok: true, data: { title: "Journal", locked: true, url: "/", items: [] } }, options);
  assert.ok(locked.state === "closed" && locked.reason === "locked" && locked.title === "Journal");
  const encrypted = suiteView("counter", normalizeConfig("counter", { pageId: PAGE }), { id: "x", kind: "counter", ok: true, data: { title: "", encrypted: true } }, options);
  assert.ok(encrypted.state === "closed" && encrypted.reason === "encrypted" && encrypted.title === "Database counter");
  // A protected favorite keeps its place but shows no title.
  const favorites = suiteView(
    "pinned",
    normalizeConfig("pinned", {}),
    { id: "x", kind: "pinned", ok: true, data: { title: "Favorites", items: [{ id: PAGE, kind: "journal", title: "", encrypted: true, url: "/" }] } },
    options,
  );
  assert.ok(favorites.state === "list" && favorites.items[0].title === "Encrypted");
  const journal = suiteView(
    "journal",
    normalizeConfig("journal", {}),
    { id: "x", kind: "journal", ok: true, data: { title: "Journal", journal: { id: PAGE, name: "", encrypted: true, written: true, streak: 3 }, habits: { id: PAGE, locked: true } } },
    options,
  );
  assert.ok(journal.state === "journal" && journal.journal?.name === "Journal and habits" && journal.habits?.items.length === 0);
});

test("time, counter, capture and mentions details", () => {
  assert.equal(formatHours(1.5), "1:30 h");
  assert.equal(formatHours(0), "0:00 h");
  const time = suiteView("time", normalizeConfig("time", {}), {
    id: "t",
    kind: "time",
    ok: true,
    data: { title: "Time", today: 1, week: 2, days: [], timer: null, recent: [{ pageId: PAGE, rowId: ROW, fieldId: "f", title: "Offer", database: "Work" }] },
  }, options);
  assert.ok(time.state === "time" && time.start?.rowId === ROW && !time.timer);
  const counter = suiteView("counter", normalizeConfig("counter", { pageId: PAGE }), sampleResult("counter", "en", today), options);
  assert.ok(counter.state === "counter" && counter.history.length === 14 && counter.estimated === "History partly estimated");
  const capture = suiteView("capture", normalizeConfig("capture", { buttons: ["voice", "note"] }), { id: "c", kind: "capture", ok: true, data: { title: "Capture", target: { id: PAGE, name: "Inbox" }, voice: false } }, options);
  assert.ok(capture.state === "capture");
  if (capture.state === "capture") assert.deepEqual(capture.buttons.map((b) => b.id), ["note"]);
  assert.equal(captureLink("voice", PAGE), `flowplan://capture?mode=voice&target=${PAGE}`);
  const gone = suiteView("capture", normalizeConfig("capture", {}), { id: "c", kind: "capture", ok: true, data: { title: "Capture", target: null } }, options);
  assert.ok(gone.state === "closed" && gone.reason === "gone");
  assert.equal(pageLink(42), "flowplan://open?path=%2F");
});

test("every text of the app exists in German, English and French", () => {
  const keys = Object.keys(strings.de).sort();
  assert.deepEqual(Object.keys(strings.en).sort(), keys);
  assert.deepEqual(Object.keys(strings.fr).sort(), keys);
  for (const lang of ["de", "en", "fr"] as const)
    for (const key of keys) {
      const text = strings[lang][key as keyof typeof strings.de];
      assert.ok(text.trim(), `${lang}.${key} is empty`);
      // The same placeholders in every language.
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(names(text), names(strings.de[key as keyof typeof strings.de]), `${lang}.${key}`);
    }
});

test("the widgets' session follows the active profile; signing out keeps it without token", async () => {
  const { widgetSessionFor } = await import("../src/widgets/suite");
  const { addProfile, switchProfile } = await import("../src/profiles");
  let state = addProfile({ profiles: [], active: null }, { server: "https://work.example", name: "Work" }, "work").state;
  state = addProfile(state, { server: "https://home.example", name: "Home" }, "home").state;
  assert.deepEqual(widgetSessionFor(state, "fpd_home", "de"), { server: "https://home.example", token: "fpd_home", profile: "home", lang: "de" });
  // Switched: another profile, its own token (none until it registered).
  state = switchProfile(state, "work");
  assert.deepEqual(widgetSessionFor(state, null, "fr"), { server: "https://work.example", token: null, profile: "work", lang: "fr" });
  assert.equal(widgetSessionFor({ profiles: [], active: null }, "fpd_x", "en"), null);
});
