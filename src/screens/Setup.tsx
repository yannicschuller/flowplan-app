// First start, "Add profile" and "Switch profile": asks for an instance and
// an optional name, suggesting app.flowplan.org (or the address a managed
// installation configured), and only accepts a real Flowplan instance. With
// profiles saved, they are listed on top to switch with one tap; an address
// that already has a profile switches to it. A plain-http address of the
// local network (#62) gets a warning before connecting.
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { findByServer, MAX_PROFILES, ProfileError, type ProfileState } from "../profiles";
import { checkServer, DEFAULT_SERVER, isPlainHttp, normalizeServer, ServerError, shortServer, timeoutSignal, type HttpRequest } from "../server";
import { Button, Logo, Screen, styles, usePalette } from "../ui";
import { ProfileList } from "./Profiles";

// React Native follows redirects by itself; the final address tells whether
// one went to another site.
// iOS lets fewer local names through without HTTPS (src/server.ts).
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

const request: HttpRequest = async ({ url }) => {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: timeoutSignal(8000) });
  const final = response.url ? new URL(response.url) : null;
  if (final && final.origin !== new URL(url).origin) return { status: 302, headers: { location: final.href } };
  return { status: response.status, data: await response.text() };
};

export function Setup({
  profiles,
  suggested,
  onConnect,
  onSwitch,
  onCancel,
}: {
  profiles: ProfileState;
  suggested: string | null;
  onConnect: (server: string, name: string) => void;
  onSwitch: (id: string) => void;
  onCancel?: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const adding = profiles.profiles.length > 0;
  const [value, setValue] = useState(adding ? "" : shortServer(suggested || DEFAULT_SERVER));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const plainHttp = isPlainHttp(value, PLATFORM);

  async function connect() {
    setError("");
    setBusy(true);
    let origin = "";
    try {
      origin = normalizeServer(value, PLATFORM);
      // Already a profile: switch to it, no second one for the same instance.
      const existing = findByServer(profiles, origin);
      if (existing) return onSwitch(existing.id);
      if (profiles.profiles.length >= MAX_PROFILES) throw new ProfileError("tooMany");
      await checkServer(origin, request);
      onConnect(origin, name);
    } catch (e) {
      if (e instanceof ProfileError) setError(t("tooManyProfiles", { count: MAX_PROFILES }));
      else {
        const code = e instanceof ServerError ? e.code : "unreachable";
        setError(t(code, { server: shortServer(origin || value), detail: e instanceof ServerError ? shortServer(e.detail) : "" }));
      }
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.center, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Logo />
          {adding ? (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
                {t("switchProfile")}
              </Text>
              <Text style={[styles.label, { color: p.text, marginTop: 4 }]}>{t("yourProfiles")}</Text>
              <ProfileList profiles={profiles.profiles} active={profiles.active} onSwitch={onSwitch} />
              <Text accessibilityRole="header" style={[styles.label, { color: p.text, fontSize: 17, marginTop: 30, marginBottom: 6 }]}>
                {t("addProfile")}
              </Text>
              <Text style={[styles.small, { color: p.muted }]}>{t("addProfileText")}</Text>
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
                {t("setupTitle")}
              </Text>
              <Text style={[styles.text, styles.centered, { color: p.muted }]}>{t("setupText")}</Text>
            </>
          )}
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
          {plainHttp ? (
            <View accessible accessibilityLiveRegion="polite" style={{ marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: p.line, backgroundColor: p.card }}>
              <Text style={[styles.small, { color: p.text, fontWeight: "600" }]}>{t("httpWarningTitle")}</Text>
              <Text style={[styles.small, { color: p.muted, marginTop: 4 }]}>{t("httpWarning")}</Text>
            </View>
          ) : null}
          <Text nativeID="name-label" style={[styles.label, { color: p.text }]}>
            {t("nameLabel")}
          </Text>
          <TextInput
            accessibilityLabelledBy="name-label"
            value={name}
            onChangeText={setName}
            onSubmitEditing={connect}
            placeholder={t("namePlaceholder")}
            placeholderTextColor={p.muted}
            maxLength={60}
            autoCorrect={false}
            returnKeyType="go"
            style={[styles.input, { color: p.text, backgroundColor: p.field, borderColor: p.line }]}
          />
          {error ? (
            <Text accessibilityRole="alert" style={[styles.small, { color: p.error, marginTop: 8 }]}>
              {error}
            </Text>
          ) : null}
          {adding ? null : <Text style={[styles.small, styles.centered, { color: p.muted, marginTop: 18 }]}>{t("setupHint")}</Text>}
          <Button title={busy ? t("connecting") : adding ? t("add") : t("connect")} busy={busy} onPress={connect} style={{ marginTop: 16 }} />
          {onCancel ? <Button title={t("cancel")} kind="secondary" onPress={onCancel} style={{ marginTop: 10 }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
