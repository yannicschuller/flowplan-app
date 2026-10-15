// Store screenshots from the real Flowplan web UI: drives a local Flowplan
// test server with Playwright in the screen sizes of the store devices and
// saves the page area (between status bar and home indicator) together with
// the colours at its edges, like the app paints them. scripts/store-images.mjs
// then puts them into frames with captions.
//
// Needs a fresh Flowplan development server per language – its demo
// workspace is created in the language of the first sign-in:
//
//   cd ../flowplan
//   FLOWPLAN_DIST_DIR=.next/test5 FLOWPLAN_DATA_DIR=/tmp/flowplan-de \
//     APP_URL=http://localhost:3150 npx next dev --port 3150
//   npm run screenshots -- --locale de       (then the same with a new data dir and --locale en)
//
// Options: --locale de|en, --base http://localhost:3150, --only iphone-69,ipad-13
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEVICES } from "./devices.mjs";

const { values: args } = parseArgs({
  options: {
    locale: { type: "string", default: "de" },
    base: { type: "string", default: "http://localhost:3150" },
    only: { type: "string", default: "" },
  },
});
const root = new URL("..", import.meta.url).pathname;
const base = args.base.replace(/\/$/, "");
const locale = args.locale;
const de = locale === "de";
const say = (german, english) => (de ? german : english);

const userAgent = (device) =>
  device.platform === "ios"
    ? `Mozilla/5.0 (${device.tablet ? "iPad; CPU OS 18_7" : "iPhone; CPU iPhone OS 18_7"} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlowplanMobile/1.0.0`
    : `Mozilla/5.0 (Linux; Android 15; ${device.tablet ? "Pixel Tablet" : "Pixel 9"}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 ${device.tablet ? "" : "Mobile "}Safari/537.36 FlowplanMobile/1.0.0`;

const hideDevTools = "nextjs-portal{display:none!important}";

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${base}/`);
  const response = await page.request.post(`${base}/api/auth/demo`, { headers: { origin: base }, data: {} });
  if (!response.ok()) throw new Error(`Demo sign-in failed (${response.status()}): a Flowplan development server is needed.`);
  await page.close();
}

// The content every device shows: one journal and one whiteboard, made once.
async function prepare(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: de ? "de-DE" : "en-US",
    extraHTTPHeaders: { "Accept-Language": de ? "de-DE,de;q=0.9" : "en-US,en;q=0.9" },
  });
  await signIn(context);
  const page = await context.newPage();
  await page.goto(`${base}/`);
  await page.addStyleTag({ content: hideDevTools }).catch(() => {});
  await page.waitForTimeout(2500);
  const titles = await page.evaluate(async () => (await (await fetch("/api/bootstrap")).json()).pages?.map((p) => [p.id, p.title, p.kind]) || []);
  const has = (kind) => titles.find(([, , k]) => k === kind);
  if (!has("whiteboard")) {
    await create(page, say("Whiteboard", "Whiteboard"), say("Ideen-Board", "Idea board"));
    await page.waitForTimeout(1500);
    const box = await page.locator("svg.wb-canvas").boundingBox();
    const notes = de
      ? ["Onboarding in 3 Schritten", "Feedback aus Nutzertests", "Neues Dashboard", "Mobile-App starten 🚀", "Preise überarbeiten"]
      : ["Onboarding in 3 steps", "Feedback from user tests", "New dashboard", "Launch the mobile app 🚀", "Rework pricing"];
    const spots = [[0.36, 0.1], [0.63, 0.2], [0.37, 0.42], [0.64, 0.52], [0.43, 0.76]];
    for (let i = 0; i < notes.length; i++) {
      await page.mouse.dblclick(box.x + box.width * spots[i][0], box.y + box.height * spots[i][1]);
      await page.waitForTimeout(500);
      await page.keyboard.type(notes[i], { delay: 5 });
      // A colour per note, from the palette of the selected note.
      await page.locator(".wb-swatch:not(.line)").nth([0, 2, 4, 6, 1][i]).click().catch(() => {});
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height - 20);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1500);
  }
  if (!has("journal")) {
    await create(page, "Journal", "Journal");
    await page.waitForTimeout(1500);
    await page.locator(".journal-today").getByText(say("Öffnen", "Open")).click();
    await page.waitForTimeout(2000);
    const editor = page.locator(".ProseMirror[contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type(
      say(
        "Fokus heute: Store-Start der Mobile-App vorbereiten.\nScreenshots fertig, Texte geprüft, Feedback vom Team eingearbeitet.\nDankbar für einen ruhigen Vormittag und guten Kaffee ☕",
        "Focus today: prepare the store launch of the mobile app.\nScreenshots done, texts reviewed, team feedback worked in.\nGrateful for a quiet morning and good coffee ☕",
      ),
      { delay: 3 },
    );
    await page.waitForTimeout(2500);
  }
  await context.close();
}

async function create(page, kind, title) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.waitForTimeout(500);
  await page.keyboard.type(say(`Neues ${kind}`, `New ${kind.toLowerCase()}`));
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.getByPlaceholder(say("Wie heißt deine Seite?", "What is your page called?")).fill(title);
  await page.getByRole("button", { name: say("Seite erstellen", "Create page") }).click();
  await page.waitForTimeout(2500);
}

// The colour most of a row of the screenshot has, like the app samples it.
async function edgeColors(page, viewport) {
  return page.evaluate(async ({ width, height }) => {
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

async function shoot(browser, name, device, { dark = false, url, steps } = {}) {
  const viewport = { width: device.width, height: device.height - device.top - device.bottom };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: device.scale,
    isMobile: !device.tablet || device.platform === "android",
    hasTouch: true,
    colorScheme: dark ? "dark" : "light",
    locale: de ? "de-DE" : "en-US",
    extraHTTPHeaders: { "Accept-Language": de ? "de-DE,de;q=0.9" : "en-US,en;q=0.9" },
    userAgent: userAgent(device),
  });
  // The app's own pages, served from www/ (module scripts need http).
  await context.route("http://app.flowplan.local/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, "") || "index.html";
    const type = { html: "text/html", js: "text/javascript", css: "text/css", png: "image/png" }[path.split(".").pop()];
    route.fulfill({ body: readFileSync(`${root}www/${path}`), contentType: type });
  });
  if (!url) await signIn(context);
  const page = await context.newPage();
  await page.goto(url || `${base}/`);
  await page.addStyleTag({ content: hideDevTools }).catch(() => {});
  await page.waitForTimeout(2500);
  if (steps) await steps(page, device);
  await page.waitForTimeout(800);
  const dir = `${root}store/.cache/raw/${locale}/${deviceName(device)}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
  writeFileSync(`${dir}/${name}.json`, JSON.stringify({ ...(await edgeColors(page, viewport)), dark }));
  await context.close();
  console.log(`${locale} ${deviceName(device)} ${name}`);
}
const deviceName = (device) => Object.keys(DEVICES).find((key) => DEVICES[key] === device);

