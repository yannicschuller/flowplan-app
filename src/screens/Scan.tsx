// The document scanner (iPhone, iPad): from the page's "Scan document"
// (its page is the target, the camera opens at once) or from a link
// (flowplan://scan, Shortcuts) with the choice where to: the inbox, a page
// or a database. The camera finds the pages, Vision reads the text; the PDF
// goes to the instance with that text (lib/mobile-capture.ts), at the end of
// a page or as a new record. A scan with its target given (the page's)
// shows no sheet of its own: the camera opens over the page, whose editor
// then shows the new PDF; only a failure is reported.
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { File } from "expo-file-system";
import { scanDocument, scannerAvailable } from "../../modules/flowplan-capture/src";
import { captureTargets, matchesTarget, saveScan, scanLanguages, scanTitle, targetChoices, type CaptureTarget, type ScanRequest } from "../capture";
import { locale, t } from "../i18n";
import { haptic } from "../native/actions";
import { connection } from "../native/suite";
import { Button, SheetBody, styles, usePalette } from "../ui";

type Choice = CaptureTarget & { inbox?: boolean };

export function Scan({ request, onClose, onOpen }: { request: ScanRequest | null; onClose: () => void; onOpen: (path: string) => void }) {
  const p = usePalette();
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [target, setTarget] = useState<Choice | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"" | "scanning" | "saving">("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const started = useRef<ScanRequest | null>(null);
  const direct = !!request?.start && !!request.target;
  // Without a sheet, messages come as an alert.
  const report = (text: string) => (direct ? Alert.alert(t("scanHeading"), text) : setMessage(text));

  // A fresh start for every request; the targets only when there is a choice.
  useEffect(() => {
    if (!request) return;
    setQuery("");
    setMessage("");
    setSaved(null);
    setBusy("");
    setChoices(null);
    setTarget(request.target ? { id: request.target, name: "", kind: "" } : null);
    if (!scannerAvailable()) return setMessage(t("scanUnavailable"));
    const target_ = connection();
    if (!target_) return setMessage(t("widgetSignIn"));
    if (request.target) return;
    void captureTargets(target_).then((result) => {
      if (!result.ok) return setMessage("signedOut" in result ? t("widgetSignIn") : result.error || t("widgetOffline"));
      const list = targetChoices(result.value);
      setChoices(list);
      setTarget(list[0] ?? null);
      if (!list.length) setMessage(t("captureNoTarget"));
    });
  }, [request]);

  const scan = async (into: Choice) => {
    const target_ = connection();
    if (!target_ || busy) return;
    setMessage("");
    setSaved(null);
    setBusy("scanning");
    const lang = locale();
    const title = scanTitle(lang);
    let result;
    try {
      result = await scanDocument(title, scanLanguages(lang));
    } catch (error) {
      setBusy("");
      report(t("captureFailed", { error: (error as Error).message || "" }));
      if (direct) onClose();
      return;
    }
    // Cancelled: from the page back to it, otherwise the choice stays.
    if (!result) {
      setBusy("");
      if (direct) onClose();
      return;
    }
    setBusy("saving");
    setMessage(t("uploading"));
    const answer = await saveScan(target_, { targetId: into.id, rowId: request?.rowId, title, text: result.text, file: { uri: result.uri, name: result.name } });
    setBusy("");
    // Saved: no copy stays on the phone.
    if (answer.ok)
      try {
        new File(result.uri).delete();
      } catch {}
    if (!answer.ok) {
      haptic("error");
      report(t("captureFailed", { error: "signedOut" in answer ? t("widgetSignIn") : answer.error || t("widgetOffline") }));
      if (direct) onClose();
      return;
    }
    haptic("success");
    if (direct) return onClose();
    setSaved(answer.value.url);
    setMessage(t("captureSaved", { target: into.inbox ? t("scanInbox") : into.name }));
  };

  // From the page: the camera opens right away.
  useEffect(() => {
    if (!request || !direct || started.current === request || !target) return;
    started.current = request;
    if (!scannerAvailable() || !connection()) {
      report(scannerAvailable() ? t("widgetSignIn") : t("scanUnavailable"));
      return onClose();
    }
    void scan(target);
  }, [request, target]);

  const shown = useMemo(() => (choices ?? []).filter((choice) => matchesTarget(choice, query)).slice(0, 60), [choices, query]);
  const input = [styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card }];
  return (
    <Modal visible={!!request && !direct} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SheetBody style={{ backgroundColor: p.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, { color: p.text, textAlign: "left", flex: 1, marginTop: 4 }]} accessibilityRole="header">
              {t("scanHeading")}
            </Text>
            <Button title={t("done")} kind="secondary" onPress={onClose} disabled={busy === "saving"} />
          </View>
          <Text style={[styles.small, { color: p.muted }]}>{t("scanText")}</Text>
          {choices && choices.length ? (
            <>
              <Text style={[styles.label, { color: p.muted }]}>{t("scanWhere")}</Text>
              {choices.length > 8 ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("scanSearch")}
                  placeholderTextColor={p.muted}
                  style={[...input, { marginBottom: 10 }]}
                  accessibilityLabel={t("scanSearch")}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              ) : null}
              <View style={{ backgroundColor: p.card, borderRadius: 12, overflow: "hidden" }}>
                {shown.map((choice, index) => (
                  <Pressable
                    key={choice.inbox ? "inbox" : choice.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: target?.id === choice.id }}
                    onPress={() => setTarget(choice)}
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: p.line }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.text, { color: p.text }]} numberOfLines={1}>
                        {choice.inbox ? `${t("scanInbox")} · ${choice.name}` : choice.name}
                      </Text>
                      {choice.space || choice.workspace ? (
                        <Text style={[styles.small, { color: p.muted }]} numberOfLines={1}>
                          {[choice.space, choice.workspace].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    {target?.id === choice.id ? <Text style={{ color: p.brand, fontSize: 18 }}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {!direct ? (
            <Button
              title={t("scanStart")}
              busy={!!busy}
              disabled={!target || !scannerAvailable()}
              onPress={() => target && void scan(target)}
              style={{ marginTop: 20 }}
            />
          ) : null}
          {busy ? (
            <Text style={[styles.text, { color: p.muted, marginTop: 20 }]} accessibilityLiveRegion="polite">
              {busy === "scanning" ? t("scanBusy") : t("uploading")}
            </Text>
          ) : message ? (
            <Text style={[styles.text, { color: p.muted, marginTop: 20 }]} accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
          {saved ? (
            <Button
              title={t("openPage")}
              kind="secondary"
              onPress={() => {
                onOpen(saved);
                onClose();
              }}
              style={{ marginTop: 12 }}
            />
          ) : null}
        </ScrollView>
      </SheetBody>
    </Modal>
  );
}
