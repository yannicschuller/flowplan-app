// Checks the iOS app's offline copy against a production build of Flowplan
// in Chromium, with the app's side simulated: the bridge script the app
// injects (src/bridge-script.ts), the copy in files (src/offline/store.ts
// over a folder, as FlowplanOfflineFiles.swift keeps it) and the stored
// page loaded at the instance's address without a network (what
// loadHTMLString does in WKWebView). No service worker is used.
//
//   FLOWPLAN_DIR=../flowplan npm run check:offline
//
// FLOWPLAN_DIR is a Flowplan checkout after `npm run build`.
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, type Page } from "playwright";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { copyDocument } from "../src/offline/copy";
import { reachedScript, returnScript } from "../src/offline/loader";
import { offlineAnswer, parseOfflineMessage } from "../src/offline/messages";
import { DATA_CACHE } from "../src/offline/policy";
import { OfflineCopy } from "../src/offline/store";
import { nodeFiles, sha256 } from "../test/offline-files";

const flowplan = resolve(process.env.FLOWPLAN_DIR || "../flowplan");
if (!existsSync(join(flowplan, ".next/standalone/server.js"))) {
  console.error(`No standalone build in ${flowplan} – run \`npm run build\` there first (FLOWPLAN_DIR).`);
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), "flowplan-app-offline-"));
const app = join(work, "app"),
  data = join(work, "data");
