// Over the window while the instance's page is on its way (src/connecting.ts,
// #203): the app's own colours (light or dark), a spinner and the address –
// never an empty, white web view.
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { shortServer } from "../server";
import { Logo, styles, usePalette } from "../ui";

export function Connecting({ server }: { server: string }) {
  const p = usePalette();
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: p.background, alignItems: "center", justifyContent: "center", padding: 24 }]}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={t("connectingTo", { server: shortServer(server) })}
    >
      <Logo size={64} />
      <ActivityIndicator size="large" color={p.brand} style={{ marginTop: 28 }} />
      <Text style={[styles.text, styles.centered, { color: p.muted, marginTop: 16, maxWidth: 420 }]} numberOfLines={3}>
        {t("connectingTo", { server: shortServer(server) })}
      </Text>
    </View>
  );
}
