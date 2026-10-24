// Shown when the instance cannot be reached. Tries again by itself once the
// connection is back; another profile is a tap away.
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import * as Network from "expo-network";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { shortServer } from "../server";
import { Button, Logo, styles, usePalette } from "../ui";

export function Offline({ server, onRetry, onProfiles }: { server: string; onRetry: () => void; onProfiles: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let wasOnline: boolean | null = null;
    const subscription = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && wasOnline === false) onRetry();
      wasOnline = online;
    });
    return () => subscription.remove();
  }, [onRetry]);
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={[styles.center, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}>
        <Logo />
        <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
          {t("offlineTitle")}
        </Text>
        <Text style={[styles.text, styles.centered, { color: p.muted }]}>{t("offlineServer", { server: shortServer(server) })}</Text>
        <Button title={t("retry")} onPress={onRetry} style={{ marginTop: 22 }} />
        <Button title={t("switchProfile")} kind="secondary" onPress={onProfiles} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}
