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
export const headline = (text) => esc(text).replace(/\.$/, '<span class="dot">.</span>');


// Headline (ending in Flowplan's orange dot) and one line below it.
export const CAPTIONS = {
  "01-home": {
    de: ["Alles an einem Ort.", "Notizen, Projekte und dein Team"],
    en: ["Everything in one place.", "Notes, projects and your team"],
    fr: ["Tout au même endroit.", "Notes, projets et ton équipe"],
  },
  "02-widgets": {
    de: ["Widgets, die mitarbeiten.", "Aufgaben abhaken und Timer starten, ohne die App zu öffnen"],
    en: ["Widgets that get things done.", "Check off tasks and start the timer without opening the app"],
    fr: ["Des widgets qui agissent.", "Coche tes tâches et lance le chrono sans ouvrir l’app"],
  },
  "03-board": {
    de: ["Projekte im Blick.", "Board, Tabelle, Kalender und Zeitleiste"],
    en: ["Projects at a glance.", "Board, table, calendar and timeline"],
    fr: ["Projets en un clin d’œil.", "Kanban, tableau, calendrier et chronologie"],
  },
  "04-document": {
    de: ["Schreiben, das fließt.", "Dokumente mit Aufgaben, Tabellen und Erwähnungen"],
    en: ["Writing that flows.", "Docs with tasks, tables and mentions"],
    fr: ["L’écriture, tout simplement.", "Des documents avec tâches, tableaux et mentions"],
  },
  "05-plan": {
    de: ["Jeden Tag ein Journal.", "Mit Serien, Rückblick und „An diesem Tag“"],
    en: ["A journal for every day.", "With streaks, a review and “On this day”"],
    fr: ["Un journal pour chaque jour.", "Avec séries, bilan et « À pareille date »"],
  },
  // Wide screens show the timeline (scripts/screenshots.mjs).
  "05-plan-wide": {
    de: ["Zeitpläne, die passen.", "Zeitleiste und Kalender für jede Datenbank"],
    en: ["Plans that hold up.", "Timeline and calendar for every database"],
    fr: ["Des plannings clairs.", "Chronologie et calendrier pour chaque base"],
  },
  "06-inbox": {
    de: ["Nichts mehr verpassen.", "Erwähnungen, Kommentare und Aufgaben im Posteingang"],
    en: ["Never miss a thing.", "Mentions, comments and tasks in your inbox"],
    fr: ["Ne rate plus rien.", "Mentions, commentaires et tâches dans ta boîte de réception"],
  },
  "07-whiteboard": {
    de: ["Raum für Ideen.", "Whiteboards mit Zetteln, Formen und Mindmaps"],
    en: ["Room for ideas.", "Whiteboards with notes, shapes and mind maps"],
    fr: ["De la place pour tes idées.", "Tableaux blancs avec notes, formes et cartes mentales"],
  },
  "08-profiles": {
    de: ["Dein Server, deine Daten.", "app.flowplan.org oder selbst gehostet, mit mehreren Profilen"],
    en: ["Your server, your data.", "app.flowplan.org or self-hosted, with several profiles"],
    fr: ["Ton serveur, tes données.", "app.flowplan.org ou auto-hébergé, avec plusieurs profils"],
  },
};
