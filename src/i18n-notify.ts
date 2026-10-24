// The texts of the notification buttons, the local reminders and the voice
// note screen, in the app's languages (German, English, French; the language
// is the one src/i18n.ts chose).
import { locale, type Locale } from "./i18n";

const de = {
  actionDone: "Erledigt",
  actionTomorrow: "Morgen",
  actionReply: "Antworten",
  actionReplySend: "Senden",
  actionReplyPlaceholder: "Deine Antwort …",
  actionRead: "Als gelesen markieren",
  actionFailedTitle: "Hat nicht geklappt",
  actionFailedBody: "Öffne Flowplan, um es noch einmal zu versuchen.",
  reminderDueToday: "Heute fällig",
  channelReminders: "Erinnerungen",
  channelRemindersText: "Aufgaben, die heute fällig sind – wenn die Instanz keine Mitteilungen schickt.",
  voiceTitle: "Sprachnotiz",
  voiceStart: "Aufnahme starten",
  voiceStop: "Aufnahme beenden",
  voiceLimit: "Höchstens {minutes} Minuten",
  voiceText: "Als Text einfügen",
  voiceOnDevice: "Auf diesem Gerät mit der Spracherkennung von Apple – die Aufnahme verlässt dafür das Gerät nicht.",
  voiceOnServer: "Mit der Transkription deiner Instanz.",
  voiceSummarize: "Danach mit KI zusammenfassen",
  voiceInsert: "Einfügen",
  voiceDiscard: "Verwerfen",
  voiceTranscribing: "Wandle in Text um …",
  voiceSpeechDenied: "Ohne Erlaubnis zur Spracherkennung wird die Aufnahme ohne Text eingefügt.",
  voiceSpeechFailed: "Die Spracherkennung hat nicht geklappt – die Aufnahme wird ohne Text eingefügt.",
  voiceFailed: "Die Aufnahme konnte nicht übergeben werden.",
  voiceFile: "Sprachnotiz-{stamp}.m4a",
};
type Key = keyof typeof de;

const en: Record<Key, string> = {
  actionDone: "Done",
  actionTomorrow: "Tomorrow",
  actionReply: "Reply",
  actionReplySend: "Send",
  actionReplyPlaceholder: "Your reply …",
  actionRead: "Mark as read",
  actionFailedTitle: "That did not work",
  actionFailedBody: "Open Flowplan to try again.",
  reminderDueToday: "Due today",
  channelReminders: "Reminders",
  channelRemindersText: "Tasks due today – when the instance sends no notifications.",
  voiceTitle: "Voice note",
  voiceStart: "Start recording",
  voiceStop: "Stop recording",
  voiceLimit: "At most {minutes} minutes",
  voiceText: "Insert as text",
  voiceOnDevice: "On this device with Apple's speech recognition – the recording does not leave the device for it.",
  voiceOnServer: "With your instance's transcription.",
  voiceSummarize: "Then summarise with AI",
  voiceInsert: "Insert",
  voiceDiscard: "Discard",
  voiceTranscribing: "Turning into text …",
  voiceSpeechDenied: "Without permission for speech recognition the recording is inserted without text.",
  voiceSpeechFailed: "Speech recognition did not work – the recording is inserted without text.",
  voiceFailed: "The recording could not be handed over.",
  voiceFile: "Voice-note-{stamp}.m4a",
};

const fr: Record<Key, string> = {
  actionDone: "Terminé",
  actionTomorrow: "Demain",
  actionReply: "Répondre",
  actionReplySend: "Envoyer",
  actionReplyPlaceholder: "Ta réponse …",
  actionRead: "Marquer comme lu",
  actionFailedTitle: "Cela n’a pas fonctionné",
  actionFailedBody: "Ouvre Flowplan pour réessayer.",
  reminderDueToday: "À faire aujourd’hui",
  channelReminders: "Rappels",
  channelRemindersText: "Tâches à faire aujourd’hui – quand l’instance n’envoie pas de notifications.",
  voiceTitle: "Note vocale",
  voiceStart: "Démarrer l’enregistrement",
  voiceStop: "Arrêter l’enregistrement",
  voiceLimit: "{minutes} minutes au maximum",
  voiceText: "Insérer comme texte",
  voiceOnDevice: "Sur cet appareil avec la reconnaissance vocale d’Apple – l’enregistrement ne quitte pas l’appareil pour cela.",
  voiceOnServer: "Avec la transcription de ton instance.",
  voiceSummarize: "Puis résumer avec l’IA",
  voiceInsert: "Insérer",
  voiceDiscard: "Supprimer",
  voiceTranscribing: "Conversion en texte …",
  voiceSpeechDenied: "Sans autorisation de reconnaissance vocale, l’enregistrement est inséré sans texte.",
  voiceSpeechFailed: "La reconnaissance vocale n’a pas fonctionné – l’enregistrement est inséré sans texte.",
  voiceFailed: "L’enregistrement n’a pas pu être transmis.",
  voiceFile: "Note-vocale-{stamp}.m4a",
};

export const notifyStrings = { de, en, fr } as const;

export function tn(key: Key, params: Record<string, string | number> = {}, lang: Locale = locale()) {
  const text = notifyStrings[lang]?.[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}
