// The App Store's creative assets (iOS 27 / iPadOS 27, App Store Connect →
// the version → "Header and Search Results", store/README.md → Creative
// assets): the product page header and the search results image, per
// language, in the style of the screenshots – Flowplan's warm paper, a
// headline in Instrument Serif with the orange dot, and the real screens in
// device frames, cut from the finished screenshots (npm run store:images).
//
//   npm run store:creative
//   npm run store:creative -- --guides <folder>   (also copies with the safe areas drawn in)
//   npm run store:creative -- --locales zh        (only these languages)
//
// Writes store/app-store/creative/<de-DE|en-US|fr-FR|zh-Hans>/{header,search-results}.png:
//   header          21:9, 3840×1646
//   search-results  3:2,  3840×2560 (Apple: 1920×1280 up to 3840×2560)
// PNG, sRGB, no alpha (Apple: no alpha channels or transparency). The
// headline and the main device stay inside the centred safe areas
// (SAFE below); the devices at the sides only show on wide screens.
// fastlane ios creative uploads them (fastlane/Fastfile).
import { chromium } from "playwright";
import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEVICES } from "./devices.mjs";
import { FONTS, PAPER, STORE_LOCALES, esc, headline, htmlLang } from "./store-style.mjs";

const { values: args } = parseArgs({
  options: {
    guides: { type: "string", default: "" },
    locales: { type: "string", default: Object.keys(STORE_LOCALES).join(",") },
    chromium: { type: "string", default: process.env.CHROMIUM_PATH || "" },
  },
});
const root = new URL("..", import.meta.url).pathname;
const LOCALES = Object.fromEntries(Object.entries(STORE_LOCALES).map(([short, { appStore }]) => [short, appStore]));

const SIZES = { header: [3840, 1646], "search-results": [3840, 2560] };
// What stays visible on every device and orientation, centred (Apple's
// templates; the iPhone in portrait shows little more than this).
const SAFE = { header: [1646, 661], "search-results": [2168, 1030] };

const TEXT = {
  header: {
    de: ["Notizen und Projekte im Fluss.", "Open Source, für dich und dein Team"],
    en: ["Notes and projects that flow.", "Open source, for you and your team"],
    fr: ["Notes et projets en toute fluidité.", "Open source, pour toi et ton équipe"],
    zh: ["笔记与项目，流畅自如。", "开源，为你和你的团队而生"],
  },
  "search-results": {
    de: ["Notizen, Aufgaben und Projekte in einer App."],
    en: ["Notes, tasks and projects in one app."],
    fr: ["Notes, tâches et projets dans une seule app."],
    zh: ["笔记、任务和项目，尽在一个应用。"],
  },
};

// Where the screen sits in the finished screenshots (scripts/store-images.mjs,
// poster(): the same on every frame of a device), and its corner radius there.
const CUT = {
  "iphone-69": { left: 119, top: 583, width: 1082, radius: 0.125 },
  "ipad-13": { left: 207, top: 578, width: 1651, radius: 0.04 },
};

// The screen of one screenshot as a data URL: from its top edge down to the
// bottom of the image (the devices run off the bottom, as in the screenshots).
async function cut(locale, name, key) {
  const file = `${root}store/app-store/screenshots/${locale}/${name}-${key}.png`;
  if (!existsSync(file)) throw new Error(`${file.replace(root, "")} missing – run npm run store:images`);
  const c = CUT[key];
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const { data, info } = await image.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // The bezel (#141318) left of and above the screen: the frame is where CUT says.
  const dark = (x, y) => data.slice((y * info.width + x) * 3, (y * info.width + x) * 3 + 3).every((v) => v < 48);
  if (!dark(c.left - 4, Math.round(height * 0.7)) || !dark(c.left + Math.round(c.width / 2), c.top - 4))
    throw new Error(`${file.replace(root, "")}: no device frame at the expected place – update CUT`);
  const png = await image.extract({ left: c.left, top: c.top, width: c.width, height: height - c.top }).png().toBuffer();
  return { src: `data:image/png;base64,${png.toString("base64")}`, ratio: (height - c.top) / c.width, key };
}

// A device as in the screenshots: thin dark bezel, light metal edge, soft
// shadow; `width` is the screen's width on the canvas.
function device(shot, width, style) {
  const dev = DEVICES[shot.key];
  const bezel = Math.round(width * (dev.tablet ? 0.024 : 0.032));
  const radius = Math.round(width * CUT[shot.key].radius) + 1;
  const edge = Math.max(2, Math.round(width * 0.004));
  return `<div class="device" style="${style};padding:${bezel}px ${bezel}px 0;background:#141318;border-radius:${radius + bezel}px ${radius + bezel}px 0 0;box-shadow:0 0 0 ${edge}px #c9c6cf,0 ${bezel * 3}px ${bezel * 7}px rgba(44,40,92,.20),0 ${bezel}px ${bezel * 2}px rgba(44,40,92,.10)">
    <div style="border-radius:${radius}px ${radius}px 0 0;overflow:hidden;width:${width}px;height:${Math.round(width * shot.ratio)}px"><img src="${shot.src}" style="display:block;width:${width}px"></div></div>`;
}

