// The app's own settings: the instance, notifications, the app lock, what the
// widgets and the timer do, and leaving the instance. Opened from the quick
// actions, the offline page or Flowplan's settings (window.FlowplanApp).
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Application from "expo-application";
import * as LocalAuthentication from "expo-local-authentication";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { shortServer } from "../server";
import { store } from "../store";
import { Button, styles, usePalette } from "../ui";
import { askForPush, pushPermission, type PushState } from "../native/notifications";

export function Settings({
  visible,
  server,
  signedIn,
  pushAvailable,
  onClose,
  onChangeServer,
  onForget,
  onPushChanged,
}: {
  visible: boolean;
  server: string;
  signedIn: boolean;
  pushAvailable: boolean;
  onClose: () => void;
  onChangeServer: () => void;
  onForget: () => void;
  onPushChanged: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [push, setPush] = useState<PushState>("undetermined");
  const [lock, setLock] = useState(store.appLock());
  const [lockAvailable, setLockAvailable] = useState(true);

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
          <Text style={heading}>{t("server")}</Text>
          <View style={section}>
            <Text style={[styles.text, { color: p.text }]}>{shortServer(server)}</Text>
            <Button title={t("changeServer")} kind="secondary" onPress={onChangeServer} style={{ marginTop: 12 }} />
          </View>

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

          <Button
            title={t("forget")}
            kind="danger"
            style={{ marginTop: 28 }}
            onPress={() =>
              Alert.alert(t("forget"), t("forgetConfirm", { server: shortServer(server) }), [
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
