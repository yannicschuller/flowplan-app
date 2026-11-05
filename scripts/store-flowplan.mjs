// A Flowplan development server with the demo workspace for the store
// material (scripts/screenshots.mjs, scripts/preview-video.mjs): starts
// `next dev` in the Flowplan repository with fresh data, signs in to the
// public demo (its workspace is made in the language of the request), adds a
// few made-up pages, people and notifications, and stops the server again.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const root = new URL("..", import.meta.url).pathname;
export const LOCALE_TAGS = { de: "de-DE", en: "en-US", fr: "fr-FR", zh: "zh-CN" };
export const acceptLanguage = (locale) => `${LOCALE_TAGS[locale]},${locale};q=0.9`;
// Hidden: the development overlay, the demo banner, and the editing
// affordances touch screens always show (cover buttons, block handles).
export const HIDE_CSS = "nextjs-portal,.demo-banner,.cover-change,.add-cover,.block-handle-layer,.block-manager-trigger{display:none!important}";
export async function hideOnLoad(page) {
  await page.addInitScript((css) => {
    // The web app's "Flowplan is an app, too" sheet (components/app-promo.tsx)
    // never shows inside the app; here it counts as seen.
    try {
      localStorage.setItem("flowplan-app-promo", "1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: css })));
  }, HIDE_CSS);
}

export const userAgent = (device) =>
  device.platform === "ios"
    ? `Mozilla/5.0 (${device.tablet ? "iPad; CPU OS 18_7" : "iPhone; CPU iPhone OS 18_7"} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlowplanMobile/1.0.0`
    : `Mozilla/5.0 (Linux; Android 15; ${device.tablet ? "Pixel Tablet" : "Pixel 9"}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 ${device.tablet ? "" : "Mobile "}Safari/537.36 FlowplanMobile/1.0.0`;

// node:sqlite prints an "experimental" warning once; the rest is quiet.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

// ---- The server ----

function startServer(dataDir) {
  // next dev writes its dist folder into tsconfig.json; put the files back after.
  const keep = ["tsconfig.json", "next-env.d.ts"].map((file) => [file, readFileSync(`${flowplan}/${file}`, "utf8")]);
  const child = spawn("npx", ["next", "dev", "--port", args.port], {
    cwd: flowplan,
    detached: true,
    stdio: ["ignore", "ignore", openSync(`${root}store/.cache/server.log`, "w")],
    env: { ...process.env, FLOWPLAN_DIST_DIR: ".next/store-screenshots", FLOWPLAN_DATA_DIR: dataDir, APP_URL: base, NEXT_TELEMETRY_DISABLED: "1" },
  });
  return () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    for (const [file, text] of keep) writeFileSync(`${flowplan}/${file}`, text);
  };
}

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(60_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`No Flowplan server on ${base}`);
}

// ---- Content: the demo workspace plus a few things that make it look used ----

export const say = (locale) => (de, en, fr, zh) => ({ de, en, fr, zh })[locale];
const PEOPLE = [
  ["Mara Klein", "mara@example.com"],
  ["Jonas Weber", "jonas@example.com"],
  ["Aylin Demir", "aylin@example.com"],
];
const stamp = (msAgo) => new Date(Date.now() - msAgo).toISOString().replace("T", " ").slice(0, 19);
const HOUR = 3600_000;

