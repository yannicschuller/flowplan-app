// Flashcards (Flowplan docs/specs/flashcards.md §10.2, §10.3): the summary's
// optional `study` read tolerantly, the widget "Karten fällig", the link to
// #study, the phone's own study reminder without push, the quick action and
// app shortcut "Lernen".
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSummary, sampleSummary, studyOf, studyWidget, widgetProps, type Summary } from "../src/summary";
import { planStudyReminder, STUDY_REMINDER_ID } from "../src/reminder-plan";
import { pathOfAppLink, appLink } from "../src/navigation";
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

test("the widget “Karten fällig”: the number, the next deck, the streak, a tap opens #study", () => {
  const de = studyWidget(withCards, "de");
  assert.deepEqual(de, { signedIn: true, title: "Karten fällig", count: 12, label: "Spanisch A1", detail: "Serie: 4", url: appLink("/#study") });
  assert.equal(pathOfAppLink(de.url), "/#study");
  assert.deepEqual((["de", "en", "fr", "zh"] as const).map((lang) => studyWidget(withCards, lang).title), ["Karten fällig", "Cards due", "Cartes à réviser", "待复习卡片"]);
  const done = studyWidget({ ...base, study: { due: 0, new: 0, streak: 1 } }, "en");
  assert.equal(done.label, "All studied for today");
  assert.equal(done.detail, "Streak: 1");
  assert.equal(studyWidget({ ...base, study: { due: 2, new: 0, streak: 0 } }, "fr").label, "2 à réviser");
  assert.equal(studyWidget(base, "en").label, "No flashcards yet");
  const signedOut = studyWidget(null, "de");
  assert.equal(signedOut.signedIn, false);
  assert.equal(pathOfAppLink(signedOut.url), "/");
  for (const lang of ["de", "en", "fr", "zh"] as const) {
    const props = widgetProps(studyWidget(sampleSummary(lang), lang));
    assert.ok(props.count > 0 && props.label, lang);
  }
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
