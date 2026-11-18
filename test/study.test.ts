// Flashcards (Flowplan docs/specs/flashcards.md §10.2, §10.3): the summary's
// optional `study` read tolerantly, the widget "Karten fällig", the link to
// #study, the phone's own study reminder without push, the quick action and
// app shortcut "Lernen".
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSummary, studyOf, type Summary } from "../src/summary";
import { sampleResult, suiteView } from "../src/widgets/present";
import { DEFAULTS, normalizeConfig, serverConfig, SUITE_WIDGETS, kindOfWidget } from "../src/widgets/suite";
import { widgetData, type Connection } from "../src/widgets/api";
import { planStudyReminder, STUDY_REMINDER_ID } from "../src/reminder-plan";
import { appLink, pathOfAppLink } from "../src/navigation";
import { shortcutList, shortcutOfLink } from "../src/android/shortcut-list";

const base: Summary = {
  name: "Ada",
  unread: 0,
  tasks: { due: 0, overdue: 0, open: 0, items: [] },
  timer: null,
  today: "2026-11-18",
  at: 1,
};
const withCards: Summary = { ...base, study: { due: 12, new: 5, streak: 4, deck: "Spanisch A1", remindAt: "18:00" } };

test("the summary takes `study` when it is there and works without it", () => {
  assert.ok(isSummary(base));
  assert.ok(isSummary(withCards));
  assert.equal(studyOf(base), null);
  assert.deepEqual(studyOf(withCards), { due: 12, new: 5, streak: 4, deck: "Spanisch A1", remindAt: "18:00" });
  // Broken values count as none; extra fields are left alone.
  assert.equal(studyOf({ ...base, study: { due: "12" } } as unknown as Summary), null);
  assert.equal(studyOf({ ...base, study: { due: -1, new: 0, streak: 0 } }), null);
  assert.equal(studyOf({ ...base, study: { due: 3, new: 9, streak: 0, remindAt: "25:00", extra: 1 } } as unknown as Summary)?.remindAt, null);
  assert.equal(studyOf({ ...base, study: { due: 3, new: 9, streak: 0 } })?.new, 3);
  assert.ok(isSummary({ ...base, study: null }));
});

const answer = (data: Record<string, unknown>) => ({ id: "w", kind: "study", ok: true as const, data });
const options = { locale: "de" as const, today: "2026-11-18", signedIn: true };
const cards = {
  title: "Karten fällig",
  due: 12,
  new: 5,
  streak: 4,
  decks: [
    { pageId: "11111111-1111-4111-8111-111111111111", title: "Spanisch A1", due: 8, new: 3, url: "/#page=11111111-1111-4111-8111-111111111111" },
    { pageId: "22222222-2222-4222-8222-222222222222", title: "Anatomie", due: 4, new: 2, url: "/#page=22222222-2222-4222-8222-222222222222" },
  ],
  more: 0,
  url: "/#study",
};

test("the widget “Karten fällig”: the number, the next deck, the streak, a tap opens #study", () => {
  assert.equal(kindOfWidget("FlowplanStudy"), "study");
  assert.equal(SUITE_WIDGETS.study, "FlowplanStudy");
  const view = suiteView("study", DEFAULTS.study, answer(cards), options);
  assert.equal(view.state, "study");
  if (view.state !== "study") return;
  assert.equal(view.title, "Karten fällig");
  assert.equal(view.count, "12");
  assert.equal(view.label, "Spanisch A1");
  assert.equal(view.detail, "Serie: 4");
  assert.equal(pathOfAppLink(view.url), "/#study");
  assert.deepEqual(view.decks.map((d) => [d.title, d.due]), [["Spanisch A1", "8"], ["Anatomie", "4"]]);
  assert.equal(pathOfAppLink(view.decks[0].url), "/#page=11111111-1111-4111-8111-111111111111");
  const done = suiteView("study", DEFAULTS.study, answer({ ...cards, due: 0, streak: 1, decks: [] }), { ...options, locale: "en" });
  assert.ok(done.state === "study" && done.label === "All studied for today" && done.detail === "Streak: 1");
  const fr = suiteView("study", DEFAULTS.study, answer({ ...cards, decks: [], due: 2, streak: 0 }), { ...options, locale: "fr" });
  assert.ok(fr.state === "study" && fr.label === "2 à réviser" && fr.detail === "");
  const signedOut = suiteView("study", DEFAULTS.study, null, { ...options, signedIn: false });
  assert.equal(signedOut.state, "closed");
  assert.equal(pathOfAppLink(signedOut.url), "/");
  for (const lang of ["de", "en", "fr", "zh"] as const) {
    const sample = suiteView("study", DEFAULTS.study, sampleResult("study", lang, options.today), { ...options, locale: lang });
    assert.ok(sample.state === "study" && Number(sample.count) > 0 && sample.label && sample.decks.length, lang);
  }
});

