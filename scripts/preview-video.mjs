// The App Store preview video (and a GIF for the README and the website),
// in the style of the store screenshots: for each scene a short card with the
// screenshot's headline on Flowplan's paper, then the real screen in motion –
// the start page, the widgets (a task checked off, the timer running), the
// projects board, a document, the whiteboard and the profiles – joined by
// cross-fades. 886×1920 (the App Store's size for 6.9" and 6.5" iPhones),
// 30 fps, H.264 with a silent AAC track, 15–30 s.
//
//   npm run preview                         (German, English, French, Chinese)
//   npm run preview -- --locales fr
//
// Like scripts/screenshots.mjs it starts a Flowplan development server per
// language (--flowplan ../flowplan, --port 3151). Needs ffmpeg. Writes
// store/app-store/preview/<de-DE|en-US|fr-FR|zh-Hans>/flowplan-preview-iphone.mp4
// (also usable as Google Play's promo video on YouTube) and
// store/preview/flowplan-<de|en|fr|zh>.gif; --stills <folder> also saves a few
// frames of each video for review.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { homeIndicator, statusBar } from "./frame.mjs";
import { CAPTIONS, FONTS, PAPER, STORE_LOCALES, headline, htmlLang } from "./store-style.mjs";
import { acceptLanguage, hideOnLoad, LOCALE_TAGS, recent, userAgent, withFlowplan } from "./store-flowplan.mjs";
import { settingsScreen, widgetsScreen } from "./store-mockups.mjs";

const { values: args } = parseArgs({
  options: {
    locales: { type: "string", default: "de,en,fr,zh" },
    flowplan: { type: "string", default: "../flowplan" },
    port: { type: "string", default: "3151" },
    chromium: { type: "string", default: process.env.CHROMIUM_PATH || "" },
    stills: { type: "string", default: "" },
  },
});
const root = new URL("..", import.meta.url).pathname;
const flowplan = resolve(root, args.flowplan);

// 886×1920 at scale 2: 443×960 points, status bar 62, home indicator 34.
const device = { width: 443, height: 960, scale: 2, top: 62, bottom: 34, platform: "ios" };
const SIZE = [886, 1920];
const FPS = 30;
const CARD = 1.1; // seconds a headline card is shown
const FADE = 0.4; // cross-fade between clips
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const ffmpeg = (...options) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...options]);

// ---- Cards ----

const cardStyle = `${FONTS}
  html,body{margin:0;width:${SIZE[0]}px;height:${SIZE[1]}px;overflow:hidden}
  body{background:${PAPER};color:#1d1c22;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Instrument Sans",system-ui,sans-serif;padding-bottom:120px;box-sizing:border-box}
  .dot{color:#f0663a}
  p{font-weight:500;color:#5e5a66;text-align:center;text-wrap:balance;line-height:1.3}`;

function card([title, subtitle], lang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${cardStyle}
    h1{margin:0 60px;font:400 82px/1.05 "Instrument Serif",Georgia,serif;letter-spacing:-.012em;text-align:center;text-wrap:balance}
    p{margin:26px 80px 0;font-size:34px}
  </style></head><body><h1>${headline(title)}</h1><p>${esc(subtitle)}</p></body></html>`;
}

function endCard(tagline, icon, lang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${cardStyle}
    img{width:200px;height:200px;border-radius:46px;box-shadow:0 18px 50px rgba(44,40,92,.2)}
    h1{margin:44px 0 0;font:400 108px/1 "Instrument Serif",Georgia,serif}
    p{margin:24px 90px 0;font-size:34px}
  </style></head><body><img src="${icon}"><h1>Flowplan<span class="dot">.</span></h1><p>${esc(tagline)}</p></body></html>`;
}
const TAGLINE = {
  de: "Für iPhone und iPad – mit app.flowplan.org oder deinem eigenen Server.",
  en: "For iPhone and iPad – with app.flowplan.org or your own server.",
  fr: "Pour iPhone et iPad – avec app.flowplan.org ou ton propre serveur.",
  zh: "适用于 iPhone 和 iPad——使用 app.flowplan.org 或你自己的服务器。",
};

