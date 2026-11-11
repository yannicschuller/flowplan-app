// Shown when the instance cannot be reached (no network, a network that does
// not reach it – #203 –, or an error page without Flowplan behind it, #69):
// the address, what to check, "Try again" and the profiles (another
// instance, or this one's address). It keeps trying in the background – soon
// at first, then every half minute (src/connecting.ts), at once when the
// network changes or the app comes back to the front – and opens the page as
// soon as Flowplan answers there.
import { useEffect, useRef } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import * as Network from "expo-network";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { retryDelay } from "../connecting";
import { t } from "../i18n";
import { checkServer, fetchRequest, shortServer } from "../server";
import { Button, Logo, styles, usePalette } from "../ui";

// A Flowplan answers there (not just an error page, #69) – a "no" after 10 s
// at the latest, also when a request hangs.
const flowplanAnswers = (server: string) =>
  Promise.race([
    checkServer(server, fetchRequest).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);

export function Offline({ server, onRetry, onProfiles }: { server: string; onRetry: () => void; onProfiles: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  useEffect(() => {
    let stopped = false;
    let checking = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void check(), retryDelay(attempt++));
    };
    const check = async () => {
      if (stopped || checking) return;
      checking = true;
      const answered = await flowplanAnswers(server);
      checking = false;
      if (stopped) return;
      if (answered) retryRef.current();
      else schedule();
    };
    schedule();
    let wasOnline: boolean | null = null;
    const subscription = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      // Another network (Wi-Fi ↔ cellular, a VPN): asked again at once.
      if (online && wasOnline !== null) {
        attempt = 0;
        void check();
      }
      wasOnline = online;
    });
    const foreground = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      attempt = 0;
      void check();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
      foreground.remove();
    };
  }, [server]);
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={[styles.center, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}>
        <Logo />
        <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
          {t("offlineTitle")}
        </Text>
        <Text style={[styles.text, styles.centered, { color: p.text, fontWeight: "600" }]} selectable>
          {t("offlineServer", { server: shortServer(server) })}
        </Text>
        <Text style={[styles.text, styles.centered, { color: p.muted, marginTop: 10 }]}>{t("offlineHint")}</Text>
        <Button title={t("retry")} onPress={onRetry} style={{ marginTop: 22 }} />
        <Button title={t("switchProfile")} kind="secondary" onPress={onProfiles} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}
