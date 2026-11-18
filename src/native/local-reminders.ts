// Due tasks as reminders of the phone itself, when the instance cannot push
// (src/reminder-plan.ts). After every summary (sync.ts) the planned ones are
// replaced; signed out, or once push works, they go.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { t } from "../i18n";
import { planReminders, planStudyReminder, REMINDER_PREFIX, STUDY_REMINDER_ID } from "../reminder-plan";
import type { Summary } from "../summary";

const KEY = "flowplan.localReminders";
const CHANNEL = "reminders";
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// Set at each registration: true when the instance made no push subscription.
export function setLocalRemindersWanted(on: boolean) {
  try {
    if (on) SecureStore.setItem(KEY, "1", options);
    else void SecureStore.deleteItemAsync(KEY, options);
  } catch {}
}
const wanted = () => {
  try {
    return SecureStore.getItem(KEY, options) === "1";
  } catch {
    return false;
  }
};

export async function syncLocalReminders(summary: Summary | null) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.allSettled(
      scheduled.filter((n) => n.identifier.startsWith(REMINDER_PREFIX) || n.identifier === STUDY_REMINDER_ID).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (!summary || !wanted()) return;
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return;
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: t("channelReminders"),
        description: t("channelRemindersText"),
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    for (const reminder of planReminders(summary, new Date()))
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: t("reminderDueToday"), body: reminder.page ? `${reminder.text} – ${reminder.page}` : reminder.text, data: { url: reminder.url } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL },
      });
    // The daily study reminder of flashcards, at the time set on #study.
    const study = planStudyReminder(summary, new Date());
    if (study)
      await Notifications.scheduleNotificationAsync({
        identifier: study.id,
        content: { title: t("reminderStudy"), body: study.deck ? `${t("reminderStudyBody", { count: study.count })} – ${study.deck}` : t("reminderStudyBody", { count: study.count }), data: { url: study.url } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: study.at, channelId: CHANNEL },
      });
  } catch {}
}
