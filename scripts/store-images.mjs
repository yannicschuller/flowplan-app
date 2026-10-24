// Store images from the raw screenshots (scripts/screenshots.mjs): each
// screen in a device frame under a short headline, on Flowplan's warm paper
// with its ultramarine accent, in the exact sizes of the stores – PNG, sRGB,
// no alpha, compressed to a palette. Plus Google Play's feature graphic.
//
//   npm run store:images
//   npm run store:images -- --contact <folder>   (also one contact sheet per language)
//
// Writes the layout fastlane reads:
//   store/app-store/screenshots/<de-DE|en-US|fr-FR>/NN-name-<device>.png
//   store/google-play/<de-DE|en-US|fr-FR>/images/{phoneScreenshots,sevenInchScreenshots,tenInchScreenshots}/N.png
//   store/google-play/<de-DE|en-US|fr-FR>/images/{featureGraphic.png,icon.png}
import { chromium } from "playwright";
import sharp from "sharp";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEVICES } from "./devices.mjs";
import { dataUrl, screen } from "./frame.mjs";
import { CAPTIONS, FONTS, PAPER, esc, headline } from "./store-style.mjs";

const { values: args } = parseArgs({
  options: {
    contact: { type: "string", default: "" },
    chromium: { type: "string", default: process.env.CHROMIUM_PATH || "" },
  },
});
const root = new URL("..", import.meta.url).pathname;
const raw = `${root}store/.cache/raw`;
const LOCALES = { de: "de-DE", en: "en-US", fr: "fr-FR" };

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

const FEATURE = {
  de: "Notizen, Projekte und dein Team – auf deinem Server.",
  en: "Notes, projects and your team – on your own server.",
  fr: "Notes, projets et ton équipe – sur ton serveur.",
};

// A modern device: thin dark bezel, a light metal edge, a soft shadow.
function device(dev, meta, shot, screenWidth) {
  const inner = meta.full
    ? `<img src="${dataUrl(shot)}" style="display:block;width:${screenWidth}px;height:${(screenWidth * dev.height) / dev.width}px">`
    : screen(dev, shot, meta, screenWidth);
  const bezel = Math.round(screenWidth * (dev.tablet ? 0.024 : 0.032));
  const radius = Math.round(screenWidth * (dev.tablet ? 0.04 : dev.platform === "ios" ? 0.125 : 0.085));
  const edge = Math.max(2, Math.round(screenWidth * 0.004));
  return `<div style="padding:${bezel}px;background:#141318;border-radius:${radius + bezel}px;box-shadow:0 0 0 ${edge}px #c9c6cf,0 ${bezel * 3}px ${bezel * 7}px rgba(44,40,92,.20),0 ${bezel}px ${bezel * 2}px rgba(44,40,92,.10)">
    <div style="border-radius:${radius}px;overflow:hidden;transform:translateZ(0)">${inner}</div></div>`;
}