async function openPage(page, device, title) {
  // Wide screens show the sidebar, narrow ones open it first.
  const opener = page.getByRole("button", { name: say("Navigation öffnen", "Open navigation") });
  const link = page.getByRole("button", { name: title, exact: true }).first();
  const box = await link.boundingBox().catch(() => null);
  const inView = box && box.x >= 0 && box.x < page.viewportSize().width;
  if (!inView && (await opener.isVisible().catch(() => false))) {
    await opener.click();
    await page.waitForTimeout(500);
  }
  await link.click();
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: hideDevTools }).catch(() => {});
}

const SHOTS = [
  ["01-home", {}],
  [
    "02-board",
    {
      steps: async (page, device) => {
        await openPage(page, device, say("Produkt-Roadmap", "Product roadmap"));
        await page.getByRole("button", { name: "Board", exact: true }).click();
        await page.waitForTimeout(1500);
      },
    },
  ],
  [
    "03-document",
    {
      steps: async (page, device) => {
        await openPage(page, device, say("Willkommen bei Flowplan", "Welcome to Flowplan"));
      },
    },
  ],
  [
    "04-whiteboard",
    {
      steps: async (page, device) => {
        await openPage(page, device, say("Ideen-Board", "Idea board"));
        await page.getByRole("button", { name: say("Alles anzeigen", "Show everything") }).click().catch(() => {});
        await page.waitForTimeout(1200);
      },
    },
  ],
  [
    "05-journal",
    {
      steps: async (page, device) => {
        await openPage(page, device, "Journal");
      },
    },
  ],
  [
    "06-overview",
    {
      // Phones: the navigation; tablets: the calendar of the roadmap.
      steps: async (page, device) => {
        if (!device.tablet) {
          await page.getByRole("button", { name: say("Navigation öffnen", "Open navigation") }).click();
          await page.waitForTimeout(1000);
          return;
        }
        await openPage(page, device, say("Produkt-Roadmap", "Product roadmap"));
        await page.getByRole("button", { name: say("Kalender", "Calendar"), exact: true }).click();
        await page.waitForTimeout(1500);
      },
    },
  ],
  ["07-server", { dark: true, url: "http://app.flowplan.local/index.html?setup=1" }],
];

const browser = await chromium.launch();
await prepare(browser);
const only = args.only ? args.only.split(",") : Object.keys(DEVICES);
for (const key of only) for (const [name, options] of SHOTS) await shoot(browser, name, DEVICES[key], options);
await browser.close();
