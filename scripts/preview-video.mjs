// The App Store preview video (and a GIF) from a real walk through Flowplan:
// home, roadmap board, a document, the whiteboard and the journal, recorded
// with Chromium's screencast at 886×1920 (the App Store's size for 6.9" and
// 6.5" iPhones) with the status bar and home indicator the app paints.
//
// Run it right after `npm run screenshots -- --locale <de|en>` against the
// same server (it uses the whiteboard and journal made there); needs ffmpeg.
//   npm run preview -- --locale de
//
// Writes store/app-store/preview/<de-DE|en-US>/flowplan-preview-iphone.mp4
// (also usable as Google Play's promo video on YouTube) and
// store/preview/flowplan-<de|en>.gif.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { homeIndicator, statusBar } from "./frame.mjs";

const { values: args } = parseArgs({
  options: { locale: { type: "string", default: "de" }, base: { type: "string", default: "http://localhost:3150" } },
});
const root = new URL("..", import.meta.url).pathname;
const base = args.base.replace(/\/$/, "");
const de = args.locale === "de";
const say = (german, english) => (de ? german : english);
const locale = de ? "de-DE" : "en-US";

// 886×1920 at scale 2: 443×960 points, status bar 62, home indicator 34.
const device = { width: 443, height: 960, scale: 2, top: 62, bottom: 34, platform: "ios" };
const viewport = { width: device.width, height: device.height - device.top - device.bottom };
const work = `${root}store/.cache/video-${args.locale}`;
rmSync(work, { recursive: true, force: true });
mkdirSync(`${work}/frames`, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: device.scale,
  isMobile: true,
  hasTouch: true,
  locale,
  extraHTTPHeaders: { "Accept-Language": de ? "de-DE,de;q=0.9" : "en-US,en;q=0.9" },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlowplanMobile/1.0.0",
});
const page = await context.newPage();
await page.goto(`${base}/`);
await page.request.post(`${base}/api/auth/demo`, { headers: { origin: base }, data: {} });
await page.goto(`${base}/`);
await page.waitForTimeout(3000);
const hide = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await hide();

// The overlay: status bar and home indicator in the colours of the app's pages.
const chrome = await browser.newPage({ viewport: { width: 886, height: 1920 } });
await chrome.setContent(
  `<html><body style="margin:0;width:886px;height:1920px;background:transparent;position:relative">
    ${statusBar(device, "rgb(252, 251, 248)", 2)}
    <div style="position:absolute;left:0;right:0;bottom:0;height:68px">${homeIndicator(device, "rgb(252, 251, 248)", 2)}</div>
  </body></html>`,
);
await chrome.screenshot({ path: `${work}/chrome.png`, omitBackground: true });

// Every frame Chromium paints, with its time.
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `${work}/frames/${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, time: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 886, maxHeight: 1728, everyNthFrame: 1 });

const pause = (ms) => page.waitForTimeout(ms);
const tap = async (locator) => {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.tap().catch(() => locator.click());
};
const open = async (title) => {
  await tap(page.getByRole("button", { name: say("Navigation öffnen", "Open navigation") }));
  await pause(900);
  await tap(page.getByRole("button", { name: title, exact: true }).first());
  await pause(1600);
  await hide();
};
const scroll = async (dy) => {
  await page.evaluate((top) => (document.querySelector(".main-scroll") || document.scrollingElement).scrollBy({ top, behavior: "smooth" }), dy);
  await pause(700);
};

await pause(1200);
await scroll(260);
await pause(500);
await scroll(-260);
await open(say("Produkt-Roadmap", "Product roadmap"));
await pause(700);
await tap(page.getByRole("button", { name: "Board", exact: true }));
await pause(2000);
await open(say("Willkommen bei Flowplan", "Welcome to Flowplan"));
await pause(1000);
await scroll(420);
await pause(900);
await open(say("Ideen-Board", "Idea board"));
await tap(page.getByRole("button", { name: say("Alles anzeigen", "Show everything") }));
await pause(2200);
await open("Journal");
await pause(1800);
await open(say("Startseite", "Home"));
await pause(1000);

await cdp.send("Page.stopScreencast");
await browser.close();

// Frames with their durations → 30 fps with the overlay and a silent sound
// track (App Store previews need one).
const start = frames[0].time;
const end = frames.at(-1).time + 0.5;
let list = "";
frames.forEach((frame, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].time : end;
  list += `file '${frame.file}'\nduration ${Math.max(0.001, next - frame.time).toFixed(4)}\n`;
});
list += `file '${frames.at(-1).file}'\n`;
writeFileSync(`${work}/frames.txt`, list);
const seconds = end - start;
if (seconds < 15 || seconds > 30) console.warn(`The preview is ${seconds.toFixed(1)} s long; the App Store wants 15–30 s.`);

const out = `${root}store/app-store/preview/${locale}`;
mkdirSync(out, { recursive: true });
mkdirSync(`${root}store/preview`, { recursive: true });
const mp4 = `${out}/flowplan-preview-iphone.mp4`;
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", `${work}/frames.txt`,
  "-i", `${work}/chrome.png`,
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  "-filter_complex",
  "[0:v]scale=886:1728,pad=886:1920:0:124:color=0xfcfbf8,fps=30[page];[page][1:v]overlay=0:0,format=yuv420p[v]",
  "-map", "[v]", "-map", "2:a", "-shortest",
  "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "slow", "-crf", "18", "-r", "30",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
  mp4,
]);
const gif = `${root}store/preview/flowplan-${args.locale}.gif`;
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-i", mp4,
  "-vf", "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
  gif,
]);
console.log(`${mp4.replace(root, "")} (${seconds.toFixed(1)} s)\n${gif.replace(root, "")}`);
