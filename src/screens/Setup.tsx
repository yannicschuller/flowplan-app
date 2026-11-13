// First start, "Add profile" and "Switch profile": asks for an instance and
// an optional name, suggesting app.flowplan.org (or the address a managed
// installation configured), and only accepts a real Flowplan instance. With
// profiles saved, they are listed on top to switch with one tap; an address
// that already has a profile switches to it. A plain-http address of the
// local network (#62) gets a warning before connecting. The active profile,
// when it was never signed in, can get another address or go (#69: the
// sign-in pages' "Other server?" leads here); Cancel – and Android's back –
// returns to its page.
import React, { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { findByServer, MAX_PROFILES, ownName, profileLabel, ProfileError, type Profile, type ProfileState } from "../profiles";
import { DEFAULT_SERVER, fetchRequest as request, isPlainHttp, normalizeServer, ServerError, shortServer } from "../server";
import { CertificateRefused, checkServerTrusting } from "../certs/review";
import { tc } from "../i18n-certs";
import { Button, Logo, Screen, styles, usePalette } from "../ui";
import { ProfileList } from "./Profiles";

// iOS lets fewer local names through without HTTPS (src/server.ts).
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

export function Setup({
  profiles,
  suggested,
  onConnect,
  onSwitch,
  onCancel,
  unsigned,
  onReplace,
  onRemove,
}: {
  profiles: ProfileState;
  suggested: string | null;
  onConnect: (server: string, name: string) => void;
  onSwitch: (id: string) => void;
  onCancel?: () => void;
  // The active profile when it was never signed in (profile-picker.ts).
  unsigned?: Profile | null;
  onReplace?: (id: string, server: string, name: string) => void;
  onRemove?: (id: string) => void;
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
  // Changing the address of the profile never signed in (the form below
  // edits it instead of adding one).
  const [editing, setEditing] = useState<Profile | null>(null);
  const fixable = unsigned && onReplace && onRemove ? unsigned : null;

  const startEditing = (profile: Profile) => {
    setEditing(profile);
    setValue(shortServer(profile.server));
    setName(ownName(profile));
    setError("");
    setTimeout(() => input.current?.focus(), 50);
  };
  const stopEditing = () => {
    setEditing(null);
    setValue("");
    setName("");
    setError("");
  };
  const remove = (profile: Profile) =>
    Alert.alert(t("removeProfileTitle"), t("removeProfileConfirm", { name: profileLabel(profile) }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("removeProfile"), style: "destructive", onPress: () => onRemove?.(profile.id) },
    ]);

  // Android's back: out of the address form, then back to the page.
  const back = useRef<() => boolean>(() => false);
  back.current = () => {
    if (editing) {
      stopEditing();
      return true;
    }
    if (!onCancel) return false;
    onCancel();
    return true;
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => back.current());
    return () => subscription.remove();
  }, []);

  async function connect() {
    setError("");
    setBusy(true);
    let origin = "";
    try {
      origin = normalizeServer(value, PLATFORM);
      // Already a profile: switch to it, no second one for the same instance
      // (the same address when changing it: back to its page).
      const existing = findByServer(profiles, origin);
      if (existing) return onSwitch(existing.id);
      if (!editing && profiles.profiles.length >= MAX_PROFILES) throw new ProfileError("tooMany");
      // A certificate the device does not trust is asked about (certs/review.ts).
      await checkServerTrusting(origin, request);
      if (editing) onReplace?.(editing.id, origin, name);
      else onConnect(origin, name);
    } catch (e) {
      if (e instanceof ProfileError) setError(t("tooManyProfiles", { count: MAX_PROFILES }));
      else if (e instanceof CertificateRefused) setError(tc("certRefused", { server: shortServer(origin) }));
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
          {editing ? (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
                {t("changeAddress")}
              </Text>
              <Text style={[styles.text, styles.centered, { color: p.muted }]}>{t("changeAddressText", { name: profileLabel(editing) })}</Text>
            </>
          ) : adding ? (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
                {t("switchProfile")}
              </Text>
              <Text style={[styles.label, { color: p.text, marginTop: 4 }]}>{t("yourProfiles")}</Text>
              <ProfileList profiles={profiles.profiles} active={profiles.active} onSwitch={onSwitch} />
              {fixable ? (
                <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.card }}>
                  <Text style={[styles.small, { color: p.text, fontWeight: "600" }]}>{t("notSignedInTitle", { name: profileLabel(fixable) })}</Text>
                  <Text style={[styles.small, { color: p.muted, marginTop: 4 }]}>{t("notSignedInText")}</Text>
                  <View style={[styles.row, { marginTop: 12 }]}>
                    <Button title={t("changeAddress")} kind="secondary" onPress={() => startEditing(fixable)} style={{ flexGrow: 1 }} />
                    <Button title={t("removeProfile")} kind="danger" onPress={() => remove(fixable)} style={{ flexGrow: 1 }} />
                  </View>
                </View>
              ) : null}
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
          <Button title={busy ? t("connecting") : editing ? t("save") : adding ? t("add") : t("connect")} busy={busy} onPress={connect} style={{ marginTop: 16 }} />
          {editing ? (
            <Button title={t("cancel")} kind="secondary" onPress={stopEditing} style={{ marginTop: 10 }} />
          ) : onCancel ? (
            <Button title={t("cancel")} kind="secondary" onPress={onCancel} style={{ marginTop: 10 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
