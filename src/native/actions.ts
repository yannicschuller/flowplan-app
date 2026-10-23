// Small native services for the page: files to the share sheet, haptic taps,
// and the quick actions on the app icon.
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as QuickActions from "expo-quick-actions";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { t } from "../i18n";

// A file from the page (export, backup, download) goes to the share sheet:
// "Save to Files", AirDrop, other apps.
export async function saveFile(name: string, base64: string, mime: string) {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "download";
  const file = new File(Paths.cache, safe);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: "base64" });
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(file.uri, { mimeType: mime || undefined, dialogTitle: t("saveFile") });
  } catch {}
}

export function haptic(kind: string) {
  if (kind === "success") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === "warning") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else if (kind === "error") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// Long press on the app icon. Paths open in the instance (hash routes of the
// web app), links the app's own screens (capture: a note, a voice memo);
// "server" opens the profiles (switch or add one). iOS shows the first four.
export function setQuickActions(signedIn: boolean) {
  const ios = Platform.OS === "ios";
  const items: QuickActions.Action[] = [
    ...(signedIn
      ? [
          { id: "inbox", title: t("actionInbox"), icon: ios ? "symbol:tray" : null, params: { path: "/#inbox" } },
          { id: "tasks", title: t("actionTasks"), icon: ios ? "symbol:checklist" : null, params: { path: "/#tasks" } },
          { id: "search", title: t("actionSearch"), icon: ios ? "symbol:magnifyingglass" : null, params: { path: "/#search" } },
          { id: "note", title: t("actionNote"), icon: ios ? "symbol:square.and.pencil" : null, params: { link: "flowplan://capture?mode=note" } },
        ]
      : []),
    { id: "server", title: t("switchProfile"), icon: ios ? "symbol:server.rack" : null, params: { path: "" } },
    ...(signedIn ? [{ id: "voice", title: t("actionVoice"), icon: ios ? "symbol:mic" : null, params: { link: "flowplan://capture?mode=voice&record=1" } }] : []),
  ];
  void QuickActions.setItems(items).catch(() => {});
}

export function onQuickAction(listener: (action: { id: string; path: string; link: string }) => void) {
  const handle = (action: QuickActions.Action) =>
    listener({ id: action.id, path: String(action.params?.path ?? ""), link: String(action.params?.link ?? "") });
  if (QuickActions.initial) handle(QuickActions.initial);
  return QuickActions.addListener(handle);
}
