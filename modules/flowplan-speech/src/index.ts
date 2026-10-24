// Speech to text on the device with Apple Speech (ios/FlowplanSpeechModule.swift),
// for the app's voice notes. iOS only, and only languages the phone can
// recognise by itself; elsewhere the instance transcribes (Whisper) or the
// audio stays alone.
import { requireOptionalNativeModule } from "expo";

export type SpeechWord = { text: string; start: number; duration: number };
export type SpeechResult = { text: string; words: SpeechWord[] };

type NativeModule = {
  onDevice(language: string | null): boolean;
  transcribe(uri: string, language: string | null): Promise<SpeechResult>;
};

const native = requireOptionalNativeModule<NativeModule>("FlowplanSpeech");

export function canTranscribeOnDevice(language: string | null) {
  try {
    return native?.onDevice(language) ?? false;
  } catch {
    return false;
  }
}

// Rejects with "denied" (no permission), "unavailable" or the system's message.
export async function transcribeOnDevice(uri: string, language: string | null): Promise<SpeechResult> {
  if (!native) throw new Error("unavailable");
  return native.transcribe(uri, language);
}
