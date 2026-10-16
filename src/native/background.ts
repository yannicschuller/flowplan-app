// Refreshes widgets, badge and timer while the app is closed, as often as the
// system allows (at least 30 minutes apart; iOS decides by usage). Defined at
// start-up (index.ts), before the app's UI.
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { setLocale, pickLocale } from "../i18n";
import { getLocales } from "expo-localization";
import { refresh } from "./sync";

const TASK = "flowplan-refresh";

export function defineBackgroundRefresh() {
  TaskManager.defineTask(TASK, async () => {
    try {
      setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
      const result = await refresh();
      return "failed" in result ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function scheduleBackgroundRefresh(on: boolean) {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (on && !registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 30 });
    if (!on && registered) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {}
}
