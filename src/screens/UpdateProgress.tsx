// Android outside the stores: the update downloading in the app
// (src/android-update.ts) – a small sheet from the bottom with the version,
// a bar, the megabytes so far and "Cancel". Back cancels too; nothing else
// closes it. The installer opens when the download is done and checked.
import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { Button, usePalette } from "../ui";
import { modalAnimation } from "../motion";
import { useMotion } from "../native/motion";
import { cancelUpdate, currentUpdateProgress, onUpdateProgress } from "../android-update";
import { megabytes, progressOf } from "../android/update-check";

export function UpdateProgress({ hidden }: { hidden: boolean }) {
  const p = usePalette();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(currentUpdateProgress);
  useEffect(() => onUpdateProgress(setProgress), []);
  if (Platform.OS !== "android") return null;

  const fraction = progress ? progressOf(progress.received, progress.total) : null;
  const amount = !progress
    ? ""
    : fraction === null
      ? t("updateProgressUnknown", { received: megabytes(progress.received) })
      : t("updateProgress", { received: megabytes(progress.received), total: megabytes(progress.total) });
  return (
    <Modal visible={!!progress && !hidden} transparent animationType={modalAnimation(motion)} onRequestClose={cancelUpdate} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: p.background, borderColor: p.line, paddingLeft: insets.left + 16, paddingRight: insets.right + 16, paddingBottom: insets.bottom + 16 }]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
            {progress ? t("updateDownloading", { version: progress.version }) : ""}
          </Text>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={fraction === null ? { text: amount } : { min: 0, max: 100, now: Math.round(fraction * 100), text: amount }}
            style={[styles.track, { backgroundColor: p.line }]}
          >
            <View style={[styles.bar, { backgroundColor: p.brand, width: `${Math.round((fraction ?? 0) * 100)}%` }]} />
          </View>
          <Text style={[styles.amount, { color: p.muted }]}>{amount}</Text>
          <Button title={t("cancel")} kind="secondary" onPress={cancelUpdate} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, paddingTop: 20, width: "100%", maxWidth: 640, alignSelf: "center", gap: 12 },
  title: { fontSize: 17, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  amount: { fontSize: 14, fontVariant: ["tabular-nums"] },
});