function poster(width, height, dev, shot, meta, [title, subtitle]) {
  const tablet = dev.tablet;
  const title1 = Math.round(width * (tablet ? 0.062 : 0.086));
  const sub = Math.round(width * (tablet ? 0.024 : 0.036));
  const top = Math.round(height * (tablet ? 0.055 : 0.062));
  // The same room for the text on every frame (one line of headline, two
  // below it), so the devices line up across the set.
  const header = top + title1 * 1.04 + sub * 0.55 + sub * 1.3 * 2;
  const textHeight = header + height * 0.035;
  // The device is as large as fits, running a little off the bottom edge.
  const bleed = height * (tablet ? 0.05 : 0.07);
  const screenWidth = Math.round(Math.min(width * (tablet ? 0.8 : 0.82), ((height - textHeight + bleed) * dev.width) / dev.height));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
    body{background:${PAPER};color:#1d1c22;display:flex;flex-direction:column;align-items:center;font-family:"Instrument Sans",system-ui,sans-serif}
    h1{margin:${top}px ${Math.round(width * 0.07)}px 0;font:400 ${title1}px/1.04 "Instrument Serif",Georgia,serif;letter-spacing:-.012em;text-align:center;text-wrap:balance}
    .dot{color:#f0663a}
    p{margin:${Math.round(sub * 0.55)}px ${Math.round(width * 0.09)}px 0;font-size:${sub}px;line-height:1.3;font-weight:500;color:#5e5a66;text-align:center;text-wrap:balance}
    .device{margin-top:${Math.round(height * 0.035)}px}
    header{height:${Math.ceil(header)}px;display:flex;flex-direction:column;align-items:center;flex:none}
  </style></head><body><header><h1>${headline(title)}</h1><p>${esc(subtitle)}</p></header>
  <div class="device">${device(dev, meta, shot, screenWidth)}</div></body></html>`;
}

function featureGraphic(shot, meta, tagline) {
  const dev = DEVICES["android-phone"];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
    html,body{margin:0;width:1024px;height:500px;overflow:hidden}
    body{background:${PAPER};font-family:"Instrument Sans",system-ui,sans-serif;color:#1d1c22;position:relative}
    .text{position:absolute;left:64px;top:138px;width:540px}
    .logo{display:flex;align-items:center;gap:18px;font:400 64px/1 "Instrument Serif",Georgia,serif;letter-spacing:-.01em}
    .logo img{width:74px;height:74px;border-radius:17px;box-shadow:0 8px 22px rgba(44,40,92,.18)}
    p{font-size:29px;line-height:1.3;margin:26px 0 0;color:#5e5a66;font-weight:500}
    .phone{position:absolute;right:84px;top:44px;transform:rotate(-4deg)}
  </style></head><body>
  <div class="text"><div class="logo"><img src="${dataUrl(`${root}store/icons/google-play-512.png`)}">Flowplan<span style="color:#f0663a">.</span></div><p>${esc(tagline)}</p></div>
  <div class="phone">${device(dev, meta, shot, 240)}</div></body></html>`;
}

// PNG for the stores: sRGB, no alpha, palette with dithering (a fraction of
// the size of a full-colour PNG; the paper's gradients stay smooth).
async function writePng(buffer, file) {
  const png = await sharp(buffer).removeAlpha().toColourspace("srgb").png({ palette: true, colours: 256, quality: 92, dither: 0.8, effort: 10, compressionLevel: 9 }).toBuffer();
  writeFileSync(file, png);
}

const browser = await chromium.launch(args.chromium ? { executablePath: args.chromium, args: ["--no-sandbox"] } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(html, [width, height], file) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await writePng(await page.screenshot({ type: "png" }), file);
}

for (const [short, locale] of Object.entries(LOCALES)) {
  if (!existsSync(`${raw}/${short}`)) {
    console.log(`No screenshots for ${short} – run npm run screenshots -- --locales ${short}`);
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
  const sheet = [];
  for (const [key, size] of Object.entries(OUTPUT)) {
    const dev = DEVICES[key];
    const dir = `${raw}/${short}/${key}`;
    if (!existsSync(dir)) continue;
    const shots = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    const row = [];
    let n = 0;
    for (const file of shots) {
      const name = file.replace(/\.png$/, "");
      const meta = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
      const caption = CAPTIONS[dev.width >= 760 && CAPTIONS[`${name}-wide`] ? `${name}-wide` : name][short];
      n++;
      const out = dev.platform === "ios" ? `${appStore}/${name}-${key}.png` : `${root}store/google-play/${locale}/images/${PLAY_FOLDER[key]}/${n}.png`;
      await render(poster(size[0], size[1], dev, `${dir}/${file}`, meta, caption), size, out);
      row.push(out);
      console.log(out.replace(root, ""));
    }
    if (["iphone-69", "ipad-13", "android-phone"].includes(key) && row.length) sheet.push(row);
  }
  const home = `${raw}/${short}/android-phone/01-home`;
  if (existsSync(`${home}.png`)) {
    const images = `${root}store/google-play/${locale}/images`;
    await render(featureGraphic(`${home}.png`, JSON.parse(readFileSync(`${home}.json`, "utf8")), FEATURE[short]), [1024, 500], `${images}/featureGraphic.png`);
    copyFileSync(`${root}store/icons/google-play-512.png`, `${images}/icon.png`);
    console.log(`${images.replace(root, "")}/featureGraphic.png`);
  }
  // Contact sheet for review: one row per device class, all frames side by side.
  if (args.contact && sheet.length) {
    mkdirSync(args.contact, { recursive: true });
    const rowHeight = 760, gap = 28;
    const rows = await Promise.all(
      sheet.map((files) =>
        Promise.all(
          files.map(async (file) => {
            const { data, info } = await sharp(file).resize({ height: rowHeight }).png().toBuffer({ resolveWithObject: true });
            return { input: data, width: info.width };
          }),
        ),
      ),
    );
    const width = Math.max(...rows.map((r) => r.reduce((sum, item) => sum + item.width + gap, gap)));
    const composite = [];
    rows.forEach((r, y) => {
      let x = gap;
      for (const item of r) {
        composite.push({ input: item.input, left: x, top: gap + y * (rowHeight + gap) });
        x += item.width + gap;
      }
    });
    await sharp({ create: { width, height: gap + rows.length * (rowHeight + gap), channels: 3, background: "#d9d6cf" } })
      .composite(composite)
      .png({ compressionLevel: 9 })
      .toFile(`${args.contact}/contact-${locale}.png`);
    console.log(`${args.contact}/contact-${locale}.png`);
  }
}
await browser.close();