export function seed(dataDir, locale) {
  const s = say(locale);
  const db = new DatabaseSync(`${dataDir}/flowplan.sqlite`);
  db.exec("PRAGMA busy_timeout=5000");
  const user = db.prepare("SELECT id FROM users WHERE demo_until IS NOT NULL ORDER BY rowid DESC LIMIT 1").get().id;
  const workspace = db.prepare("SELECT workspace_id id FROM members WHERE user_id=?").get(user).id;
  const space = db.prepare("SELECT id FROM spaces WHERE workspace_id=?").get(workspace).id;
  const pages = db.prepare("SELECT id,title,kind,icon FROM pages WHERE workspace_id=? AND deleted_at IS NULL").all(workspace);
  const find = (test) => pages.find(test)?.id;
  const ids = {
    projects: find((p) => p.kind === "database" && p.icon === "🚀"),
    team: find((p) => p.kind === "database" && p.icon === "👥"),
    whiteboard: find((p) => p.kind === "whiteboard"),
    journal: find((p) => p.kind === "journal"),
    welcome: find((p) => p.icon === "👋"),
  };

  db.prepare("UPDATE users SET name=? WHERE id=?").run("Alex Morgan", user);
  db.prepare("UPDATE workspaces SET name=? WHERE id=?").run(s("Mein Arbeitsbereich", "My workspace", "Mon espace de travail", "我的工作区"), workspace);
  const people = PEOPLE.map(([name, email]) => {
    const id = randomUUID();
    db.prepare("INSERT INTO users(id,subject,name,email) VALUES(?,?,?,?)").run(id, `store:${id}`, name, email);
    db.prepare("INSERT INTO members VALUES(?,?,?)").run(workspace, id, "editor");
    return { id, name };
  });
  // The demo's welcome page talks about the demo; the start page is enough.
  if (ids.welcome) db.prepare("UPDATE pages SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(ids.welcome);

  // A kick-off document with a bit of everything.
  const kickoff = randomUUID();
  const title = s("Kickoff Website-Relaunch", "Website relaunch kickoff", "Lancement de la refonte du site", "网站改版启动会");
  const mention = (person) => `<span data-mention="${person.id}" class="mention">@${person.name}</span>`;
  const task = (text, checked = false) => `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"></label><div><p>${text}</p></div></li>`;
  const cells = (row, tag = "td") => `<tr>${row.map((cell) => `<${tag}><p>${cell}</p></${tag}>`).join("")}</tr>`;
  const html =
    s("<h2>Ziel</h2>", "<h2>Goal</h2>", "<h2>Objectif</h2>", "<h2>目标</h2>") +
    s(
      "<p>Bis Ende November geht die neue Website live – schneller, klarer und auf jedem Gerät gut lesbar.</p>",
      "<p>The new website goes live by the end of November – faster, clearer and easy to read on every device.</p>",
      "<p>Le nouveau site sera en ligne fin novembre : plus rapide, plus clair et lisible sur tous les appareils.</p>",
      "<p>新网站将在 11 月底上线——更快、更清晰，在任何设备上都易于阅读。</p>",
    ) +
    s(
      '<aside data-callout="tip"><p>Entscheidungen und offene Fragen sammeln wir direkt auf dieser Seite.</p></aside>',
      '<aside data-callout="tip"><p>We collect decisions and open questions right on this page.</p></aside>',
      '<aside data-callout="tip"><p>Les décisions et les questions ouvertes sont réunies sur cette page.</p></aside>',
      '<aside data-callout="tip"><p>决定和待解决的问题都直接记录在这个页面上。</p></aside>',
    ) +
    s("<h2>Nächste Schritte</h2>", "<h2>Next steps</h2>", "<h2>Prochaines étapes</h2>", "<h2>后续步骤</h2>") +
    '<ul data-type="taskList">' +
    task(s("Interviews auswerten", "Analyse the interviews", "Analyser les entretiens", "分析访谈结果"), true) +
    task(s("Sitemap abstimmen", "Agree on the sitemap", "Valider l’arborescence", "确定网站地图"), true) +
    task(`${s("Texte für die Startseite", "Copy for the home page", "Textes de la page d’accueil", "首页文案")} ${mention(people[0])}`) +
    task(`${s("Entwürfe präsentieren", "Present the designs", "Présenter les maquettes", "展示设计稿")} ${mention(people[2])}`) +
    "</ul>" +
    s("<h2>Zeitplan</h2>", "<h2>Schedule</h2>", "<h2>Calendrier</h2>", "<h2>时间安排</h2>") +
    "<table><tbody>" +
    cells(s(["Phase", "Wer", "Bis"], ["Phase", "Who", "Due"], ["Phase", "Qui", "Échéance"], ["阶段", "负责人", "截止"]), "th") +
    cells([s("Konzept", "Concept", "Concept", "方案"), "Mara", s("6. Nov.", "Nov 6", "6 nov.", "11月6日")]) +
    cells([s("Design", "Design", "Design", "设计"), "Aylin", s("13. Nov.", "Nov 13", "13 nov.", "11月13日")]) +
    cells([s("Umsetzung", "Build", "Développement", "开发"), "Jonas", s("27. Nov.", "Nov 27", "27 nov.", "11月27日")]) +
    "</tbody></table>";
  db.prepare("INSERT INTO pages(id,workspace_id,space_id,parent_id,title,kind,created_by,position,icon,cover) VALUES(?,?,?,?,?,?,?,?,?,?)").run(
    kickoff, workspace, space, null, title, "document", user, -1, "🎯", "",
  );
  db.prepare("INSERT INTO documents(page_id,html) VALUES(?,?)").run(kickoff, html);


  // The inbox, in the server's words (the web app translates them).
  const inbox = [
    [people[0], `${people[0].name} hat dich in „${title}“ erwähnt`, kickoff, "mention", 0.3, false],
    [people[1], `${people[1].name} kommentiert „${pages.find((p) => p.id === ids.projects).title}“`, ids.projects, "comment", 1.2, false],
    [people[2], `${people[2].name} hat dir eine Aufgabe in „${title}“ gegeben: ${s("Entwürfe präsentieren", "Present the designs", "Présenter les maquettes", "展示设计稿")}`, kickoff, "mention", 3, false],
    [people[0], `${people[0].name} hat „${pages.find((p) => p.id === ids.whiteboard).title}“ geändert`, ids.whiteboard, "change", 20, true],
    [people[1], `${people[1].name} hat „${pages.find((p) => p.id === ids.team).title}“ mit dir geteilt`, ids.team, "share", 28, true],
  ];
  for (const [, body, page, kind, hours, read] of inbox)
    db.prepare("INSERT INTO notifications(id,user_id,body,page_id,kind,created_at,read_at) VALUES(?,?,?,?,?,?,?)").run(
      randomUUID(), user, body, page, kind, stamp(hours * HOUR), read ? stamp((hours - 0.1) * HOUR) : null,
    );
  db.close();
  return { ...ids, kickoff, user, workspace };
}

// "Recently edited" on the start page: the kick-off, the projects, the
// whiteboard and the team first, the journal days after them; nothing
// "recently viewed". Again before each start page, as opening pages for the
// other shots changes both.
export function recent(dataDir, ids) {
  const db = new DatabaseSync(`${dataDir}/flowplan.sqlite`);
  db.exec("PRAGMA busy_timeout=5000");
  db.prepare("UPDATE pages SET updated_at=? WHERE workspace_id=?").run(stamp(30 * HOUR), ids.workspace);
  [ids.kickoff, ids.projects, ids.whiteboard, ids.team].forEach((id, i) => db.prepare("UPDATE pages SET updated_at=? WHERE id=?").run(stamp((i * 2 + 0.2) * HOUR), id));
  db.prepare("DELETE FROM page_visits WHERE user_id=?").run(ids.user);
  db.close();
}


// ---- The server ----

// next dev writes its dist folder into tsconfig.json and next-env.d.ts; they
// are put back afterwards (checked out again if they had no changes before).
function protect(flowplan) {
  const files = ["tsconfig.json", "next-env.d.ts"];
  let clean = false;
  try {
    execFileSync("git", ["diff", "--quiet", "--", ...files], { cwd: flowplan });
    clean = true;
  } catch {}
  const saved = files.map((file) => [file, readFileSync(`${flowplan}/${file}`, "utf8")]);
  return () => {
    if (clean) {
      try {
        execFileSync("git", ["checkout", "--", ...files], { cwd: flowplan });
        return;
      } catch {}
    }
    for (const [file, text] of saved) writeFileSync(`${flowplan}/${file}`, text);
  };
}

async function waitFor(base) {
  for (let i = 0; i < 240; i++) {
    try {
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(60_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`No Flowplan server on ${base}`);
}

// Runs `work({ base, state, ids, dataDir })` against a fresh server in one language.
export async function withFlowplan({ flowplan, port, distDir, locale, browser, keep = false }, work) {
  const base = `http://localhost:${port}`;
  const dataDir = `${root}store/.cache/data-${locale}-${port}`;
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const restore = protect(flowplan);
  const child = spawn("npx", ["next", "dev", "--port", String(port)], {
    cwd: flowplan,
    detached: true,
    stdio: ["ignore", "ignore", openSync(`${root}store/.cache/server-${port}.log`, "w")],
    env: { ...process.env, FLOWPLAN_DIST_DIR: distDir, FLOWPLAN_DATA_DIR: dataDir, APP_URL: base, NEXT_TELEMETRY_DISABLED: "1" },
  });
  try {
    await waitFor(base);
    // The public demo: a workspace with example content in the reader's language.
    const db = new DatabaseSync(`${dataDir}/flowplan.sqlite`);
    db.prepare("INSERT INTO instance_settings(key,value) VALUES('publicDemo','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
    db.close();
    const context = await browser.newContext({ locale: LOCALE_TAGS[locale], extraHTTPHeaders: { "Accept-Language": acceptLanguage(locale) } });
    const response = await context.request.post(`${base}/api/auth/trial`, { headers: { origin: base }, data: {} });
    if (!response.ok()) throw new Error(`Demo sign-in failed (${response.status()}): ${await response.text()}`);
    const state = await context.storageState();
    await context.close();
    const ids = seed(dataDir, locale);
    return await work({ base, state, ids, dataDir });
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await new Promise((done) => setTimeout(done, 1500));
    restore();
    if (!keep) rmSync(dataDir, { recursive: true, force: true });
  }
}
