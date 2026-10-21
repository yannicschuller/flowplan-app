// The app lock: covers the app until Face ID, Touch ID, a fingerprint or the
// device code unlock it (Settings → App lock).
import { useCallback, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { t } from "../i18n";
import { Button, Logo, usePalette } from "../ui";

// While the app is not in front (app switcher, a system prompt): only the
// logo, nothing of the page – with the app lock on (App.tsx).
export function Cover() {
  const p = usePalette();
  return (
    <View style={[StyleSheet.absoluteFill, lockStyles.cover, lockStyles.topmost, { backgroundColor: p.background }]} pointerEvents="none">
      <Logo size={72} />
    </View>
  );
}

export function Lock({ onUnlocked }: { onUnlocked: () => void }) {
  const p = usePalette();
  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t("unlockPrompt") }).catch(() => ({ success: false }));
    if (result.success) onUnlocked();
  }, [onUnlocked]);
  useEffect(() => {
    void unlock();
  }, [unlock]);
  return (
    <View style={[StyleSheet.absoluteFill, lockStyles.cover, { backgroundColor: p.background }]} accessibilityViewIsModal>
      <Logo size={72} />
      <Text style={[lockStyles.text, { color: p.text }]}>{t("locked")}</Text>
      <Button title={t("unlock")} onPress={unlock} />
    </View>
  );
}

const lockStyles = StyleSheet.create({
  cover: { alignItems: "center", justifyContent: "center", gap: 18, zIndex: 10 },
  topmost: { zIndex: 20, elevation: 20 },
  text: { fontSize: 18, fontWeight: "600" },
});
