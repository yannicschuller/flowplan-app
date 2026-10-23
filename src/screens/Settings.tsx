// The app's own settings: the profiles (switch, rename, add), notifications,
// the app lock, what the widgets and the timer do, and leaving the active
// profile's instance. Opened from the quick
// actions, the offline page or Flowplan's settings (window.FlowplanApp).
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Application from "expo-application";
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { activeProfile, type ProfileState } from "../profiles";
import { shortServer } from "../server";
import { store } from "../store";
import { Button, styles, usePalette } from "../ui";
import { askForPush, pushPermission, type PushState } from "../native/notifications";
import { ProfileList } from "./Profiles";
import { activityChoices, setActivityChoices } from "../native/activities";

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
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const current = activeProfile(profiles);
  const [push, setPush] = useState<PushState>("undetermined");
  const [lock, setLock] = useState(store.appLock());
  const [lockAvailable, setLockAvailable] = useState(true);
  const [choices, setChoices] = useState(activityChoices);

  const load = useCallback(async () => {
    setPush(await pushPermission());
    setLock(store.appLock());
    try {
      setLockAvailable((await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE);
    } catch {
      setLockAvailable(false);
    }
  }, []);
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.background }}>
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
      </View>
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
