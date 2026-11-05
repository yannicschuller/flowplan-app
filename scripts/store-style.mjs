// The look of the store material (scripts/store-images.mjs,
// scripts/preview-video.mjs): Flowplan's colours (app/globals.css) and fonts
// (scripts/fonts, from the web app), and the headlines of the frames.
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const font = (file) => `data:font/woff2;base64,${readFileSync(`${root}scripts/fonts/${file}`).toString("base64")}`;
export const FONTS = `
  @font-face{font-family:"Instrument Serif";src:url(${font("instrument-serif-latin-400-normal.woff2")}) format("woff2");font-weight:400}
  @font-face{font-family:"Instrument Sans";src:url(${font("instrument-sans-latin-standard-normal.woff2")}) format("woff2");font-weight:400 700}`;
export const PAPER = `radial-gradient(ellipse 75% 42% at 50% 78%,#e4e3fb 0%,rgba(228,227,251,0) 72%),radial-gradient(ellipse 55% 26% at 96% 2%,#fbe6da 0%,rgba(251,230,218,0) 70%),radial-gradient(ellipse 45% 24% at 0% 30%,#ecebfc 0%,rgba(236,235,252,0) 70%),#f6f4ef`;
export const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// The orange dot: a full stop, or the Chinese one (。).
export const headline = (text) => esc(text).replace(/([.。])$/, '<span class="dot">$1</span>');

// The store languages: the folder of the App Store (fastlane deliver) and of
// Google Play (fastlane supply) – the same, except Simplified Chinese.
export const STORE_LOCALES = {
  de: { appStore: "de-DE", play: "de-DE" },
  en: { appStore: "en-US", play: "en-US" },
  fr: { appStore: "fr-FR", play: "fr-FR" },
  zh: { appStore: "zh-Hans", play: "zh-CN" },
};
// The lang attribute of a page: the system picks the Chinese glyphs by it
// (Instrument Serif and Sans have none; Noto Serif/Sans CJK SC on Linux,
// Songti SC and PingFang SC on macOS take over).
export const htmlLang = (short) => (short === "zh" ? "zh-Hans" : short);


// Headline (ending in Flowplan's orange dot) and one line below it.
export const CAPTIONS = {
  "01-home": {
    de: ["Alles an einem Ort.", "Notizen, Projekte und dein Team"],
    en: ["Everything in one place.", "Notes, projects and your team"],
    fr: ["Tout au même endroit.", "Notes, projets et ton équipe"],
    zh: ["一切尽在一处。", "笔记、项目和你的团队"],
  },
  "02-widgets": {
    de: ["Widgets, die mitarbeiten.", "Aufgaben abhaken und Timer starten, ohne die App zu öffnen"],
    en: ["Widgets that get things done.", "Check off tasks and start the timer without opening the app"],
    fr: ["Des widgets qui agissent.", "Coche tes tâches et lance le chrono sans ouvrir l’app"],
    zh: ["会干活的小组件。", "无需打开应用，即可勾选任务、开始计时"],
  },
  "03-board": {
    de: ["Projekte im Blick.", "Board, Tabelle, Kalender und Zeitleiste"],
    en: ["Projects at a glance.", "Board, table, calendar and timeline"],
    fr: ["Projets en un clin d’œil.", "Kanban, tableau, calendrier et chronologie"],
    zh: ["项目一目了然。", "看板、表格、日历和时间线"],
  },
  "04-document": {
    de: ["Schreiben, das fließt.", "Dokumente mit Aufgaben, Tabellen und Erwähnungen"],
    en: ["Writing that flows.", "Docs with tasks, tables and mentions"],
    fr: ["L’écriture, tout simplement.", "Des documents avec tâches, tableaux et mentions"],
    zh: ["写作，行云流水。", "文档中可加入任务、表格和提及"],
  },
  "05-plan": {
    de: ["Jeden Tag ein Journal.", "Mit Serien, Rückblick und „An diesem Tag“"],
    en: ["A journal for every day.", "With streaks, a review and “On this day”"],
    fr: ["Un journal pour chaque jour.", "Avec séries, bilan et « À pareille date »"],
    zh: ["每天一篇日记。", "连续记录、复盘和“在这一天”"],
  },
  // Wide screens show the timeline (scripts/screenshots.mjs).
  "05-plan-wide": {
    de: ["Zeitpläne, die passen.", "Zeitleiste und Kalender für jede Datenbank"],
    en: ["Plans that hold up.", "Timeline and calendar for every database"],
    fr: ["Des plannings clairs.", "Chronologie et calendrier pour chaque base"],
    zh: ["计划清清楚楚。", "每个数据库都有时间线和日历"],
  },
  "06-inbox": {
    de: ["Nichts mehr verpassen.", "Erwähnungen, Kommentare und Aufgaben im Posteingang"],
    en: ["Never miss a thing.", "Mentions, comments and tasks in your inbox"],
    fr: ["Ne rate plus rien.", "Mentions, commentaires et tâches dans ta boîte de réception"],
    zh: ["不再错过任何事。", "提及、评论和任务都在收件箱里"],
  },
  "07-whiteboard": {
    de: ["Raum für Ideen.", "Whiteboards mit Zetteln, Formen und Mindmaps"],
    en: ["Room for ideas.", "Whiteboards with notes, shapes and mind maps"],
    fr: ["De la place pour tes idées.", "Tableaux blancs avec notes, formes et cartes mentales"],
    zh: ["给想法留出空间。", "白板上有便签、形状和思维导图"],
  },
  "08-profiles": {
    de: ["Dein Server, deine Daten.", "app.flowplan.org oder selbst gehostet, mit mehreren Profilen"],
    en: ["Your server, your data.", "app.flowplan.org or self-hosted, with several profiles"],
    fr: ["Ton serveur, tes données.", "app.flowplan.org ou auto-hébergé, avec plusieurs profils"],
    zh: ["数据由你掌控。", "app.flowplan.org 或自行托管，支持多个账户"],
  },
};
