// The app's own settings: the profiles (switch, rename, add), notifications,
// the app lock, the active profile's offline copy on this device (#203: iOS
// from the copy the app keeps, Android from what the page reported; the
// way to Flowplan's Settings → Offline & devices), what the widgets and the
// timer do, and leaving the active profile's instance. Opened from the quick
// actions, the offline page or Flowplan's settings (window.FlowplanApp).
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Application from "expo-application";
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { locale, t } from "../i18n";
import { formatWhen } from "../admin";
import { activeProfile, type ProfileState } from "../profiles";
import { shortServer } from "../server";
import { store } from "../store";
import { Button, SheetBody, styles, usePalette } from "../ui";
import { askForPush, pushPermission, type PushState } from "../native/notifications";
import { ProfileList } from "./Profiles";
import { activityChoices, setActivityChoices } from "../native/activities";
import { lastWidgetActionError } from "../native/suite";
import type { ActionError } from "../widgets/actions";
import { canAddTile, requestAddTile } from "../../modules/flowplan-android/src";
import { copyLine, infoOfMarker, type CopyInfo } from "../offline-offer";
import { offlineCopy } from "../offline/native";
import { modalAnimation } from "../motion";
import { useMotion } from "../native/motion";

export function Settings({
  visible,
  profiles,
  signedIn,
  pushAvailable,
  onClose,
  onSwitch,
  onRename,
  onAddProfile,
  onForget,
  onPushChanged,
  onLockChanged,
  offlineInfo,
  onAskOffline,
  onOpenOffline,
}: {
  visible: boolean;
  profiles: ProfileState;
  signedIn: boolean;
  pushAvailable: boolean;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onAddProfile: () => void;
  onForget: () => void;
  onPushChanged: () => void;
  onLockChanged: () => void;
  // Android: what the page last reported of its copy (null: not known).
  offlineInfo: CopyInfo | null;
  // The page reports again (Android), and Flowplan's Settings → Offline & devices.
  onAskOffline: () => void;
  onOpenOffline: () => void;
}) {
  const p = usePalette();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const current = activeProfile(profiles);
  const [push, setPush] = useState<PushState>("undetermined");
  const [lock, setLock] = useState(store.appLock());
  const [lockAvailable, setLockAvailable] = useState(true);
  const [choices, setChoices] = useState(activityChoices);
  // What a widget's button last failed to do (status 0: not reached).
  const [widgetError, setWidgetError] = useState<ActionError | null>(null);
  // iOS: the copy the app keeps for the active profile (src/offline/store.ts);
  // undefined while it is read, null where the app keeps none.
  const [iosCopy, setIosCopy] = useState<CopyInfo | null | undefined>(undefined);

  const currentId = current?.id ?? "";
  const load = useCallback(async () => {
    setWidgetError(lastWidgetActionError());
    if (Platform.OS === "ios") {
      const copy = currentId ? offlineCopy(currentId) : null;
      const state = copy ? await copy.state().catch(() => null) : null;
      setIosCopy(state ? infoOfMarker(state.marker, state.bytes) : null);
    } else onAskOffline();
    setPush(await pushPermission());
    setLock(store.appLock());
    try {
      setLockAvailable((await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE);
    } catch {
      setLockAvailable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  async function toggleLock(on: boolean) {
    // Switching it on or off is confirmed like unlocking.
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t("unlockPrompt") }).catch(() => ({ success: false }));
    if (!result.success) return;
    store.setAppLock(on);
    setLock(on);
    onLockChanged();
  }

  async function allowPush() {
    const status = push === "undetermined" ? await askForPush() : push;
    if (status === "granted") onPushChanged();
    else await Linking.openSettings();
    setPush(await pushPermission());
  }

  const section = [settingsStyles.section, { backgroundColor: p.card, borderColor: p.line }];
  const heading = [settingsStyles.heading, { color: p.muted }];
  const pushText = !signedIn
    ? t("notificationsSignIn")
    : !pushAvailable
      ? t("notificationsUnavailable")
      : push === "granted"
        ? t("notificationsOn")
        : t("notificationsOff");

  return (
    <Modal visible={visible} animationType={modalAnimation(motion)} presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* The sides clear of the camera and the side status bar (landscape,
          the closed iPhone Duo); the list runs under the home indicator. */}
      <SheetBody style={{ backgroundColor: p.background }} edges={["left", "right"]}>
        <View style={[settingsStyles.bar, { paddingTop: Platform.OS === "android" ? insets.top + 8 : 14, borderColor: p.line }]}>
          <Text accessibilityRole="header" style={[settingsStyles.barTitle, { color: p.text }]}>
            {t("settingsTitle")}
          </Text>
          <Text accessibilityRole="button" onPress={onClose} style={[settingsStyles.done, { color: p.brand }]}>
            {t("done")}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, maxWidth: 640, width: "100%", alignSelf: "center" }}>
          <Text style={heading}>{t("profiles")}</Text>
          <ProfileList profiles={profiles.profiles} active={profiles.active} onSwitch={onSwitch} onRename={onRename} />
          <Text style={[styles.small, { color: p.muted, marginTop: 8, marginHorizontal: 4 }]}>{t("profilesText")}</Text>
          <Button title={t("addProfile")} kind="secondary" onPress={onAddProfile} style={{ marginTop: 12 }} />

          <Text style={heading}>{t("notifications")}</Text>
          <View style={section}>
            <Text style={[styles.text, { color: p.text }]}>{pushText}</Text>
            {signedIn && pushAvailable && push !== "granted" ? (
              <Button title={push === "undetermined" ? t("allowNotifications") : t("systemSettings")} onPress={allowPush} style={{ marginTop: 12 }} />
            ) : null}
          </View>

          <Text style={heading}>{t("offlineCopyTitle")}</Text>
          <View style={section}>
            <Text style={[styles.text, { color: p.text }]}>
              {Platform.OS === "ios" ? (iosCopy === undefined ? " " : copyLine(iosCopy, Date.now(), locale())) : copyLine(offlineInfo, Date.now(), locale())}
            </Text>
            {signedIn ? <Button title={t("offlineCopyOpen")} kind="secondary" onPress={onOpenOffline} style={{ marginTop: 12 }} /> : null}
          </View>

          <Text style={heading}>{t("appLock")}</Text>
          <View style={[section, settingsStyles.switchRow]}>
            <Text style={[styles.text, { color: lockAvailable ? p.text : p.muted, flex: 1, marginRight: 12 }]}>
              {lockAvailable ? t("appLockText", { method: t("biometrics") }) : t("appLockUnavailable")}
            </Text>
            <Switch value={lock} disabled={!lockAvailable} onValueChange={toggleLock} trackColor={{ true: p.brand }} accessibilityLabel={t("appLock")} />
          </View>

          <Text style={heading}>{t("widgetsTitle")}</Text>
          <View style={section}>
            <Text style={[styles.text, { color: p.text }]}>{t("widgetsText")}</Text>
            <Text style={[styles.small, { color: p.muted, marginTop: 8 }]}>
              {Platform.OS === "ios" ? t("liveActivityText") : t("timerNotificationText")}
            </Text>
            {widgetError ? (
              <Text style={[styles.small, { color: p.muted, marginTop: 8 }]} selectable>
                {t("widgetLastError", {
                  action: widgetError.action,
                  status: widgetError.status || "–",
                  message: widgetError.message,
                  when: formatWhen(widgetError.at, Date.now(), locale()),
                })}
              </Text>
            ) : null}
            {canAddTile() ? (
              <>
                <Text style={[styles.small, { color: p.muted, marginTop: 8 }]}>{t("tileText")}</Text>
                <Button title={t("tileAdd")} kind="secondary" onPress={() => requestAddTile(t("quickCaptureTitle"))} style={{ marginTop: 10 }} />
              </>
            ) : null}
          </View>

          <Text style={heading}>{Platform.OS === "ios" ? t("liveActivitiesTitle") : t("ongoingTitle")}</Text>
          <View style={section}>
            {(["meeting", "jobs", "incident"] as const).map((kind, index) => (
              <View key={kind} style={{ flexDirection: "row", alignItems: "center", marginTop: index ? 12 : 0 }}>
                <Text style={[styles.text, { color: p.text, flex: 1 }]}>
                  {t(({ meeting: "activityMeeting", jobs: "activityJobs", incident: "activityIncident" } as const)[kind])}
                </Text>
                <Switch
                  value={choices[kind]}
                  onValueChange={(on) => {
                    const next = { ...choices, [kind]: on };
                    setChoices(next);
                    setActivityChoices(next);
                  }}
                  trackColor={{ true: p.brand }}
                  accessibilityLabel={t(({ meeting: "activityMeeting", jobs: "activityJobs", incident: "activityIncident" } as const)[kind])}
                />
              </View>
            ))}
            <Text style={[styles.small, { color: p.muted, marginTop: 12 }]}>{t("activitiesText")}</Text>
          </View>

          <Button
            title={t("forget")}
            kind="danger"
            style={{ marginTop: 28 }}
            onPress={() =>
              Alert.alert(t("forget"), t("forgetConfirm", { server: shortServer(current?.server ?? ""), name: current?.name ?? "" }), [
                { text: t("cancel"), style: "cancel" },
                { text: t("forget"), style: "destructive", onPress: onForget },
              ])
            }
          />
          <Text style={[styles.small, { color: p.muted, textAlign: "center", marginTop: 18 }]}>
            {t("version", { version: `${Application.nativeApplicationVersion ?? ""} (${Application.nativeBuildVersion ?? ""})` })}
          </Text>
        </ScrollView>
      </SheetBody>
    </Modal>
  );
}

const settingsStyles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: { fontSize: 17, fontWeight: "700" },
  done: { fontSize: 17, fontWeight: "600", padding: 4 },
  heading: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  section: { borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  switchRow: { flexDirection: "row", alignItems: "center" },
});
