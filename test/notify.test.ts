// Buttons on notifications (src/notification-buttons.ts), local reminders
// (src/reminder-plan.ts), the voice note handed back to the page
// (src/voice-bridge.ts) and the bridge's new calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUTTONS, buttonRequest, CATEGORIES, categoryButtons, isButton, notificationData } from "../src/notification-buttons";
import { planReminders, REMINDER_PREFIX } from "../src/reminder-plan";
import { voiceRequest, voiceScripts, voiceStamp, wordsToSegments } from "../src/voice-bridge";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { notifyStrings } from "../src/i18n-notify";
import type { Summary } from "../src/summary";

const texts = { done: "Done", tomorrow: "Tomorrow", reply: "Reply", send: "Send", placeholder: "Your reply", read: "Mark as read" };
const response = (actionIdentifier: string, data: unknown, userText?: string) => ({
  actionIdentifier,
  userText,
  notification: { request: { identifier: "n1", content: { data } } },
});

test("the categories the instance names have their buttons; nothing opens the app", () => {
  const categories = categoryButtons(texts);
  assert.deepEqual(
    categories.map((c) => [c.identifier, c.actions.map((a) => a.identifier)]),
    [
      [CATEGORIES.task, ["fp.done", "fp.tomorrow"]],
      [CATEGORIES.comment, ["fp.reply", "fp.read"]],
      [CATEGORIES.read, ["fp.read"]],
    ],
  );
  for (const category of categories)
    for (const action of category.actions) {
      assert.equal(action.options.opensAppToForeground, false);
      // Changes in the person's name want the phone unlocked.
      assert.equal(action.options.isAuthenticationRequired, action.identifier !== "fp.read");
    }
  assert.deepEqual(categories[1].actions[0].textInput, { submitButtonTitle: "Send", placeholder: "Your reply" });
  // The ids are what the instance sends (lib/notification-targets.ts in Flowplan).
  assert.deepEqual(Object.values(CATEGORIES), ["flowplan.task", "flowplan.comment", "flowplan.read"]);
});

test("a tapped button becomes the instance's request; other taps do not", () => {
  const data = { url: "/#page=1", notificationId: "abc" };
  assert.deepEqual(buttonRequest(response("fp.done", data), "2026-10-24"), { action: "done", notificationId: "abc" });
  assert.deepEqual(buttonRequest(response("fp.tomorrow", data), "2026-10-24"), { action: "tomorrow", notificationId: "abc", today: "2026-10-24" });
  assert.deepEqual(buttonRequest(response("fp.reply", data, "  Ja, mache ich.  "), "2026-10-24"), { action: "reply", notificationId: "abc", text: "Ja, mache ich." });
  assert.deepEqual(buttonRequest(response("fp.read", data), "2026-10-24"), { action: "read", notificationId: "abc" });
  // A reply without text, the tap on the notification, no id.
  assert.equal(buttonRequest(response("fp.reply", data, "   "), "2026-10-24"), null);
  assert.equal(buttonRequest(response("expo.modules.notifications.actions.DEFAULT", data), "2026-10-24"), null);
  assert.equal(buttonRequest(response("fp.done", { url: "/#inbox" }), "2026-10-24"), null);
  assert.equal(buttonRequest(null, "2026-10-24"), null);
  assert.ok(isButton("fp.read"));
  assert.ok(!isButton("constructor"));
  assert.deepEqual(Object.keys(BUTTONS), ["fp.done", "fp.tomorrow", "fp.reply", "fp.read"]);
});

test("the instance's data is found as Android's background task brings it", () => {
  const data = { url: "/#page=1", notificationId: "abc" };
  assert.deepEqual(notificationData(response("fp.done", JSON.stringify(data))), data);
  assert.deepEqual(notificationData(response("fp.done", { title: "Flowplan", body: JSON.stringify(data) })), data);
  assert.deepEqual(notificationData({ notification: { request: { content: { dataString: JSON.stringify(data) } } } }), data);
  assert.deepEqual(notificationData(response("fp.done", "not json")), {});
});

const summary = (items: Summary["tasks"]["items"]): Summary => ({
  name: "Ben",
  unread: 0,
  tasks: { due: 0, overdue: 0, open: items.length, items },
  timer: null,
  today: "2026-10-24",
  at: 0,
});

test("local reminders: 09:00 on the day a task is due, only ahead", () => {
  const now = new Date(2026, 9, 24, 10, 30);
  const planned = planReminders(
    summary([
      { text: "Gestern", page: "A", due: "2026-10-23", url: "/#page=a" },
      { text: "Heute", page: "A", due: "2026-10-24", url: "/#page=a" },
      { text: "Morgen", page: "B", due: "2026-10-25", url: "/#page=b" },
      { text: "Ohne Datum", page: "B", due: null, url: "/#page=b" },
      { text: "Kaputt", page: "B", due: "25.10.2026", url: "/#page=b" },
    ]),
    now,
  );
  assert.deepEqual(
    planned.map((r) => [r.id.startsWith(REMINDER_PREFIX), r.text, r.at.getTime()]),
    [[true, "Morgen", new Date(2026, 9, 25, 9, 0).getTime()]],
  );
  // Before nine today's task is still to come.
  assert.equal(planReminders(summary([{ text: "Heute", page: "A", due: "2026-10-24", url: "/" }]), new Date(2026, 9, 24, 8, 0)).length, 1);
  assert.deepEqual(planReminders(null, now), []);
});

