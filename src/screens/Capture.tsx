// Capture from the widgets, controls, Siri and the icon's quick actions
// (flowplan://capture?mode=note|task|voice|photo[&target=…]): a note or task
// typed in, a voice memo recorded here (with its Live Activity / ongoing
// notification while it runs), or a photo. Saved with the instance's widget
// actions (capture.note, capture.task, capture.upload) to the chosen target
// or the person's capture default; voice memos are transcribed where the
// instance can.
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { donateShortcut } from "../../modules/flowplan-native/src";
import { t } from "../i18n";
import { localDay } from "../summary";
import { uploadCapture, widgetAction, widgetData } from "../widgets/api";
import type { CaptureRequest } from "../navigation";
import { connection, refreshSuite, timeZone } from "../native/suite";
import { onStopRecording, setRecording } from "../native/activities";
import { Button, styles, usePalette } from "../ui";

type Target = { id: string; name: string };

export function Capture({ request, onClose, onOpen }: { request: CaptureRequest | null; onClose: () => void; onOpen: (path: string) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [target, setTarget] = useState<Target | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [dueToday, setDueToday] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const started = useRef(false);
  const mode = request?.mode ?? "note";

  // The target: the widget's, or the person's capture default.
  useEffect(() => {
    if (!request) return;
    setTitle("");
    setText("");
    setMessage("");
    setSaved(null);
    setDueToday(request.mode === "task");
    started.current = false;
    const target = connection();
    if (!target) return setMessage(t("widgetSignIn"));
    void widgetData(target, [{ id: "capture", kind: "capture", config: request.target ? { targetId: request.target } : {} }], { today: localDay(), zone: timeZone() }).then((result) => {
      const answer = result.ok ? result.value.get("capture") : null;
      const data = answer?.ok ? (answer.data.target as { id?: string; name?: string } | null) : null;
      if (data?.id) setTarget({ id: data.id, name: data.name || "" });
      else setMessage(result.ok ? t("captureNoTarget") : t("widgetOffline"));
    });
  }, [request]);

  const finish = useCallback((url: string | undefined, name: string) => {
    setSaved(url || null);
    setMessage(t("captureSaved", { target: name }));
    void refreshSuite({ force: true });
  }, []);

  const save = async () => {
    const target_ = connection();
    if (!target_ || !target || !(title.trim() || text.trim())) return;
    setBusy(true);
    const lines = (title.trim() || text.trim()).split("\n");
    const result = await widgetAction<{ url?: string }>(target_, mode === "task" ? "capture.task" : "capture.note", {
      targetId: target.id,
      title: lines[0].slice(0, 300),
      ...(title.trim() && text.trim() ? { text } : lines.length > 1 ? { text: lines.slice(1).join("\n") } : {}),
      ...(mode === "task" && dueToday ? { due: localDay() } : {}),
    });
    setBusy(false);
    if (result.ok) {
      donateShortcut("note");
      finish(result.value.url, target.name);
    } else setMessage(t("captureFailed", { error: "error" in result ? result.error : t("widgetSignIn") }));
  };

  const upload = async (type: "photo" | "voice", file: { uri: string; name: string; type: string }) => {
    const target_ = connection();
    if (!target_ || !target) return;
    setBusy(true);
    setMessage(t("uploading"));
    const result = await uploadCapture(target_, { targetId: target.id, type, title: title.trim() || undefined, file });
    setBusy(false);
    if (result.ok) finish(result.value.url, target.name);
    else setMessage(t("captureFailed", { error: "error" in result ? result.error : t("widgetSignIn") }));
  };

  // ---- Voice memo ----
  const stop = useCallback(async () => {
    if (!recordingSince) return;
    setRecordingSince(null);
    setRecording(null);
    try {
      await recorder.stop();
    } catch {}
    const uri = recorder.uri;
    if (uri) await upload("voice", { uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" });
  }, [recordingSince, recorder, target]);

  const record = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return setMessage(t("micDenied"));
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    const since = Date.now();
    setRecordingSince(since);
    setRecording(since);
    donateShortcut("voice");
  }, [recorder]);

  // "Stop" in the Live Activity or the notification.
  useEffect(() => {
    onStopRecording(recordingSince ? () => void stop() : null);
    return () => onStopRecording(null);
  }, [recordingSince, stop]);

  // Siri / the control "Voice memo": recording starts at once.
  useEffect(() => {
    if (request?.mode === "voice" && request.record && target && !started.current) {
      started.current = true;
      void record();
    }
  }, [request, target, record]);

  // ---- Photo ----
  const photo = async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await upload("photo", { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.jpg`, type: asset.mimeType || "image/jpeg" });
  };

  const close = () => {
    if (recordingSince) void stop();
    onClose();
  };

  const heading = { note: t("captureNewNote"), task: t("captureNewTask"), voice: t("captureVoice"), photo: t("capturePhoto") }[mode];
  const input = [styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card }];
  return (
    <Modal visible={!!request} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: p.background, paddingBottom: insets.bottom }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, { color: p.text, textAlign: "left", flex: 1, marginTop: 4 }]} accessibilityRole="header">
              {heading}
            </Text>
            <Button title={t("done")} kind="secondary" onPress={close} />
          </View>
          {target ? <Text style={[styles.small, { color: p.muted }]}>{`${t("configTarget")}: ${target.name}`}</Text> : null}
          {mode === "note" || mode === "task" ? (
            <>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("captureTitleField")}
                placeholderTextColor={p.muted}
                autoFocus
                style={[...input, { marginTop: 18 }]}
                accessibilityLabel={t("captureTitleField")}
                returnKeyType="next"
              />
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t("captureTextField")}
                placeholderTextColor={p.muted}
                multiline
                style={[...input, { marginTop: 12, minHeight: 120, textAlignVertical: "top" }]}
                accessibilityLabel={t("captureTextField")}
              />
              {mode === "task" ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
                  <Text style={[styles.text, { color: p.text, flex: 1 }]}>{t("captureDueToday")}</Text>
                  <Switch value={dueToday} onValueChange={setDueToday} accessibilityLabel={t("captureDueToday")} />
                </View>
              ) : null}
              <Button title={t("save")} busy={busy} disabled={!target || !(title.trim() || text.trim())} onPress={() => void save()} style={{ marginTop: 20 }} />
            </>
          ) : null}
          {mode === "voice" ? (
            <View style={{ alignItems: "center", marginTop: 32 }}>
              <Text style={{ fontSize: 44, fontWeight: "700", color: recordingSince ? "#e5484d" : p.muted, fontVariant: ["tabular-nums"] }} accessibilityLiveRegion="polite">
                {recordingSince ? <Elapsed since={recordingSince} /> : "0:00"}
              </Text>
              <Button
                title={recordingSince ? t("recordStop") : t("recordStart")}
                busy={busy}
                disabled={!target}
                onPress={() => void (recordingSince ? stop() : record())}
                style={{ marginTop: 24, minWidth: 220 }}
              />
            </View>
          ) : null}
          {mode === "photo" ? (
            <View style={{ marginTop: 24, gap: 12 }}>
              <Button title={t("takePhoto")} busy={busy} disabled={!target} onPress={() => void photo(true)} />
              <Button title={t("choosePhoto")} kind="secondary" disabled={!target || busy} onPress={() => void photo(false)} />
            </View>
          ) : null}
          {message ? (
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
      </View>
    </Modal>
  );
}

// The running time of a recording ("1:05"), ticking every second.
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return <>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</>;
}
