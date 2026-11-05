// Store screenshots from the real Flowplan web UI, in German, English,
// French and Simplified Chinese: starts a Flowplan development server per language (fresh data,
// the demo workspace in that language), adds a little more made-up content,
// and drives the pages with Playwright in the screen sizes of the store
// devices. Saves each page area (between status bar and home indicator)
// with the colours at its edges, like the app paints them. Two native
// screens – the home screen with widgets and the app settings with profiles
// – come from scripts/store-mockups.mjs. scripts/store-images.mjs then puts
// everything into frames with captions.
//
//   npm run screenshots                               (all languages and devices)
//   npm run screenshots -- --locales fr --only iphone-69,ipad-13 --shots 01-home
//
// Needs the Flowplan repository next to this one (--flowplan ../flowplan)
// with its dependencies installed. Writes store/.cache/raw/<de|en|fr|zh>/<device>/.
// Options: --port 3150, --chromium <path to a Chromium binary>, --keep (keep
// the data directories in store/.cache/data-<locale>-<port>).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEVICES } from "./devices.mjs";
import { acceptLanguage, hideOnLoad, LOCALE_TAGS, recent, userAgent, withFlowplan } from "./store-flowplan.mjs";
import { settingsScreen, widgetsScreen } from "./store-mockups.mjs";

const { values: args } = parseArgs({
  options: {
    locales: { type: "string", default: "de,en,fr,zh" },
    flowplan: { type: "string", default: "../flowplan" },
    port: { type: "string", default: "3150" },
    only: { type: "string", default: "" },
    shots: { type: "string", default: "" },
    chromium: { type: "string", default: process.env.CHROMIUM_PATH || "" },
    keep: { type: "boolean", default: false },
  },
});
const root = new URL("..", import.meta.url).pathname;
const flowplan = resolve(root, args.flowplan);

// The colour most of a row of the screenshot has, like the app samples it.
async function edgeColors(page, viewport) {
  return page.evaluate(({ width, height }) => {
    const pick = (y) => {
      const el = document.elementsFromPoint(width / 2, y).find((e) => {
        const bg = getComputedStyle(e).backgroundColor;
        return bg && !/rgba\(.*, 0\)$/.test(bg) && bg !== "transparent";
      });
      return el ? getComputedStyle(el).backgroundColor : getComputedStyle(document.body).backgroundColor;
    };
    return { top: pick(1), bottom: pick(height - 2) };
  }, viewport);
}

const wide = (device) => device.width >= 760;

// Tablets show the page tree: closed, it shows the pages, not every journal day.
async function tidySidebar(page) {
  await page.evaluate(() => {
    for (const toggle of document.querySelectorAll(".tree-toggle")) if (toggle.querySelector(".nav-caret")?.style.transform) toggle.click();
  });
  await page.waitForTimeout(400);
}
const tab = (page, name) => page.getByRole("button", { name, exact: true }).first().click();

// Every shot: a page of the web app (hash) with steps, or a native screen.
function shots(locale, ids, dataDir) {
  return [
    [
      "01-home",
      {
        hash: "",
        before: () => recent(dataDir, ids),
        // Opening documents for the other shots saves them (and so "edits"
        // them); once more, after that has settled.
        steps: async (page, device) => {
          recent(dataDir, ids);
          await page.reload();
          await page.waitForTimeout(3500);
          if (wide(device)) await tidySidebar(page);
        },
      },
    ],
    ["02-widgets", { native: (device) => widgetsScreen(device, locale) }],
    ["03-board", { hash: `#page=${ids.projects}`, steps: (page) => tab(page, "Board") }],
    ["04-document", { hash: `#page=${ids.kickoff}` }],
    [
      "05-plan",
      {
        // Wide screens: the projects as timeline; phones: the journal.
        hash: (device) => `#page=${wide(device) ? ids.projects : ids.journal}`,
        steps: (page, device) => (wide(device) ? tab(page, "Timeline") : null),
      },
    ],
    ["06-inbox", { hash: "#inbox" }],
    [
      "07-whiteboard",
      {
        hash: `#page=${ids.whiteboard}`,
        steps: async (page, device) => {
          await page.waitForTimeout(2500);
          if (wide(device)) return;
          // Phones: closer, on the first frame, the flow and the mind map.
          await page.evaluate(() => {
            const el = document.querySelector("svg.wb-canvas");
            const r = el.getBoundingClientRect();
            el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -60, ctrlKey: true, clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.45 }));
          });
        },
      },
    ],
    ["08-profiles", { native: (device) => settingsScreen(device, locale) }],
  ].filter(([name]) => !args.shots || args.shots.split(",").includes(name));
}

async function shoot(browser, base, state, locale, key, name, shot) {
  const device = DEVICES[key];
  const full = !!shot.native;
  const viewport = full ? { width: device.width, height: device.height } : { width: device.width, height: device.height - device.top - device.bottom };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: device.scale,
    isMobile: !full && (!device.tablet || device.platform === "android"),
    hasTouch: true,
    colorScheme: "light",
    locale: LOCALE_TAGS[locale],
    timezoneId: "Europe/Berlin",
    extraHTTPHeaders: { "Accept-Language": acceptLanguage(locale) },
    userAgent: userAgent(device),
    storageState: state,
  });
  if (shot.before) shot.before();
  const page = await context.newPage();
  if (full) await page.setContent(shot.native(device), { waitUntil: "load" });
  else {
    await hideOnLoad(page);
    const hash = typeof shot.hash === "function" ? shot.hash(device) : shot.hash;
    await page.goto(`${base}/${hash}`);
    await page.waitForTimeout(4000);
    if (wide(device)) await tidySidebar(page);
    if (shot.steps) await shot.steps(page, device);
    // From the top of the page, nothing focused (no keyboard bar, no handles).
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
    });
    await page.mouse.move(1, 1);
    await page.waitForTimeout(1500);
  }
  const dir = `${root}store/.cache/raw/${locale}/${key}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(full ? { full: true } : await edgeColors(page, viewport)));
  await context.close();
  console.log(`${locale} ${key} ${name}`);
}

const browser = await chromium.launch(args.chromium ? { executablePath: args.chromium, args: ["--no-sandbox"] } : {});
for (const locale of args.locales.split(",")) {
  const options = { flowplan, port: args.port, distDir: ".next/store-screenshots", locale, browser, keep: args.keep };
  await withFlowplan(options, async ({ base, state, ids, dataDir }) => {
    const only = args.only ? args.only.split(",") : Object.keys(DEVICES);
    for (const key of only) for (const [name, shot] of shots(locale, ids, dataDir)) await shoot(browser, base, state, locale, key, name, shot);
  });
}
await browser.close();
