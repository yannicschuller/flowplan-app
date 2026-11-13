// The app's settings, per profile: the certificate the person trusted for
// the active profile's instance (src/certs/pins.ts) – its fingerprint and
// "Remove". Nothing when there is none (always on iOS, which pins nothing).
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { tc } from "../i18n-certs";
import { formatDay, formatFingerprint, pinFor, type CertificatePin as Pin } from "../certs/pins";
import { removeCertificatePin } from "../certs/review";
import { store } from "../store";
import { Button, styles, usePalette } from "../ui";

export function CertificatePin({ server }: { server: string | null | undefined }) {
  const p = usePalette();
  const [pin, setPin] = useState<Pin | null>(() => (server ? pinFor(store.certificatePins(), server) : null));
  useEffect(() => setPin(server ? pinFor(store.certificatePins(), server) : null), [server]);
  if (!pin) return null;

  const remove = () =>
    Alert.alert(tc("certPinRemove"), tc("certPinRemoveConfirm", { host: pin.host }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: tc("certPinRemove"),
        style: "destructive",
        onPress: () => {
          removeCertificatePin(pin.origin);
          setPin(null);
        },
      },
    ]);

  return (
    <>
      <Text style={[pinStyles.heading, { color: p.muted }]}>{tc("certPinnedTitle")}</Text>
      <View style={[pinStyles.section, { backgroundColor: p.card, borderColor: p.line }]}>
        <Text style={[styles.text, { color: p.text }]}>{tc("certPinnedText", { host: pin.host, to: formatDay(pin.notAfter) })}</Text>
        <Text selectable style={[styles.small, pinStyles.fingerprint, { color: p.muted }]}>
          {`SHA-256\n${formatFingerprint(pin.sha256)}`}
        </Text>
        {pin.subject ? <Text style={[styles.small, { color: p.muted, marginTop: 6 }]}>{pin.subject}</Text> : null}
        <Button title={tc("certPinRemove")} kind="danger" onPress={remove} style={{ marginTop: 12 }} />
      </View>
    </>
  );
}

// As the other sections of the settings (Settings.tsx).
const pinStyles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  section: { borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  fingerprint: { marginTop: 8, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
});
