// A voice note for the open page (the editor's "Voice note" in the app,
// lib/native-voice.ts in Flowplan): recorded here with expo-audio – it goes on
// with the screen locked – and, on iOS, turned into text on the device with
// Apple Speech (modules/flowplan-speech) where the language allows. The
// audio and the text go back to the page (src/voice-bridge.ts), which uploads
// the audio and inserts the text below it; the instance transcribes instead
// where the phone cannot, and its AI summarises when asked.
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from "expo-audio";
import { File } from "expo-file-system";
import { getLocales } from "expo-localization";
import { canTranscribeOnDevice, transcribeOnDevice } from "../../modules/flowplan-speech/src";
import { t } from "../i18n";
import { tn } from "../i18n-notify";
import { voiceScripts, voiceStamp, wordsToSegments, type VoiceRequest, type VoiceResult, type VoiceTranscript } from "../voice-bridge";
import { Button, styles, usePalette } from "../ui";

const MAX_MINUTES = 30;
// Speech in mono AAC at 32 kbit/s: half an hour stays below 8 MB.
const VOICE: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: { mimeType: "audio/webm", bitsPerSecond: 32000 },
};
const speechLanguage = () => getLocales()[0]?.languageTag || null;

type Phase = "idle" | "recording" | "recorded" | "working";

export function VoiceNote({ request, onResult }: { request: VoiceRequest | null; onResult: (id: string, scripts: string[]) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(VOICE);
  const [phase, setPhase] = useState<Phase>("idle");
  const [since, setSince] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [toText, setToText] = useState(true);
  const [summarize, setSummarize] = useState(false);
  const [message, setMessage] = useState("");
  const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDevice = Platform.OS === "ios" && !!request && canTranscribeOnDevice(speechLanguage());
  const canText = onDevice || !!request?.serverTranscription;

  useEffect(() => {
    if (!request) return;
    setPhase("idle");
    setUri(null);
    setToText(true);
    setSummarize(false);
    setMessage("");
  }, [request]);

  const stop = useCallback(async () => {
    clearTimeout(limit.current);
    try {
      await recorder.stop();
    } catch {}
    setUri(recorder.uri);
    setPhase(recorder.uri ? "recorded" : "idle");
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [recorder]);

  const record = async () => {
    setMessage("");
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return setMessage(t("micDenied"));
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      return setMessage(tn("voiceFailed"));
    }
    setSince(Date.now());
    setPhase("recording");
    limit.current = setTimeout(() => void stop(), MAX_MINUTES * 60_000);
  };

  const send = (result: VoiceResult, base64 = "") => {
    if (request) onResult(request.id, voiceScripts(request.id, result, base64));
  };

  const close = async () => {
    if (phase === "recording") await stop();
    if (uri) deleteFile(uri);
    send({ status: "cancelled" });
  };

  const insert = async () => {
    if (!uri || !request) return;
    setPhase("working");
    let transcript: VoiceTranscript | null = null;
    if (toText && onDevice) {
      setMessage(tn("voiceTranscribing"));
      try {
        const result = await transcribeOnDevice(uri, speechLanguage());
        const segments = wordsToSegments(result.words);
        const end = segments.length ? segments[segments.length - 1].end : undefined;
        transcript = result.text.trim() ? { text: result.text, segments, ...(end !== undefined ? { duration: end } : {}) } : null;
      } catch (error) {
        setMessage(String((error as Error)?.message || "").includes("denied") ? tn("voiceSpeechDenied") : tn("voiceSpeechFailed"));
      }
    }
    try {
      const base64 = await new File(uri).base64();
      deleteFile(uri);
      // Without text from the phone the instance may still transcribe
      // (`text`); it only does so where the person wanted text.
      send({ status: "done", name: tn("voiceFile", { stamp: voiceStamp(new Date()) }), mime: "audio/mp4", transcript, text: toText && canText, summarize: summarize && toText && canText }, base64);
    } catch {
      send({ status: "failed", error: tn("voiceFailed") });
    }
  };

  const recording = phase === "recording";
  return (
    <Modal visible={!!request} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void close()}>
      <View style={{ flex: 1, backgroundColor: p.background, paddingBottom: insets.bottom }}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, { color: p.text, textAlign: "left", flex: 1, marginTop: 4 }]} accessibilityRole="header">
              {tn("voiceTitle")}
            </Text>
            <Button title={t("cancel")} kind="secondary" disabled={phase === "working"} onPress={() => void close()} />
          </View>
          <View style={{ alignItems: "center", marginTop: 32 }}>
            <Text style={{ fontSize: 44, fontWeight: "700", color: recording ? "#e5484d" : p.muted, fontVariant: ["tabular-nums"] }} accessibilityLiveRegion="polite">
              {recording ? <Elapsed since={since} /> : "0:00"}
            </Text>
            <Text style={[styles.small, { color: p.muted, marginTop: 6 }]}>{tn("voiceLimit", { minutes: MAX_MINUTES })}</Text>
            {phase === "idle" || recording ? (
              <Button title={recording ? tn("voiceStop") : tn("voiceStart")} onPress={() => void (recording ? stop() : record())} style={{ marginTop: 24, minWidth: 220 }} />
            ) : null}
          </View>
          {phase === "recorded" || phase === "working" ? (
            <View style={{ marginTop: 28, gap: 16 }}>
              {canText ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.text, { color: p.text }]}>{tn("voiceText")}</Text>
                    <Text style={[styles.small, { color: p.muted }]}>{onDevice ? tn("voiceOnDevice") : tn("voiceOnServer")}</Text>
                  </View>
                  <Switch value={toText} onValueChange={setToText} disabled={phase === "working"} accessibilityLabel={tn("voiceText")} />
                </View>
              ) : null}
              {canText && request?.summarize ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={[styles.text, { color: p.text, flex: 1 }]}>{tn("voiceSummarize")}</Text>
                  <Switch value={summarize && toText} onValueChange={setSummarize} disabled={!toText || phase === "working"} accessibilityLabel={tn("voiceSummarize")} />
                </View>
              ) : null}
              <Button title={tn("voiceInsert")} busy={phase === "working"} onPress={() => void insert()} />
              <Button
                title={tn("voiceDiscard")}
                kind="secondary"
                disabled={phase === "working"}
                onPress={() => {
                  if (uri) deleteFile(uri);
                  setUri(null);
                  setPhase("idle");
                }}
              />
            </View>
          ) : null}
          {message ? (
            <Text style={[styles.text, { color: p.muted, marginTop: 20 }]} accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function deleteFile(uri: string) {
  try {
    new File(uri).delete();
  } catch {}
}

// The running time of the recording ("1:05"), ticking every second.
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return <>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</>;
}
