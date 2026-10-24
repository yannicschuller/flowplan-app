// Native screens for the store screenshots that Playwright cannot drive in
// the web app: the home screen with Flowplan's widgets (and a running timer
// as Live Activity) and the app settings with profiles. They are drawn as
// HTML after the real layouts – the widgets after
// plugins/widget-suite/ios/SuiteViews.swift with the gallery's sample data
// (SuiteProvider.swift → FPSamples) and its texts (plugins/widget-suite/strings.js),
// the settings after src/screens/Settings.tsx and Profiles.tsx with the
// texts of src/i18n.ts. scripts/screenshots.mjs renders them like any other
// screen; each page fills the whole device screen, status bar included.
import { createRequire } from "node:module";
import { homeIndicator, statusBar } from "./frame.mjs";

const require = createRequire(import.meta.url);
const { strings } = require("../plugins/widget-suite/strings.js");

// The widget texts: English is the key, German and French the translation.
const widgetText = (lang) => (english) => (lang === "en" ? english : strings[english]?.[lang] ?? english);

// What the settings screen says (src/i18n.ts).
const SETTINGS = {
  de: {
    settingsTitle: "App-Einstellungen",
    done: "Fertig",
    profiles: "Profile",
    profilesText: "Mitteilungen, Widgets und die Zeiterfassung gehören zum aktiven Profil.",
    addProfile: "Profil hinzufügen",
    active: "Aktiv",
    rename: "Umbenennen",
    notifications: "Mitteilungen",
    notificationsOn: "Neue Erwähnungen, Kommentare und Erinnerungen erscheinen als Mitteilung und als Zahl am App-Symbol.",
    appLock: "App-Sperre",
    appLockText: "Flowplan mit Face ID, Touch ID oder Code entsperren, wenn die App geöffnet wird.",
    liveActivitiesTitle: "Live-Aktivitäten",
    ongoingTitle: "Laufende Benachrichtigungen",
    activityMeeting: "Laufende Besprechung",
    activityJobs: "Import- und Export-Fortschritt",
    activitiesText: "Fokus, Sprachnotizen und die Zeiterfassung erscheinen immer, solange sie laufen.",
    work: "Arbeit",
    personal: "Privat",
  },
  en: {
    settingsTitle: "App settings",
    done: "Done",
    profiles: "Profiles",
    profilesText: "Notifications, widgets and the timer belong to the active profile.",
    addProfile: "Add profile",
    active: "Active",
    rename: "Rename",
    notifications: "Notifications",
    notificationsOn: "New mentions, comments and reminders appear as notifications and as a number on the app icon.",
    appLock: "App lock",
    appLockText: "Unlock Flowplan with Face ID, Touch ID or passcode when the app opens.",
    liveActivitiesTitle: "Live Activities",
    ongoingTitle: "Ongoing notifications",
    activityMeeting: "Meeting now",
    activityJobs: "Import and export progress",
    activitiesText: "Focus, voice memos and the timer always appear while they run.",
    work: "Work",
    personal: "Personal",
  },
  fr: {
    settingsTitle: "Réglages de l’app",
    done: "OK",
    profiles: "Profils",
    profilesText: "Les notifications, les widgets et le chronomètre appartiennent au profil actif.",
    addProfile: "Ajouter un profil",
    active: "Actif",
    rename: "Renommer",
    notifications: "Notifications",
    notificationsOn: "Les nouvelles mentions, commentaires et rappels apparaissent en notification et en pastille sur l’icône.",
    appLock: "Verrouillage de l’app",
    appLockText: "Déverrouiller Flowplan avec Face ID, Touch ID ou code à l’ouverture.",
    liveActivitiesTitle: "Activités en direct",
    ongoingTitle: "Notifications en cours",
    activityMeeting: "Réunion en cours",
    activityJobs: "Progression des imports et exports",
    activitiesText: "La concentration, les mémos vocaux et le chrono apparaissent toujours tant qu’ils tournent.",
    work: "Travail",
    personal: "Perso",
  },
};

