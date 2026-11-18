// The profile switcher (profile-picker.ts): the app's own sheet of its
// profiles – a bottom sheet on the phone, a form sheet on the iPad. Each
// profile with its name and address, the active one checked (ProfileList,
// as in the app settings); tapping another one switches exactly as
// everywhere else (App.tsx switchTo). Below: add a profile (the profile
// screen) and manage them (the app settings). Opened from Flowplan's
// "Instanz wechseln …", a long press on the account row, the icon's quick
// action and ⇧⌘P; the page learns nothing of it.
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import type { ProfileState } from "../profiles";
import { Button, SheetBody, usePalette } from "../ui";
import { modalAnimation } from "../motion";
import { useMotion } from "../native/motion";
import { ProfileList } from "./Profiles";

export function ProfileSwitcher({
  visible,
  profiles,
  onSwitch,
  onAdd,
  onManage,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  profiles: ProfileState;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
  onClose: () => void;
  // iOS: the sheet is gone (the next screen may be presented now).
  onDismiss: () => void;
}) {
  const p = usePalette();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const pad = Platform.OS === "ios" && Platform.isPad;

  const content = (
    <>
      <View style={sheetStyles.bar}>
        <Text accessibilityRole="header" style={[sheetStyles.title, { color: p.text }]}>
          {t("switchProfile")}
        </Text>
        <Text accessibilityRole="button" onPress={onClose} style={[sheetStyles.done, { color: p.brand }]}>
          {t("done")}
        </Text>
      </View>
      <ScrollView style={sheetStyles.scroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <ProfileList profiles={profiles.profiles} active={profiles.active} onSwitch={onSwitch} />
      </ScrollView>
      <View style={[sheetStyles.actions, { paddingBottom: (pad ? 16 : insets.bottom) + 12 }]}>
        <Button title={t("switcherAdd")} kind="secondary" onPress={onAdd} />
        <Button title={t("switcherManage")} kind="secondary" onPress={onManage} />
      </View>
    </>
  );

  // iPad: a form sheet in the middle of the window.
  if (pad)
    return (
      <Modal visible={visible} animationType={modalAnimation(motion)} presentationStyle="formSheet" onRequestClose={onClose} onDismiss={onDismiss}>
        <SheetBody style={{ backgroundColor: p.background, paddingTop: 14 }}>{content}</SheetBody>
      </Modal>
    );
  // Phone: a sheet from the bottom over the dimmed page; a tap beside it closes.
  return (
    <Modal visible={visible} transparent animationType={modalAnimation(motion)} onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent navigationBarTranslucent>
      <View style={sheetStyles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("done")} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          accessibilityViewIsModal
          style={[
            sheetStyles.sheet,
            { backgroundColor: p.background, borderColor: p.line, paddingLeft: insets.left, paddingRight: insets.right, maxHeight: "85%" },
          ]}
        >
          <View style={[sheetStyles.grabber, { backgroundColor: p.line }]} />
          {content}
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, paddingTop: 8, width: "100%", maxWidth: 640, alignSelf: "center" },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 6 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: "700" },
  done: { fontSize: 17, fontWeight: "600", padding: 4 },
  scroll: { flexGrow: 0 },
  actions: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
});