cpSync(join(flowplan, ".next/standalone"), app, { recursive: true });
cpSync(join(flowplan, ".next/static"), join(app, ".next/static"), { recursive: true });
cpSync(join(flowplan, "public"), join(app, "public"), { recursive: true });
const port = 3900 + Math.floor(Math.random() * 90);
const origin = `http://127.0.0.1:${port}`;
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` – ${detail}` : ""}`);
  if (!ok) failures++;
};
const seen = (page: Page, text: string, timeout = 20000) =>
  page
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    );

const server = spawn(process.execPath, ["server.js"], {
  cwd: app,
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1", FLOWPLAN_DATA_DIR: data, APP_URL: origin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
// CHROMIUM_PATH: a Chromium other than Playwright's own download.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    up = await fetch(`${origin}/api/health`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) throw new Error(`The server did not start:\n${log}`);
  const db = new DatabaseSync(join(data, "flowplan.sqlite"));
  const uid = randomUUID(),
    token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO users(id,subject,name,email) VALUES(?,?,?,?)").run(uid, `offline-app:${uid}`, "Offline App", `${uid}@example.test`);
  db.prepare("INSERT INTO sessions(token,user_id,groups_json,expires) VALUES(?,?,?,?)").run(createHash("sha256").update(token).digest("hex"), uid, "[]", Date.now() + 3600000);
  const headers = { origin, cookie: `flowplan_session=${token}`, "content-type": "application/json" };
  const post = async (body: Record<string, unknown>) => (await fetch(`${origin}/api/command`, { method: "POST", headers, body: JSON.stringify(body) })).json();
  const get = async (path: string) => (await fetch(`${origin}${path}`, { headers })).json();
  await post({ action: "profile.onboarded" });
  const workspace = await post({ action: "workspace.create", name: "Offline" });
  const boot = await get(`/api/bootstrap?workspace=${workspace.id}`);
  const space = boot.spaces[0].id;
  const doc = await post({ action: "page.create", workspaceId: workspace.id, spaceId: space, title: "Reiseplan" });
  db.prepare("UPDATE documents SET html=?,state=NULL WHERE page_id=?").run("<p>Zug um 8 Uhr ab Hauptbahnhof</p>", doc.id);
  const table = await post({ action: "page.create", workspaceId: workspace.id, spaceId: space, title: "Packliste", kind: "database" });
  const row = await post({ action: "row.create", pageId: table.id, cells: { title: "Reisepass" } });
  // A calendar view on a date property, and a dashboard.
  const database = (await get(`/api/pages/${table.id}`)).database;
  const dateField = { id: randomUUID(), name: "Datum", type: "date" };
  await post({
    action: "database.update",
    pageId: table.id,
    version: database.version,
    fields: [...database.fields, dateField],
    views: [...database.views, { id: randomUUID(), name: "Kalender", type: "calendar", dateField: dateField.id, filters: [], sorts: [] }],
  });
  const today = new Date().toISOString().slice(0, 10);
  await post({ action: "row.create", pageId: table.id, cells: { title: "Abfahrt", [dateField.id]: today } });
  const dashboard = await post({ action: "page.create", workspaceId: workspace.id, spaceId: space, title: "Übersicht", kind: "dashboard" });
  db.close();

  // The app's side: the copy in files, the bridge in every page.
  const files = nodeFiles(join(work, "offline"));
  const copy = new OfflineCopy("e2e", files, sha256);
  let returned = false;
  // The app's files the page took from the copy.
  let fromCopy = 0;
  const context = await browser.newContext({ locale: "de-DE", serviceWorkers: "block" });
  await context.addCookies([{ name: "flowplan_session", value: token, url: origin, httpOnly: true }]);
  await context.exposeBinding("__flowplanPost", async ({ page }, raw: string) => {
    const message = parsePageMessage(raw);
    if (message?.type === "offlineReturn") returned = true;
    const call = message?.type === "offline" ? parseOfflineMessage(message) : null;
    if (call?.op === "match" && String(call.key).startsWith("/_next/static/")) fromCopy++;
    if (call) await page.evaluate(await offlineAnswer(copy, call)).catch(() => {});
  });
  await context.addInitScript("window.ReactNativeWebView = { postMessage: (data) => window.__flowplanPost(String(data)) };");
  await context.addInitScript(bridgeScript({ server: origin, platform: "ios", version: "9.9.9", offline: true }));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(process.env.OFFLINE_DEBUG ? String(error.stack) : error.message));
  if (process.env.OFFLINE_DEBUG) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 300)));

  // 1. Switching it on stores the whole app and the pages in the app's copy.
  await page.goto(`${origin}/?w=${workspace.id}#settings/devices`);
  await page.getByRole("button", { name: "Auf diesem Gerät offline verfügbar machen" }).click();
  await page.getByText(/offline verfügbar\./).waitFor({ timeout: 60000 });
  const state = await copy.state();
  check("Offline-Kopie in der App angelegt", state.enabled && state.page, `${(state.bytes / 1024 / 1024).toFixed(1)} MB`);
  check("Einstellungen nennen die App", await seen(page, "In der Flowplan-App gespeichert"));
  const names = await copy.names();
  const statics = names.filter((n) => n.startsWith("flowplan-static-"));
  const staticKeys = statics.length ? await copy.keys(statics[0]) : [];
  check("Alle App-Dateien und Schriften gespeichert", staticKeys.some((k) => k === "/fonts.css") && staticKeys.filter((k) => k.startsWith("/_next/static/")).length > 50, `${staticKeys.length} Dateien`);
  // Opened online: kept like the service worker keeps them.
  await page.goto(`${origin}/?w=${workspace.id}#page=${doc.id}`);
  check("Dokument online", await seen(page, "Zug um 8 Uhr"));
  await page.goto(`${origin}/?w=${workspace.id}#page=${table.id}&row=${row.id}`);
  await page.waitForTimeout(1500);
  const rowKept = (await copy.keys(DATA_CACHE)).some((k) => k.startsWith(`/api/pages/${table.id}/rows/${row.id}`));
  check("Geöffneter Eintrag gespeichert", rowKept);

  // 2. A page loaded online loses the network: parts never opened come
  // from the copy (the loader's fallback).
  await page.goto(`${origin}/?w=${workspace.id}#page=${doc.id}`);
  await seen(page, "Zug um 8 Uhr");
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);
  // A script and a style sheet of the app this page never loaded, added
  // the way Turbopack adds them: the copy answers, the page hears no error.
  const loaded = new Set((await page.evaluate("[...document.scripts].map((s) => s.getAttribute('src'))")) as string[]);
  const script = staticKeys.find((k) => k.startsWith("/_next/static/chunks/") && k.endsWith(".js") && !loaded.has(k) && !k.includes("turbopack"));
  const sheet = staticKeys.find((k) => k.endsWith(".css") && k.startsWith("/_next/"));
  fromCopy = 0;
  // A string: page functions must not carry tsx's helpers.
  const outcome = await page.evaluate(`new Promise((resolve) => {
    const src = ${JSON.stringify(script)}, href = ${JSON.stringify(sheet)};
    const result = { script: "pending", sheet: "pending" };
    const done = () => result.script !== "pending" && result.sheet !== "pending" && resolve(JSON.stringify(result));
    const s = document.createElement("script");
    s.src = src;
    s.onerror = () => { result.script = "error"; done(); };
    document.head.appendChild(s);
    // The copy runs it in a script of its own whose src still reads as the
    // path (Turbopack waits for the chunk to register itself).
    const registered = setInterval(() => {
      if ([...document.scripts].some((e) => e !== s && e.getAttribute("src") === src)) {
        clearInterval(registered);
        result.script = "copy";
        done();
      }
    }, 100);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => { result.sheet = document.querySelector('style[data-flowplan-href="' + href + '"]') ? "copy" : "network"; done(); };
    l.onerror = () => { result.sheet = "error"; done(); };
    document.head.appendChild(l);
    setTimeout(() => resolve(JSON.stringify(result)), 15000);
  })`);
  check("Ohne Verbindung: nie geladene App-Dateien aus der Kopie (Seite war online geladen)", outcome === JSON.stringify({ script: "copy", sheet: "copy" }) && fromCopy >= 2, `${outcome}, ${fromCopy} aus der Kopie`);

  // 3. The app starts without a connection: the stored page.
  const html = await copyDocument(copy);
  check("Gespeicherte Seite gebaut", !!html, html ? `${(html.length / 1024).toFixed(0)} KB` : "");
  await page.route(`${origin}/`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html || "" }));
  const before = errors.length;
  await page.goto(`${origin}/#page=${doc.id}`);
  check("Offline-Hinweis sichtbar", await page.locator(".offline-banner").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  check("Dokument offline lesbar", await seen(page, "Zug um 8 Uhr"));
  await page.evaluate((id) => (location.hash = `#page=${id}`), table.id);
  check("Datenbank offline lesbar", await page.locator(".data-table").getByText("Reisepass").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  await page.evaluate(([t, r]) => (location.hash = `#page=${t}&row=${r}`), [table.id, row.id]);
  check("Eintrag offline lesbar", await page.locator(".row-document").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  await page.evaluate((id) => (location.hash = `#page=${id}`), dashboard.id);
  check("Dashboard offline", await page.locator(".dashboard").first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  await page.evaluate((id) => (location.hash = `#page=${id}`), table.id);
  const calendar = await page
    .getByRole("tab", { name: "Kalender" })
    .or(page.getByRole("button", { name: "Kalender" }))
    .first()
    .click({ timeout: 10000 })
    .then(() => seen(page, "Abfahrt"))
    .catch(() => false);
  check("Kalender offline", calendar);
  // React #418: a recoverable hydration mismatch (React renders the page
  // anew on the device) – the stored page starts with navigator.onLine
  // false; everything else counts.
  const failed = errors.slice(before).filter((e) => !e.includes("Minified React error #418"));
  check("Keine Skriptfehler auf der gespeicherten Seite", failed.length === 0, failed.join(" | "));

  // 4. Typed offline, synced once the instance answers again.
  await page.evaluate((id) => (location.hash = `#page=${id}`), doc.id);
  await seen(page, "Zug um 8 Uhr");
  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Gleis 4");
  await page.waitForTimeout(1500);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.setOffline(false);
  await page.evaluate(reachedScript);
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
  await page.evaluate(returnScript);
  for (let i = 0; i < 40 && !returned; i++) await page.waitForTimeout(250);
  check("Gespeicherte Seite gibt nach Rückkehr der Verbindung ab", returned);
  await page.goto(`${origin}/#page=${doc.id}`);
  let synced = false;
  for (let i = 0; i < 40 && !synced; i++) {
    const answer = await fetch(`${origin}/api/pages/${doc.id}`, { headers }).then((r) => r.text());
    synced = answer.includes("Gleis 4");
    if (!synced) await page.waitForTimeout(500);
  }
  check("Offline getippter Text abgeglichen", synced);

  // 5. Switching it off removes the copy.
  await page.goto(`${origin}/?w=${workspace.id}&v=2#settings/devices`);
  await page.getByRole("button", { name: "Offline-Kopien entfernen" }).click();
  await page.getByText("Offline-Kopien auf diesem Gerät wurden entfernt.").waitFor();
  const after = await copy.state();
  const left = (await copy.names()).filter((n) => n !== "flowplan-settings");
  check("Offline-Kopie entfernt", !after.enabled && left.length === 0, left.join(", "));
  await copy.wipe();
  check("Profil-Ordner gelöscht", (await files.list("")).length === 0);
} catch (error) {
  console.error(error);
  failures++;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `${failures} check(s) failed.` : "All checks passed.");
process.exit(failures ? 1 : 0);
