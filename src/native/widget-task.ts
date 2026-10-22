// Android asks for its widgets in the background (added, every 30 minutes,
// resized). Registered at start-up (index.ts); runs without the app's UI.
import { getLocales } from "expo-localization";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { pickLocale, setLocale } from "../i18n";
import { store } from "../store";
import { inboxWidget, tasksWidget } from "../summary";
import { adminLiveWidget, adminStatusWidget, adminStorageWidget } from "../admin";
import { renderAdminLive, renderAdminStatus, renderAdminStorage, renderInbox, renderTasks } from "../widgets/android";
import { adminStateFor, apply, fetchSummary } from "./sync";

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === "WIDGET_DELETED" || widgetAction === "WIDGET_CLICK") return;
  const lang = pickLocale(getLocales().map((l) => l.languageTag));
  setLocale(lang);
  let summary = store.summary(),
    admin = store.adminState();
  // Fresh data for the regular update; added and resized widgets show at once.
  if (widgetAction === "WIDGET_UPDATE") {
    const result = await fetchSummary();
    if ("summary" in result) {
      summary = result.summary;
      admin = await adminStateFor(summary);
    }
    if ("signedOut" in result) {
      summary = null;
      admin = null;
    }
    if (!("failed" in result)) await apply(summary, admin);
  }
  const name = widgetInfo.widgetName;
  renderWidget(
    name === "FlowplanInbox"
      ? renderInbox(inboxWidget(summary, lang))
      : name === "FlowplanInstance"
        ? renderAdminStatus(adminStatusWidget(admin, lang))
        : name === "FlowplanLive"
          ? renderAdminLive(adminLiveWidget(admin, lang), widgetInfo.height)
          : name === "FlowplanStorage"
            ? renderAdminStorage(adminStorageWidget(admin, lang))
            : renderTasks(tasksWidget(summary, lang), widgetInfo.height),
  );
}