// SF Symbols, redrawn as outlines.
const ICONS = {
  checklist: '<path d="M4 6.5 5.5 8 8 5M4 12.5 5.5 14 8 11M4 18.5 5.5 20 8 17M11 6.5h9M11 12.5h9M11 18.5h9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 3h4M18 7l1.5-1.5"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  pencil: '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.9a2 2 0 0 1 2.8 2.8L12 15l-3.5.9.9-3.5 9.1-9.5Z"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" fill="currentColor"/><circle cx="12" cy="12.8" r="3.3" stroke="#fff"/>',
  number: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h15M3.5 15h15"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z"/>',
  file: '<path d="M6.5 3h7l4 4v13.5a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5v-17a.5.5 0 0 1 .5-.5ZM13.5 3v4h4M9 12h6M9 16h6"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  cards: '<rect x="4" y="7" width="12" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/>',
  scribble: '<path d="M4 17c3-6 5-9 7-8s-3 7-1 8 5-6 7-6-1 6 3 5"/>',
  seal: '<path d="m12 2.5 2.3 1.7 2.8-.2.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.2L12 21.5l-2.3-1.7-2.8.2-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.2L12 2.5Z" fill="currentColor"/><path d="m8.6 12 2.3 2.3 4.5-4.6" stroke="#fff"/>',
};
const icon = (name, size, color = "currentColor", width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${ICONS[name]}</svg>`;
const circle = (size, done, accent) =>
  done
    ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="flex:none"><circle cx="12" cy="12" r="10" fill="${accent}"/><path d="m7.6 12.3 3 3 5.8-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="flex:none"><circle cx="12" cy="12" r="9.6" fill="none" stroke="#8e8b96" stroke-width="1.6"/></svg>`;

const BRAND = "#4146e6"; // FPStyle.brand
const LATE = "#d14242"; // FPStyle.late
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// The widgets of the gallery with their sample data, in one language.
function widgets(lang, now, android) {
  const L = widgetText(lang);
  const locale = { de: "de-DE", en: "en-US", fr: "fr-FR" }[lang];
  const time = (hour, minute = 0) => new Date(2026, 0, 5, hour, minute).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const shortDate = (date) => date.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const due = (days) => (days === 0 ? [L("Today"), false] : days === 1 ? [L("Tomorrow"), false] : days === -1 ? [L("Yesterday"), true] : [shortDate(addDays(now, days)), days < 0]);
  const hours = (value) => {
    const minutes = Math.round(value * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
  };
  const header = (name, title, trailing = "") =>
    `<div class="head">${icon(name, 13, BRAND, 2.4)}<span>${esc(title)}</span><i></i>${trailing ? `<em>${esc(trailing)}</em>` : ""}</div>`;
  const tasks = [
    ["Send offer to Miller", "Sales", -1, false],
    ["Prepare the retro", "Team", 0, true],
    ["Submit travel expenses", "Finance", 1, false],
  ];
  const tasksWidget = `<section class="w medium">${header("checklist", L("My tasks"), "4")}
    ${tasks
      .map(([text, page, days, done]) => {
        const [label, late] = due(days);
        return `<div class="task${done ? " done" : ""}">${circle(21, done, BRAND)}<div class="grow"><b>${esc(L(text))}</b><small>${esc(L(page))}</small></div><em class="${late ? "late" : ""}">${esc(label)}</em></div>`;
      })
      .join("")}</section>`;
  const today = `<section class="w small">${header("calendar", L("Today"))}
    ${[
      [time(9), L("Stand-up"), true],
      [time(14), L("Client meeting Miller"), true],
      ["", L("Prepare the retro"), false],
    ]
      .map(([at, title, event]) => `<div class="event"><span class="at"${at.length > 5 ? ' style="font-size:9.5px"' : ""}>${event ? esc(at) : icon("checklist", 12, "#8e8b96", 2.2)}</span><span class="bar${event ? "" : " task"}"></span><b>${esc(title)}</b></div>`)
      .join("")}</section>`;
  const timer = `<section class="w small">${header("timer", L("This week"))}
    <div class="big">${hours(17.25)}</div><div class="sub">${esc(L("Today"))} ${hours(3.5)}</div><i class="grow"></i>
    <div class="timer"><div class="grow"><strong>47:12</strong><small>${esc(L("Write offer"))}</small></div><span class="stop"><svg width="11" height="11" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="#1d1c22"/></svg></span></div></section>`;
  const habits = [
    ["Run", true],
    ["Read", true],
    ["No sugar", false],
  ];
  const journal = `<section class="w medium">${header("book", L("Journal"))}
    <div class="row"><div class="journal">${icon("seal", 26, BRAND)}<b>${esc(L("My journal"))}</b><small>${esc(L("%d-day streak").replace("%d", "6"))}</small></div>
    <div class="grow habits"><div class="hh"><span>${esc(L("Habits"))}</span><span>2/3</span></div>
    ${habits.map(([name, done]) => `<div class="habit">${circle(19, done, BRAND)}<span>${esc(L(name))}</span></div>`).join("")}</div></div></section>`;
  const capture = `<section class="w medium">${header("pencil", L("Quick capture"), L("Inbox"))}<i class="grow"></i>
    <div class="buttons">${[
      ["pencil", "Note"],
      ["check", "Task"],
      ["mic", "Voice memo"],
      ["camera", "Photo"],
    ]
      .map(([name, label]) => `<div class="btn">${icon(name, 22, BRAND, 2.2)}<span>${esc(L(label))}</span></div>`)
      .join("")}</div></section>`;
  const history = [28, 29, 29, 31, 30, 32, 33, 33, 35, 36, 38, 39, 41, 42];
  const points = history.map((value, i) => `${(i / 13) * 100},${48 - ((value - 28) / 14) * 44}`).join(" ");
  const counter = `<section class="w medium">${header("number", L("Applications"))}
    <div class="row" style="align-items:flex-end;flex:1"><div><div class="big" style="font-size:40px">42</div><div class="sub">${esc(L("Records"))}</div></div>
    <svg class="grow" viewBox="0 0 100 50" preserveAspectRatio="none" style="height:56px"><polyline points="${points}" fill="none" stroke="${BRAND}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg></div></section>`;
  const pinned = `<section class="w medium">${header("star", L("Favorites"))}
    <div class="pins">${[
      ["file", L("Weekly plan"), ""],
      ["table", "Roadmap", ""],
      ["cards", L("Website relaunch"), "Roadmap"],
      ["scribble", L("Brainstorming"), ""],
    ]
      .map(([name, title, detail]) => `<div class="pin">${icon(name, 16, BRAND, 2)}<div class="grow"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</div></div>`)
      .join("")}</div></section>`;
  return { tasksWidget, today, timer, journal, capture, counter, pinned };
}

const WIDGET_CSS = (scale, android) => `
  .w{background:#fcfbf8;border-radius:${android ? 26 : 23}px;padding:${android ? 15 : 14}px ${android ? 16 : 15}px;display:flex;flex-direction:column;gap:7px;box-shadow:0 1px 2px rgba(20,16,60,.08);color:#1d1c22;overflow:hidden}
  .small{height:${scale.small}px}.medium{height:${scale.small}px}
  .head{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${BRAND};white-space:nowrap}
  .head i{flex:1}.head em{font-style:normal;color:#8e8b96;font-weight:500;font-size:11px;overflow:hidden;text-overflow:ellipsis}
  .grow{flex:1;min-width:0}
  b{font-weight:500;font-size:14.5px;line-height:1.2;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  small{display:block;font-size:11px;color:#8e8b96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .task{display:flex;align-items:center;gap:9px}.task em{font-style:normal;font-size:11px;font-weight:500;color:#8e8b96;white-space:nowrap}
  .task em.late{color:${LATE}}.task.done b{color:#8e8b96;text-decoration:line-through}
  .event{display:flex;align-items:center;gap:7px}.event .at{width:42px;font-size:11.5px;font-weight:500;color:#8e8b96;font-variant-numeric:tabular-nums;white-space:nowrap;display:flex}
  .event .bar{width:3px;height:14px;border-radius:1.5px;background:${BRAND};flex:none}.event .bar.task{background:#8e8b96}.event b{font-size:13.5px}
  .big{font-size:29px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.05;margin-top:2px}
  .sub{font-size:12px;color:#8e8b96}
  .timer{display:flex;align-items:center;gap:8px}.timer strong{font-size:16px;color:${BRAND};font-variant-numeric:tabular-nums}
  .stop{width:30px;height:30px;border-radius:50%;background:#ebe9e3;display:grid;place-items:center;flex:none}
  .row{display:flex;gap:14px;align-items:flex-start}
  .journal{width:118px;display:flex;flex-direction:column;gap:4px}.journal b{font-weight:600;font-size:15px}
  .hh{display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:#8e8b96;margin-bottom:6px}
  .habit{display:flex;align-items:center;gap:7px;font-size:14px;margin-top:5px}
  .pins{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:4px}.pin{display:flex;gap:8px;align-items:flex-start}.pin b{font-size:14px}
  .buttons{display:flex;gap:8px}.btn{flex:1;min-height:66px;border-radius:14px;background:#efede7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:11.5px;font-weight:500;white-space:nowrap}
`;

// Home screen: wallpaper, status bar with the timer as Live Activity in the
// Dynamic Island (iOS) or as ongoing notification icon (Android), widgets.
export function widgetsScreen(device, lang, now = new Date()) {
  const android = device.platform === "android";
  const w = widgets(lang, now, android);
  // iPad widgets are drawn larger, as the home screen of a 13" iPad shows them.
  const zoom = device.width >= 1000 ? 1.3 : 1;
  const gap = device.tablet ? 20 : android ? 14 : 18;
  const pad = device.tablet ? 34 : android ? 14 : 22;
  const columns = device.tablet ? 2 : 1;
  const width = (device.width / zoom - pad * 2 - gap * (columns - 1)) / columns;
  const small = Math.round((width - gap) / 2);
  const grid = (items) => `<div class="grid">${items}</div>`;
  const pair = (a, b) => `<div class="pair">${a}${b}</div>`;
  const column = (...items) => `<div class="col">${items.join("")}</div>`;
  const body = device.tablet
    ? grid(column(w.tasksWidget, pair(w.today, w.timer), w.counter) + column(w.journal, w.capture, w.pinned))
    : android && device.height < 700
      ? grid(column(w.tasksWidget, pair(w.today, w.timer), w.journal))
      : grid(column(w.tasksWidget, pair(w.today, w.timer), w.journal, w.capture));
  const island = device.platform === "ios" && !device.tablet;
  const live = island
    ? `<div class="island"><span>${icon("timer", 15, "#8f93ff", 2.4)}</span><span class="t">47:12</span></div>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${device.width}px;height:${device.height}px;overflow:hidden}
    body{font-family:-apple-system,"SF Pro Text",Inter,system-ui,sans-serif;position:relative;
      background:radial-gradient(90% 55% at 15% 8%,#8d90ff 0%,rgba(141,144,255,0) 70%),radial-gradient(80% 60% at 100% 55%,#f3b59c 0%,rgba(243,181,156,0) 65%),radial-gradient(90% 60% at 10% 100%,#c9c2f2 0%,rgba(201,194,242,0) 70%),linear-gradient(170deg,#5d61e8 0%,#9a8ff0 45%,#e9c6c0 100%)}
    .grid{position:absolute;left:${pad}px;width:${device.width / zoom - pad * 2}px;top:${(device.top + (device.tablet ? 40 : android ? 18 : 16)) / zoom}px;display:flex;gap:${gap}px;zoom:${zoom}}
    .col{flex:1;display:flex;flex-direction:column;gap:${gap}px;min-width:0}.pair{display:flex;gap:${gap}px}.pair>.w{flex:1;min-width:0}
    ${WIDGET_CSS({ small }, android)}
    .island{position:absolute;left:50%;top:11px;height:36px;width:206px;margin-left:-103px;background:#000;border-radius:20px;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 12px;z-index:3}
    .island .t{color:#8f93ff;font:600 15px/1 -apple-system,Inter,sans-serif;font-variant-numeric:tabular-nums}
  </style></head><body>
    <div style="position:absolute;inset:0 0 auto 0;height:${device.top}px">${statusBar(device, "rgba(0,0,0,0)", 1)}</div>
    ${live}
    ${body}
    ${homeIndicator(device, "rgba(0,0,0,0)", 1)}
  </body></html>`;
}

// App settings (a page sheet on iOS) with two profiles.
export function settingsScreen(device, lang) {
  const t = SETTINGS[lang];
  const android = device.platform === "android";
  const sheet = device.platform === "ios";
  const profiles = [
    [t.work, "app.flowplan.org", true],
    [t.personal, "notes.example.org", false],
  ];
  const toggle = (on) => `<span class="switch${on ? " on" : ""}"><i></i></span>`;
  const content = `
    <div class="bar"><strong>${esc(t.settingsTitle)}</strong><span>${esc(t.done)}</span></div>
    <div class="scroll">
      <h3>${esc(t.profiles)}</h3>
      <div class="list">${profiles
        .map(
          ([name, server, active]) => `<div class="profile"><div class="grow"><b>${esc(name)}</b><small>${esc(server)}${active ? ` · ${esc(t.active)}` : ""}</small></div>${active ? '<span class="check">✓</span>' : ""}<span class="link">${esc(t.rename)}</span></div>`,
        )
        .join("")}</div>
      <p class="note">${esc(t.profilesText)}</p>
      <div class="button">${esc(t.addProfile)}</div>
      <h3>${esc(t.notifications)}</h3>
      <div class="section"><p>${esc(t.notificationsOn)}</p></div>
      <h3>${esc(t.appLock)}</h3>
      <div class="section switchrow"><p>${esc(t.appLockText)}</p>${toggle(true)}</div>
      <h3>${esc(android ? t.ongoingTitle : t.liveActivitiesTitle)}</h3>
      <div class="section">
        <div class="switchrow"><p>${esc(t.activityMeeting)}</p>${toggle(true)}</div>
        <div class="switchrow" style="margin-top:12px"><p>${esc(t.activityJobs)}</p>${toggle(true)}</div>
        <p class="note" style="margin:12px 0 0">${esc(t.activitiesText)}</p>
      </div>
    </div>`;
  const sheetTop = device.top + (device.tablet ? 60 : 10);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${device.width}px;height:${device.height}px;overflow:hidden}
    body{font-family:-apple-system,"SF Pro Text",Inter,system-ui,sans-serif;color:#1d1c22;background:${sheet ? (device.tablet ? "#8f8c95" : "#1d1c22") : "#fcfbf8"};position:relative}
    .page{position:absolute;inset:${sheet ? `${sheetTop}px ${device.tablet ? 156 : 0}px ${device.tablet ? 60 : 0}px` : `${device.top}px 0 ${device.bottom}px`};background:#fcfbf8;border-radius:${sheet ? (device.tablet ? "14px" : "12px 12px 0 0") : 0};overflow:hidden}
    .behind{position:absolute;left:${device.tablet ? 0 : 10}px;right:${device.tablet ? 0 : 10}px;top:${device.top}px;height:40px;background:#55535c;border-radius:12px 12px 0 0;opacity:${device.tablet ? 0 : 1}}
    .bar{display:flex;align-items:center;justify-content:space-between;padding:${android ? 14 : 14}px 16px 12px;border-bottom:.5px solid #e4e0d6}
    .bar strong{font-size:17px;font-weight:700}.bar span{font-size:17px;font-weight:600;color:#3b3fd8}
    .scroll{padding:0 16px;max-width:640px;margin:0 auto}
    h3{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#6f6b77;margin:22px 4px 8px}
    .list,.section{border:.5px solid #e4e0d6;border-radius:14px;background:#fff}
    .section{padding:16px}.section p{margin:0;font-size:16px;line-height:22px}
    .profile{display:flex;align-items:center;gap:10px;padding:10px 14px;min-height:56px}.profile+.profile{border-top:.5px solid #e4e0d6}
    .profile b{font-size:16px;font-weight:600;display:block}.profile small{font-size:13px;color:#6f6b77}
    .grow{flex:1;min-width:0}.check{color:#3b3fd8;font-size:18px;font-weight:700}.link{color:#3b3fd8;font-size:15px;font-weight:600;padding:4px}
    .note{font-size:13px;line-height:18px;color:#6f6b77;margin:8px 4px 0}
    .button{margin-top:12px;border:1px solid #e4e0d6;border-radius:12px;min-height:48px;display:grid;place-items:center;font-size:16px;font-weight:600}
    .switchrow{display:flex;align-items:center;gap:12px}.switchrow p{flex:1}
    .switch{width:51px;height:31px;border-radius:16px;background:#e4e0d6;position:relative;flex:none}.switch.on{background:#3b3fd8}
    .switch i{position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2)}.switch.on i{left:22px}
  </style></head><body>
    ${statusBar(device, sheet ? (device.tablet ? "#8f8c95" : "#1d1c22") : "#fcfbf8", 1)}
    ${sheet && !device.tablet ? '<div class="behind"></div>' : ""}
    <div class="page">${content}</div>
    ${sheet ? "" : homeIndicator(device, "#fcfbf8", 1)}
  </body></html>`;
}
