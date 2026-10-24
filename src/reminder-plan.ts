// Local reminders for due tasks when the instance sends no push (no Expo
// project in the build, MOBILE_PUSH=off, Android without Firebase): from the
// summary's tasks, one notification at 09:00 on the day each is due. Pure –
// src/native/local-reminders.ts schedules them.
import type { Summary } from "./summary";

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
