// Local reminders for due tasks when the instance sends no push (no Expo
// project in the build, MOBILE_PUSH=off, Android without Firebase): from the
// summary's tasks, one notification at 09:00 on the day each is due, and
// the daily study reminder of flashcards (planStudyReminder). Pure –
// src/native/local-reminders.ts schedules them.
import { studyOf, type Summary } from "./summary";

export const REMINDER_PREFIX = "flowplan-due-";
export const REMINDER_HOUR = 9;

export type PlannedReminder = { id: string; at: Date; text: string; page: string; url: string };

// Days ahead only (and today's, while 09:00 is still to come); at most as
// many as the summary brings (8).
export function planReminders(summary: Summary | null, now: Date, hour = REMINDER_HOUR): PlannedReminder[] {
  if (!summary) return [];
  const out: PlannedReminder[] = [];
  summary.tasks.items.forEach((item, index) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.due || "");
    if (!match) return;
    const at = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, 0, 0, 0);
    if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return;
    out.push({ id: `${REMINDER_PREFIX}${index}`, at, text: item.text, page: item.page, url: item.url });
  });
  return out;
}

// Flashcards (Flowplan docs/specs/flashcards.md §10.3): without push, the
// daily study reminder the person set on #study (summary.study.remindAt)
// as a reminder of the phone – today at that time, while it is still to
// come and cards are left. A summary later in the day plans it again (or
// not: studied, nothing left, switched off). The instance never sends one
// when it can push.
export const STUDY_REMINDER_ID = "flowplan-study-today";
export type PlannedStudyReminder = { id: string; at: Date; count: number; deck: string; url: string };
export function planStudyReminder(summary: Summary | null, now: Date): PlannedStudyReminder | null {
  const study = studyOf(summary);
  if (!study || !study.remindAt || study.due <= 0) return null;
  const [hour, minute] = study.remindAt.split(":").map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;
  return { id: STUDY_REMINDER_ID, at, count: study.due, deck: study.deck, url: "/#study" };
}
