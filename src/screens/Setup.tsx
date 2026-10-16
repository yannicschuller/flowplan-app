// First start and "Change server": asks for the instance, suggesting
// app.flowplan.org (or the address a managed installation configured), and
// only accepts a real Flowplan instance.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { checkServer, DEFAULT_SERVER, normalizeServer, ServerError, shortServer, timeoutSignal, type HttpRequest } from "../server";
import { Button, Logo, Screen, styles, usePalette } from "../ui";

// React Native follows redirects by itself; the final address tells whether
// one went to another site.
const request: HttpRequest = async ({ url }) => {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: timeoutSignal(8000) });
  const final = response.url ? new URL(response.url) : null;
  if (final && final.origin !== new URL(url).origin) return { status: 302, headers: { location: final.href } };
  return { status: response.status, data: await response.text() };
};

export function Setup({
  current,
  suggested,
  onConnect,
  onCancel,
}: {
  current: string | null;
  suggested: string | null;
  onConnect: (server: string) => void;
  onCancel?: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(shortServer(suggested || current || DEFAULT_SERVER));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  async function connect() {
    setError("");
    setBusy(true);
    let origin = "";
    try {
      origin = normalizeServer(value);
      await checkServer(origin, request);
      onConnect(origin);
    } catch (e) {
      const code = e instanceof ServerError ? e.code : "unreachable";
      setError(t(code, { server: shortServer(origin || value), detail: e instanceof ServerError ? shortServer(e.detail) : "" }));
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.center, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Logo />
          <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
            {t("setupTitle")}
          </Text>
          <Text style={[styles.text, styles.centered, { color: p.muted }]}>{t("setupText")}</Text>
          <Text nativeID="server-label" style={[styles.label, { color: p.text }]}>
            {t("label")}
          </Text>
          <TextInput
            ref={input}
            accessibilityLabelledBy="server-label"
            value={value}
            onChangeText={setValue}
            onSubmitEditing={connect}
            placeholder={t("placeholder")}
            placeholderTextColor={p.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            spellCheck={false}
            style={[styles.input, { color: p.text, backgroundColor: p.field, borderColor: error ? p.error : p.line }]}
          />
          {error ? (
            <Text accessibilityRole="alert" style={[styles.small, { color: p.error, marginTop: 8 }]}>
              {error}
            </Text>
          ) : null}
          <Text style={[styles.small, styles.centered, { color: p.muted, marginTop: 18 }]}>{t("setupHint")}</Text>
                    <Button title={busy ? t("connecting") : t("connect")} busy={busy} onPress={connect} style={{ marginTop: 16 }} />
          {onCancel && current ? <Button title={t("cancel")} kind="secondary" onPress={onCancel} style={{ marginTop: 10 }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