// ---- Recording ----

// Every frame Chromium paints, with its time; then a clip of exactly
// `seconds` at 30 fps – over web pages with the status bar and home
// indicator the app paints.
async function record(page, work, name, seconds, act, overlay) {
  const dir = `${work}/${name}`;
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = `${dir}/${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, time: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: SIZE[0], maxHeight: SIZE[1], everyNthFrame: 1 });
  const started = Date.now();
  // A first frame even when nothing moves yet.
  await page.evaluate(() => (document.body.style.outline = "0 solid transparent"));
  await act();
  const rest = seconds * 1000 - (Date.now() - started);
  if (rest > 0) await page.waitForTimeout(rest);
  await cdp.send("Page.stopScreencast");
  await page.waitForTimeout(100);
  if (!frames.length) throw new Error(`No frames for ${name}`);
  let list = "";
  frames.forEach((frame, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].time : frames[0].time + seconds + 1;
    list += `file '${frame.file}'\nduration ${Math.max(0.001, next - frame.time).toFixed(4)}\n`;
  });
  list += `file '${frames.at(-1).file}'\n`;
  writeFileSync(`${dir}.txt`, list);
  const clip = `${work}/${name}.mp4`;
  const filter = overlay
    ? `[0:v]scale=${SIZE[0]}:${SIZE[1] - (device.top + device.bottom) * 2},pad=${SIZE[0]}:${SIZE[1]}:0:${device.top * 2}:color=0xfcfbf8,fps=${FPS}[p];[p][1:v]overlay=0:0,format=yuv420p[v]`
    : `[0:v]scale=${SIZE[0]}:${SIZE[1]},fps=${FPS},format=yuv420p[v]`;
  ffmpeg("-f", "concat", "-safe", "0", "-i", `${dir}.txt`, ...(overlay ? ["-i", overlay] : []), "-filter_complex", filter, "-map", "[v]", "-t", String(seconds), "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "14", clip);
  rmSync(dir, { recursive: true, force: true });
  return { file: clip, seconds };
}

async function still(browser, work, name, html, seconds) {
  const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${work}/${name}.png` });
  await page.close();
  const clip = `${work}/${name}.mp4`;
  ffmpeg("-loop", "1", "-i", `${work}/${name}.png`, "-t", String(seconds), "-r", String(FPS), "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "14", clip);
  return { file: clip, seconds };
}