test("the voice note goes back to the page in pieces, then as event", () => {
  const audio = Buffer.from("x".repeat(3000)).toString("base64");
  const result = { status: "done" as const, name: "Voice.m4a", mime: "audio/mp4", transcript: { text: "Hallo.", segments: [{ start: 0, end: 1, text: "Hallo." }] }, text: true, summarize: true };
  const scripts = voiceScripts("id-12345678", result, audio, 1000);
  assert.equal(scripts.length, Math.ceil(audio.length / 1000) + 1);
  const window: Record<string, unknown> = {};
  const events: { type: string; detail: unknown }[] = [];
  window.dispatchEvent = (event: { type: string; detail: unknown }) => events.push(event);
  class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init: { detail: unknown }) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  for (const script of scripts) new Function("window", "CustomEvent", script)(window, CustomEvent);
  const pieces = (window.__flowplanVoice as Record<string, string[]>)["id-12345678"];
  assert.equal(pieces.join(""), audio);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "flowplan:voice-note");
  assert.deepEqual(events[0].detail, { id: "id-12345678", ...result });
  // Cancelled: only the event.
  assert.equal(voiceScripts("id-12345678", { status: "cancelled" }).length, 1);
  // Ids are checked; nothing of them reaches a script unescaped.
  assert.equal(voiceRequest({ id: "\"); alert(1); (\"" }), null);
  assert.deepEqual(voiceRequest({ id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427", summarize: true }), {
    id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
    summarize: true,
    serverTranscription: false,
  });
  assert.equal(voiceStamp(new Date(2026, 9, 4, 9, 5)), "2026-10-04-0905");
});

test("Apple Speech's words become sentences and pauses", () => {
  const words = [
    { text: "Hallo", start: 0, duration: 0.4 },
    { text: "zusammen.", start: 0.5, duration: 0.5 },
    { text: "Heute", start: 1.2, duration: 0.3 },
    { text: "geht's", start: 1.6, duration: 0.3 },
    { text: "weiter", start: 4, duration: 0.5 },
    { text: "", start: 5, duration: 0.1 },
  ];
  assert.deepEqual(wordsToSegments(words), [
    { start: 0, end: 1, text: "Hallo zusammen." },
    { start: 1.2, end: 1.9, text: "Heute geht's" },
    { start: 4, end: 4.5, text: "weiter" },
  ]);
  const long = Array.from({ length: 100 }, (_, i) => ({ text: "Wort", start: i * 0.3, duration: 0.2 }));
  assert.ok(wordsToSegments(long, 50).every((s) => s.text.length <= 50));
});

test("the page opens the browser and asks for voice notes through FlowplanApp", () => {
  const script = bridgeScript({ server: "https://flowplan.example.com", platform: "ios", version: "1.0.0" });
  const posted: unknown[] = [];
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage: (data: string) => posted.push(parsePageMessage(data)) } };
  window.top = window;
  const head = script.slice(0, script.indexOf("// Vibrations")) + "})();";
  new Function("window", "location", "navigator", head)(window, { origin: "https://flowplan.example.com" }, {});
  const app = window.FlowplanApp as { openInBrowser: (url: unknown) => void; recordVoiceNote: (request: unknown) => void };
  app.openInBrowser("https://flowplan.example.com/api/calendar-profile?token=x");
  app.recordVoiceNote({ id: "abc-12345", summarize: 1, serverTranscription: true });
  app.recordVoiceNote(null);
  assert.deepEqual(posted, [
    { type: "openInBrowser", url: "https://flowplan.example.com/api/calendar-profile?token=x" },
    { type: "voiceNote", id: "abc-12345", summarize: true, serverTranscription: true },
    { type: "voiceNote", id: "null", summarize: false, serverTranscription: false },
  ]);
});

test("the texts exist in every language, and the Swift side knows the same buttons", () => {
  for (const lang of ["en", "fr"] as const) assert.deepEqual(Object.keys(notifyStrings[lang]).sort(), Object.keys(notifyStrings.de).sort());
  const swift = readFileSync(join(import.meta.dirname, "..", "modules/flowplan-notify/ios/NotificationActions.swift"), "utf8");
  for (const [identifier, action] of Object.entries(BUTTONS)) assert.ok(swift.includes(`"${identifier}": "${action}"`), identifier);
  // The speech permission text is in the Info.plist and translated.
  const config = readFileSync(join(import.meta.dirname, "..", "app.config.ts"), "utf8");
  assert.match(config, /NSSpeechRecognitionUsageDescription/);
  for (const lang of ["de", "en", "fr"]) {
    const locale = JSON.parse(readFileSync(join(import.meta.dirname, "..", `locales/${lang}.json`), "utf8")) as { ios: Record<string, string> };
    assert.ok(locale.ios.NSSpeechRecognitionUsageDescription, lang);
  }
});
