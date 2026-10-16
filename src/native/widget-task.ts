// Android asks for its widgets in the background (added, every 30 minutes,
// resized). Registered at start-up (index.ts); runs without the app's UI.
import { getLocales } from "expo-localization";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { pickLocale, setLocale } from "../i18n";
import { store } from "../store";
import { inboxWidget, tasksWidget } from "../summary";
import { renderInbox, renderTasks } from "../widgets/android";
import { apply, fetchSummary } from "./sync";

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_DELETED" || widgetAction === "WIDGET_CLICK") return;
  const lang = pickLocale(getLocales().map((l) => l.languageTag));
  setLocale(lang);
  let summary = store.summary();
  // Fresh data for the regular update; added and resized widgets show at once.
  if (widgetAction === "WIDGET_UPDATE") {
    const result = await fetchSummary();
    if ("summary" in result) summary = result.summary;
    if ("signedOut" in result) summary = null;
    if (!("failed" in result)) await apply(summary);
  }
  renderWidget(
    widgetInfo.widgetName === "FlowplanInbox"
      ? renderInbox(inboxWidget(summary, lang))
      : renderTasks(tasksWidget(summary, lang), widgetInfo.height),
  );
}