// The text block, shrunk until it fits its box (page script below).
const page = (width, height, body, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${FONTS}
  *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
  body{background:${PAPER};background-size:100% 100%;color:#1d1c22;position:relative;font-family:"Instrument Sans",system-ui,sans-serif}
  .device{position:absolute}
  .text{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  h1{margin:0;font:400 var(--size)/1.04 "Instrument Serif",Georgia,serif;letter-spacing:-.012em;text-wrap:balance}
  .dot{color:#f0663a}
  p{margin:calc(var(--size) * .3) 0 0;font-size:calc(var(--size) * .4);line-height:1.3;font-weight:500;color:#5e5a66;text-wrap:balance}
  .brand{position:absolute;display:flex;align-items:center;gap:36px;font:400 120px/1 "Instrument Serif",Georgia,serif;letter-spacing:-.01em}
  .brand img{width:132px;height:132px;border-radius:30px;box-shadow:0 14px 36px rgba(44,40,92,.18)}
</style></head><body>${body}</body></html>`;

const textBlock = ([title, subtitle], [x, y, w, h], size) =>
  `<div class="text" data-fit style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--size:${size}px"><h1>${headline(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>`;

// Centred box of a safe area, inset by `pad` on every side.
function safeBox(kind, pad) {
  const [W, H] = SIZES[kind];
  const [w, h] = SAFE[kind];
  return [(W - w) / 2 + pad, (H - h) / 2 + pad, w - 2 * pad, h - 2 * pad];
}

// Header: the line in the middle (what the iPhone shows), the iPad with the
// projects board on the left and two iPhones on the right, out of the safe area.
function header(short, shots) {
  const [W, H] = SIZES.header;
  const box = safeBox("header", 40);
  return page(W, H, `
    ${device(shots.board, 1060, `left:60px;top:430px;transform:rotate(-4deg);transform-origin:50% 100%`)}
    ${device(shots.document, 470, `left:3240px;top:560px;transform:rotate(5deg);transform-origin:50% 100%`)}
    ${device(shots.home, 540, `left:2870px;top:330px`)}
    ${textBlock(TEXT.header[short], box, 150)}`, htmlLang(short));
}

// Search results: the line in the upper half of the safe area, below it the
// iPad with the board between two iPhones (start page, widgets), all running
// off the bottom; the app icon and name above, outside the safe area.
function searchResults(short, shots) {
  const [W, H] = SIZES["search-results"];
  const [x, y, w] = safeBox("search-results", 0);
  return page(W, H, `
    <div class="brand" style="left:0;right:0;top:470px;justify-content:center"><img src="data:image/png;base64,${shots.icon}">Flowplan</div>
    ${device(shots.board, 1480, `left:${(W - 1480) / 2 - 36}px;top:1240px`)}
    ${device(shots.home, 600, `left:620px;top:1420px;transform:rotate(-3deg);transform-origin:50% 100%`)}
    ${device(shots.widgets, 600, `left:2620px;top:1420px;transform:rotate(3deg);transform-origin:50% 100%`)}
    ${textBlock(TEXT["search-results"][short], [x + 40, y, w - 80, 420], 190)}`, htmlLang(short));
}

// PNG for App Store Connect: sRGB, no alpha, a 256-colour palette with
// dithering like the screenshots.
const toPng = (buffer) => sharp(buffer).removeAlpha().toColourspace("srgb").png({ palette: true, colours: 256, quality: 92, dither: 0.8, effort: 10, compressionLevel: 9 }).toBuffer();

// The safe area drawn onto a copy, for review.
async function guide(buffer, kind, file) {
  const [W, H] = SIZES[kind];
  const [x, y, w, h] = safeBox(kind, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,.35)" mask="url(#m)"/><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000"/></mask><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#e5245e" stroke-width="8" stroke-dasharray="40 20"/></svg>`;
  await sharp(buffer).composite([{ input: Buffer.from(svg) }]).removeAlpha().png().toFile(file);
}

const browser = await chromium.launch(args.chromium ? { executablePath: args.chromium, args: ["--no-sandbox"] } : {});
const tab = await browser.newPage({ deviceScaleFactor: 1 });
const icon = (await sharp(`${root}store/icons/app-store-1024.png`).resize(264).png().toBuffer()).toString("base64");
for (const [short, locale] of Object.entries(LOCALES)) {
  if (!args.locales.split(",").includes(short)) continue;
  const shots = {
    icon,
    home: await cut(locale, "01-home", "iphone-69"),
    widgets: await cut(locale, "02-widgets", "iphone-69"),
    document: await cut(locale, "04-document", "iphone-69"),
    board: await cut(locale, "03-board", "ipad-13"),
  };
  const out = `${root}store/app-store/creative/${locale}`;
  mkdirSync(out, { recursive: true });
  for (const [kind, html] of [["header", header(short, shots)], ["search-results", searchResults(short, shots)]]) {
    const [width, height] = SIZES[kind];
    await tab.setViewportSize({ width, height });
    await tab.setContent(html, { waitUntil: "load" });
    await tab.evaluate(() => document.fonts.ready);
    // Shrink each text block until it fits its box: no line may leave the safe area.
    const fitted = await tab.evaluate(() =>
      [...document.querySelectorAll("[data-fit]")].map((box) => {
        let size = parseFloat(box.style.getPropertyValue("--size"));
        const fits = () => [...box.children].every((c) => c.scrollWidth <= box.clientWidth) && box.scrollHeight <= box.clientHeight && [...box.children].reduce((sum, c) => sum + c.offsetHeight, 0) <= box.clientHeight;
        while (!fits() && size > 40) box.style.setProperty("--size", `${(size -= 4)}px`);
        return size;
      }),
    );
    const png = await toPng(await tab.screenshot({ type: "png" }));
    writeFileSync(`${out}/${kind}.png`, png);
    console.log(`${out.replace(root, "")}/${kind}.png (text ${fitted.join(", ")} px, ${Math.round(png.length / 1024)} KB)`);
    if (args.guides) {
      mkdirSync(args.guides, { recursive: true });
      await guide(png, kind, `${args.guides}/${locale}-${kind}-guides.png`);
    }
  }
}
await browser.close();