// A soft circle where the screen is touched.
async function touch(page, x, y) {
  await page.evaluate(
    ([x, y]) => {
      const dot = document.createElement("div");
      dot.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(29,28,34,.18);box-shadow:0 0 0 2px rgba(255,255,255,.6);z-index:99999;pointer-events:none;transition:opacity .45s,transform .45s;transform:scale(.7)`;
      document.body.append(dot);
      requestAnimationFrame(() => (dot.style.transform = "scale(1)"));
      setTimeout(() => (dot.style.opacity = "0"), 380);
      setTimeout(() => dot.remove(), 900);
    },
    [x, y],
  );
}

// Smooth scrolling of the page, or (selector "board") of the widest scroller.
const smooth = (page, selector, by) =>
  page.evaluate(
    ([selector, by]) => {
      const el =
        selector === "board"
          ? [...document.querySelectorAll("*")].filter((e) => e.scrollWidth - e.clientWidth > 80 && /auto|scroll/.test(getComputedStyle(e).overflowX)).sort((a, b) => b.scrollWidth - a.scrollWidth)[0]
          : [...document.querySelectorAll("*")].filter((e) => e.scrollHeight - e.clientHeight > 80 && /auto|scroll/.test(getComputedStyle(e).overflowY)).sort((a, b) => b.clientHeight - a.clientHeight)[0];
      el?.scrollBy({ ...by, behavior: "smooth" });
    },
    [selector, by],
  );

async function scenes(browser, locale, { base, state, ids, dataDir }, work) {
  const context = (full) =>
    browser.newContext({
      viewport: full ? { width: device.width, height: device.height } : { width: device.width, height: device.height - device.top - device.bottom },
      deviceScaleFactor: device.scale,
      isMobile: !full,
      hasTouch: true,
      locale: LOCALE_TAGS[locale],
      timezoneId: "Europe/Berlin",
      extraHTTPHeaders: { "Accept-Language": acceptLanguage(locale) },
      userAgent: userAgent(device),
      storageState: state,
    });
  // The status bar and home indicator over web pages.
  const chrome = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] } });
  await chrome.setContent(`<html><body style="margin:0;width:${SIZE[0]}px;height:${SIZE[1]}px;background:transparent;position:relative">
    ${statusBar(device, "rgb(252, 251, 248)", 2)}
    <div style="position:absolute;left:0;right:0;bottom:0;height:${device.bottom * 2}px">${homeIndicator(device, "rgb(252, 251, 248)", 2)}</div></body></html>`);
  await chrome.screenshot({ path: `${work}/chrome.png`, omitBackground: true });
  await chrome.close();

  const web = async (name, hash, seconds, act) => {
    const ctx = await context(false);
    const page = await ctx.newPage();
    await hideOnLoad(page);
    await page.goto(`${base}/${hash}`);
    await page.waitForTimeout(4500);
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    const clip = await record(page, work, name, seconds, () => act(page), `${work}/chrome.png`);
    await ctx.close();
    return clip;
  };
  const native = async (name, html, seconds, act) => {
    const ctx = await context(true);
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const clip = await record(page, work, name, seconds, () => act(page), null);
    await ctx.close();
    return clip;
  };
  const clips = [];
  const scene = async (name, make) => {
    clips.push(await still(browser, work, `${name}-card`, card(CAPTIONS[name][locale], htmlLang(locale)), CARD));
    clips.push(await make());
    console.log(`${locale} ${name}`);
  };

  recent(dataDir, ids);
  await scene("01-home", () =>
    web("01-home", "", 3.2, async (page) => {
      await page.waitForTimeout(700);
      await smooth(page, "page", { top: 330 });
      await page.waitForTimeout(1300);
      await smooth(page, "page", { top: -330 });
    }),
  );
  await scene("02-widgets", () =>
    native("02-widgets", widgetsScreen(device, locale), 3.6, async (page) => {
      // The timer runs; a task and a habit are checked off right on the home screen.
      await page.evaluate(() => {
        let seconds = 47 * 60 + 12;
        setInterval(() => {
          seconds++;
          const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
          document.querySelectorAll(".timer strong, .island .t").forEach((el) => (el.textContent = text));
        }, 1000);
      });
      await page.waitForTimeout(800);
      const check = async (row) => {
        const box = await page.locator(`${row} svg`).first().boundingBox();
        await touch(page, box.x + box.width / 2, box.y + box.height / 2);
        await page.evaluate((row) => {
          const target = document.querySelector(row);
          const svg = target.querySelector("svg");
          svg.outerHTML = `<svg width="${svg.getAttribute("width")}" height="${svg.getAttribute("height")}" viewBox="0 0 24 24" style="flex:none"><circle cx="12" cy="12" r="10" fill="#4146e6"/><path d="m7.6 12.3 3 3 5.8-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          target.classList.add("done");
        }, row);
      };
      await check(".task:not(.done)");
      await page.waitForTimeout(1100);
      await check(".habit:last-child");
    }),
  );
  await scene("03-board", () =>
    web("03-board", `#page=${ids.projects}`, 3.4, async (page) => {
      const tab = page.getByRole("button", { name: "Board", exact: true }).first();
      const box = await tab.boundingBox();
      await touch(page, box.x + box.width / 2, box.y + box.height / 2);
      await tab.click();
      await page.waitForTimeout(1300);
      await smooth(page, "board", { left: 190 });
    }),
  );
  await scene("04-document", () =>
    web("04-document", `#page=${ids.kickoff}`, 3.4, async (page) => {
      await page.waitForTimeout(800);
      await smooth(page, "page", { top: 520 });
    }),
  );
  await scene("07-whiteboard", () =>
    web("07-whiteboard", `#page=${ids.whiteboard}`, 3.2, async (page) => {
      await page.waitForTimeout(500);
      // A slow zoom towards the notes.
      for (let i = 0; i < 18; i++) {
        await page.evaluate(() => {
          const el = document.querySelector("svg.wb-canvas");
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -3, ctrlKey: true, clientX: r.left + r.width * 0.22, clientY: r.top + r.height * 0.45 }));
        });
        await page.waitForTimeout(40);
      }
    }),
  );
  await scene("08-profiles", () =>
    native("08-profiles", settingsScreen(device, locale), 3.0, async (page) => {
      await page.waitForTimeout(900);
      const box = await page.locator(".profile").nth(1).boundingBox();
      await touch(page, box.x + box.width * 0.3, box.y + box.height / 2);
      // Switching: the check and "active" move to the other profile.
      await page.evaluate(() => {
        const [a, b] = document.querySelectorAll(".profile");
        const small = a.querySelector("small");
        const [server, active] = small.textContent.split(" · ");
        small.textContent = server;
        b.querySelector("small").textContent += ` · ${active}`;
        b.insertBefore(a.querySelector(".check"), b.querySelector(".link"));
      });
    }),
  );
  const icon = `data:image/png;base64,${readFileSync(`${root}store/icons/app-store-1024.png`).toString("base64")}`;
  clips.push(await still(browser, work, "end", endCard(TAGLINE[locale], icon, htmlLang(locale)), 1.8));
  return clips;
}