test("#352: the widget's decks – none chosen counts all of them", () => {
  const a = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.deepEqual(normalizeConfig("study", undefined), { pageIds: [] });
  assert.deepEqual(normalizeConfig("study", { pageIds: [a, b, a.toLowerCase(), "not-a-page", 7] }), { pageIds: [a.toLowerCase(), b] });
  const many = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(normalizeConfig("study", { pageIds: many }).pageIds.length, 20);
  // As the instance takes it (lib/mobile-widget-schema.ts: pageIds optional).
  assert.deepEqual(serverConfig("study", normalizeConfig("study", {})), {});
  assert.deepEqual(serverConfig("study", normalizeConfig("study", { pageIds: [b] })), { pageIds: [b] });
});

test("#352: an instance that refuses a kind (400) costs only that widget its answer", async () => {
  const connection: Connection = { server: "https://flowplan.example", token: "t", lang: "de" };
  const bodies: { widgets: { id: string; kind: string }[] }[] = [];
  const fetcher = async (_url: string, init: { body?: string | FormData }) => {
    const body = JSON.parse(String(init.body)) as { widgets: { id: string; kind: string }[] };
    bodies.push(body);
    if (body.widgets.some((w) => w.kind === "study")) return { status: 400, ok: false, json: async () => ({ error: "invalid" }) };
    return { status: 200, ok: true, json: async () => ({ widgets: body.widgets.map((w) => ({ id: w.id, kind: w.kind, ok: true, data: { title: w.kind } })) }) };
  };
  const result = await widgetData(
    connection,
    [
      { id: "1", kind: "tasks", config: { source: "mine" } },
      { id: "2", kind: "study", config: {} },
    ],
    { today: "2026-11-18", zone: "Europe/Berlin" },
    fetcher,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.get("1")?.ok, true);
  assert.deepEqual({ ...result.value.get("2"), id: "2" }, { id: "2", kind: "study", ok: false, status: 400, error: "invalid" });
  assert.equal(bodies.length, 3);
});

test("the study reminder of the phone: today at the time set, while cards are left", () => {
  const morning = new Date(2026, 10, 18, 9, 0);
  const planned = planStudyReminder(withCards, morning)!;
  assert.equal(planned.id, STUDY_REMINDER_ID);
  assert.equal(planned.at.getHours(), 18);
  assert.equal(planned.at.getDate(), 18);
  assert.equal(planned.count, 12);
  assert.equal(planned.url, "/#study");
  // Past the time, nothing left, switched off, no decks: none.
  assert.equal(planStudyReminder(withCards, new Date(2026, 10, 18, 18, 30)), null);
  assert.equal(planStudyReminder({ ...withCards, study: { ...withCards.study!, due: 0 } }, morning), null);
  assert.equal(planStudyReminder({ ...withCards, study: { ...withCards.study!, remindAt: null } }, morning), null);
  assert.equal(planStudyReminder(base, morning), null);
  assert.equal(planStudyReminder(null, morning), null);
});

test("“Lernen” among the app shortcuts once there are flashcards", () => {
  const without = shortcutList({ signedIn: true, profile: "p", recent: [] }).map((s) => s.id);
  assert.ok(!without.includes("study"));
  const list = shortcutList({ signedIn: true, profile: "p", recent: [], study: true });
  const study = list.find((s) => s.id === "study")!;
  assert.equal(pathOfAppLink(study.url), "/#study");
  assert.deepEqual(list.map((s) => s.id).slice(0, 3), ["inbox", "tasks", "study"]);
  assert.equal(shortcutOfLink(appLink("/#study"), "p"), "study");
  assert.ok(!shortcutList({ signedIn: false, profile: "p", recent: [], study: true }).some((s) => s.id === "study"));
});
