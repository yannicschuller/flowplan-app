// A voice note recorded by the app for the page (lib/native-voice.ts in
// Flowplan): the editor asks through window.FlowplanApp.recordVoiceNote,
// src/screens/VoiceNote.tsx records and transcribes, and these scripts hand
// the result back – the audio in base64 pieces (one injected script each,
// so no single script gets huge), then the event "flowplan:voice-note".
// Pure functions.

export type VoiceRequest = { id: string; summarize: boolean; serverTranscription: boolean };
export type VoiceSegment = { start: number; end: number; text: string };
export type VoiceTranscript = { text: string; segments: VoiceSegment[]; duration?: number };
export type VoiceResult =
  // text: the person wants the words as text (from `transcript`, or the
  // instance's transcription where the phone had none).
  | { status: "done"; name: string; mime: string; transcript: VoiceTranscript | null; text: boolean; summarize: boolean }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

// 512 KB of base64 per script.
export const PIECE = 512 * 1024;

// The page's request, checked (ids are what the page made: crypto.randomUUID()).
export function voiceRequest(message: { id?: unknown; summarize?: unknown; serverTranscription?: unknown }): VoiceRequest | null {
  if (typeof message.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(message.id)) return null;
  return { id: message.id, summarize: message.summarize === true, serverTranscription: message.serverTranscription === true };
}

export function voiceScripts(id: string, result: VoiceResult, base64 = "", piece = PIECE) {
  const key = JSON.stringify(id);
  const scripts: string[] = [];
  if (result.status === "done")
    for (let at = 0; at < base64.length; at += piece)
      scripts.push(
        `(() => { const s = window.__flowplanVoice || (window.__flowplanVoice = {}); (s[${key}] || (s[${key}] = [])).push(${JSON.stringify(base64.slice(at, at + piece))}); })(); true;`,
      );
  scripts.push(`window.dispatchEvent(new CustomEvent("flowplan:voice-note", { detail: ${JSON.stringify({ id, ...result })} })); true;`);
  return scripts;
}

// Apple Speech answers word by word: sentences (or what a pause of more than
// a second ends), at most ~200 characters each – the passages of the page's
// transcript (lib/transcript.ts in Flowplan) are built from these.
export function wordsToSegments(words: { text: string; start: number; duration: number }[], maxChars = 200): VoiceSegment[] {
  const segments: VoiceSegment[] = [];
  let current: VoiceSegment | null = null;
  for (const word of words) {
    const text = String(word.text || "").trim();
    if (!text || !Number.isFinite(word.start) || !Number.isFinite(word.duration)) continue;
    const end = word.start + Math.max(0, word.duration);
    if (current && (word.start - current.end > 1 || current.text.length + text.length >= maxChars || /[.!?…]$/.test(current.text))) {
      segments.push(current);
      current = null;
    }
    if (current) {
      current.text = `${current.text} ${text}`;
      current.end = end;
    } else current = { start: word.start, end, text };
  }
  if (current) segments.push(current);
  return segments.map((s) => ({ start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100, text: s.text }));
}

// "2026-10-24-0915" for the file name.
export function voiceStamp(date: Date) {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;
}
