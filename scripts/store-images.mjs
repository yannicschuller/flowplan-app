// Store images from the raw screenshots (scripts/screenshots.mjs): every
// screenshot in a device frame with a caption on the Flowplan gradient, in
// the exact sizes of the stores, plus Google Play's feature graphic.
//
//   npm run store:images
//
// Writes the layout fastlane reads:
//   store/app-store/screenshots/<de-DE|en-US>/NN-name-<device>.jpg
//   store/google-play/<de-DE|en-US>/images/{phoneScreenshots,sevenInchScreenshots,tenInchScreenshots}/N.jpg
//   store/google-play/<de-DE|en-US>/images/{featureGraphic.png,icon.png}
import { chromium } from "playwright";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { DEVICES } from "./devices.mjs";
import { dataUrl, frame, screen } from "./frame.mjs";

const root = new URL("..", import.meta.url).pathname;
const raw = `${root}store/.cache/raw`;
const LOCALES = { de: "de-DE", en: "en-US" };

// Output size per device (the stores' required pixel sizes).
const OUTPUT = {
  "iphone-69": [1320, 2868],
  "iphone-65": [1284, 2778],
  "ipad-13": [2064, 2752],
  "android-phone": [1080, 1920],
  "android-7": [1200, 1920],
  "android-10": [1600, 2560],
};
const PLAY_FOLDER = { "android-phone": "phoneScreenshots", "android-7": "sevenInchScreenshots", "android-10": "tenInchScreenshots" };

const CAPTIONS = {
  "01-home": [["Alles an einem Ort", "Notizen, Projekte und dein Team"], ["Everything in one place", "Notes, projects and your team"]],
  "02-board": [["Projekte im Blick", "Boards, Tabellen, Kalender und Zeitleisten"], ["Projects at a glance", "Boards, tables, calendars and timelines"]],
  "03-document": [["Schreiben, das fließt", "Dokumente und Wikis – gemeinsam in Echtzeit"], ["Writing that flows", "Docs and wikis – together in real time"]],
  "04-whiteboard": [["Raum für Ideen", "Unendliche Whiteboards für dein Team"], ["Room for ideas", "Infinite whiteboards for your team"]],
  "05-journal": [["Jeden Tag ein Journal", "Mit Rückblick, Serien und „An diesem Tag“"], ["A journal for every day", "With review, streaks and “On this day”"]],
  "06-overview": [["Alles schnell gefunden", "Teamspaces, Seiten und Suche"], ["Find everything fast", "Teamspaces, pages and search"]],
  "06-overview-tablet": [["Termine im Kalender", "Jede Datenbank auch als Kalender"], ["Never miss a deadline", "Every database as a calendar too"]],
  "07-server": [["Dein Server, deine Daten", "app.flowplan.org oder selbst gehostet"], ["Your server, your data", "app.flowplan.org or self-hosted"]],
};

function poster(width, height, device, shot, meta, [title, subtitle]) {
  const screenWidth = Math.round(width * (device.tablet ? 0.8 : 0.8));
  const titleSize = Math.round(width * (device.tablet ? 0.052 : 0.074));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
    body{background:radial-gradient(120% 60% at 15% 0%,#6c70ff 0%,rgba(108,112,255,0) 60%),radial-gradient(90% 50% at 100% 30%,#8a5cf0 0%,rgba(138,92,240,0) 70%),linear-gradient(160deg,#3e43e0 0%,#5a3fe0 55%,#3a2fa8 100%);
      font-family:-apple-system,"SF Pro Display",system-ui,"Segoe UI",Roboto,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center}
    h1{margin:${Math.round(height * 0.055)}px ${Math.round(width * 0.07)}px 0;font-size:${titleSize}px;line-height:1.08;font-weight:750;letter-spacing:-.02em;text-align:center}
    p{margin:${Math.round(titleSize * 0.35)}px ${Math.round(width * 0.08)}px 0;font-size:${Math.round(titleSize * 0.46)}px;line-height:1.3;opacity:.86;text-align:center}
    .device{margin-top:${Math.round(height * 0.04)}px}
  </style></head><body><h1>${title}</h1><p>${subtitle}</p>
  <div class="device">${frame(device, screen(device, shot, meta, screenWidth), screenWidth)}</div></body></html>`;
}

function featureGraphic(shot, meta, tagline) {
  const device = DEVICES["android-phone"];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1024px;height:500px;overflow:hidden}
    body{background:radial-gradient(80% 90% at 0% 0%,#6c70ff 0%,rgba(108,112,255,0) 60%),linear-gradient(135deg,#3e43e0 0%,#5a3fe0 60%,#3a2fa8 100%);font-family:-apple-system,system-ui,Roboto,sans-serif;color:#fff;position:relative}
    .text{position:absolute;left:64px;top:132px;width:520px}
    .logo{display:flex;align-items:center;gap:18px;font-size:58px;font-weight:750;letter-spacing:-.02em}
    .logo img{width:76px;height:76px;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    p{font-size:30px;line-height:1.3;margin:26px 0 0;opacity:.92}
    .phone{position:absolute;right:70px;top:40px;transform:rotate(-4deg)}
  </style></head><body>
  <div class="text"><div class="logo"><img src="${dataUrl(`${root}store/icons/google-play-512.png`)}">Flowplan</div><p>${tagline}</p></div>
  <div class="phone">${frame(device, screen(device, shot, meta, 250), 250)}</div></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(html, [width, height], file, type = "jpeg") {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 90 } : {}) });
}

for (const [short, locale] of Object.entries(LOCALES)) {
  if (!existsSync(`${raw}/${short}`)) {
    console.log(`No screenshots for ${short} – run npm run screenshots -- --locale ${short}`);
    continue;
  }
  const appStore = `${root}store/app-store/screenshots/${locale}`;
  rmSync(appStore, { recursive: true, force: true });
  mkdirSync(appStore, { recursive: true });
  for (const folder of Object.values(PLAY_FOLDER)) {
    const dir = `${root}store/google-play/${locale}/images/${folder}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  for (const [key, size] of Object.entries(OUTPUT)) {
    const device = DEVICES[key];
    const dir = `${raw}/${short}/${key}`;
    if (!existsSync(dir)) continue;
    const shots = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    let n = 0;
    for (const file of shots) {
      const name = file.replace(/\.png$/, "");
      const meta = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
      const caption = CAPTIONS[device.tablet && CAPTIONS[`${name}-tablet`] ? `${name}-tablet` : name][short === "de" ? 0 : 1];
      const html = poster(size[0], size[1], device, `${dir}/${file}`, meta, caption);
      n++;
      const out =
        device.platform === "ios"
          ? `${appStore}/${name}-${key}.jpg`
          : `${root}store/google-play/${locale}/images/${PLAY_FOLDER[key]}/${n}.jpg`;
      await render(html, size, out);
      console.log(out.replace(root, ""));
    }
  }
  const home = `${raw}/${short}/android-phone/01-home`;
  if (existsSync(`${home}.png`)) {
    const images = `${root}store/google-play/${locale}/images`;
    await render(
      featureGraphic(`${home}.png`, JSON.parse(readFileSync(`${home}.json`, "utf8")), short === "de" ? "Notizen, Projekte und dein Team – auf deinem Server." : "Notes, projects and your team – on your own server."),
      [1024, 500],
      `${images}/featureGraphic.png`,
      "png",
    );
    copyFileSync(`${root}store/icons/google-play-512.png`, `${images}/icon.png`);
    console.log(`${images.replace(root, "")}/featureGraphic.png`);
  }
}
await browser.close();