// Cross-fades all clips into one video with a silent sound track (the App
// Store wants one).
function join(clips, out) {
  let filter = "";
  let last = "[0:v]";
  let offset = 0;
  clips.slice(1).forEach((clip, i) => {
    offset += clips[i].seconds - FADE;
    filter += `${last}[${i + 1}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}];`;
    last = `[x${i}]`;
  });
  const total = clips.reduce((sum, clip) => sum + clip.seconds, 0) - FADE * (clips.length - 1);
  filter += `${last}format=yuv420p[v]`;
  ffmpeg(
    ...clips.flatMap((clip) => ["-i", clip.file]),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex", filter,
    "-map", "[v]", "-map", `${clips.length}:a`, "-t", total.toFixed(3),
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "slow", "-crf", "20", "-r", String(FPS), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    out,
  );
  return total;
}

const browser = await chromium.launch(args.chromium ? { executablePath: args.chromium, args: ["--no-sandbox"] } : {});
for (const locale of args.locales.split(",")) {
  const work = `${root}store/.cache/video-${locale}`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const options = { flowplan, port: args.port, distDir: ".next/store-preview", locale, browser };
  const clips = await withFlowplan(options, (server) => scenes(browser, locale, server, work));
  const out = `${root}store/app-store/preview/${STORE_LOCALES[locale].appStore}`;
  mkdirSync(out, { recursive: true });
  mkdirSync(`${root}store/preview`, { recursive: true });
  const mp4 = `${out}/flowplan-preview-iphone.mp4`;
  const seconds = join(clips, mp4);
  if (seconds < 15 || seconds > 30) console.warn(`The preview is ${seconds.toFixed(1)} s long; the App Store wants 15–30 s.`);
  const gif = `${root}store/preview/flowplan-${locale}.gif`;
  ffmpeg("-i", mp4, "-vf", "fps=10,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", gif);
  if (args.stills) {
    mkdirSync(args.stills, { recursive: true });
    for (const at of [0.6, 6, 10, 18]) ffmpeg("-ss", String(at), "-i", mp4, "-frames:v", "1", `${args.stills}/preview-${STORE_LOCALES[locale].appStore}-${String(at).replace(".", "_")}s.png`);
  }
  rmSync(work, { recursive: true, force: true });
  console.log(`${mp4.replace(root, "")} (${seconds.toFixed(1)} s)\n${gif.replace(root, "")}`);
}
await browser.close();
