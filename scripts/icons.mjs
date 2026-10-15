// App icons and splash screens from the Flowplan logo (resources/*.svg):
// renders the sources with Chromium into assets/, then @capacitor/assets
// writes every size for iOS and Android, and store/ gets the store icons.
//   npm run icons
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const svg = (name) => readFileSync(`${root}resources/${name}.svg`, "utf8");
const BG = { light: "#fcfbf8", dark: "#16151b" };

mkdirSync(`${root}assets`, { recursive: true });
mkdirSync(`${root}store/icons`, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, size, file, { transparent = false } = {}) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block}</style>${html}`,
  );
  await page.screenshot({ path: file, omitBackground: transparent });
}
const full = (name, size) => svg(name).replace("<svg ", `<svg width="${size}" height="${size}" `);
const splash = (bg) =>
  `<div style="width:100vw;height:100vh;display:grid;place-items:center;background:${bg}">${full("logo", 2732 * 0.16)}</div>`;

await render(full("icon", 1024), [1024, 1024], `${root}assets/icon-only.png`);
await render(full("icon-foreground", 1024), [1024, 1024], `${root}assets/icon-foreground.png`, { transparent: true });
await render(full("icon-background", 1024), [1024, 1024], `${root}assets/icon-background.png`);
await render(splash(BG.light), [2732, 2732], `${root}assets/splash.png`);
await render(splash(BG.dark), [2732, 2732], `${root}assets/splash-dark.png`);
// The app's own pages and the stores.
await render(full("logo", 192), [192, 192], `${root}www/icon.png`, { transparent: true });
await render(full("icon", 1024), [1024, 1024], `${root}store/icons/app-store-1024.png`);
await render(full("icon", 512), [512, 512], `${root}store/icons/google-play-512.png`);
await browser.close();

// App Store icons must not have an alpha channel.
const opaque = (file) =>
  execFileSync("magick", [`${root}${file}`, "-background", "#4146e6", "-alpha", "remove", "-alpha", "off", `${root}${file}`]);
opaque("store/icons/app-store-1024.png");
opaque("assets/icon-only.png");

execFileSync(
  "npx",
  [
    "capacitor-assets", "generate", "--ios", "--android",
    "--iconBackgroundColor", "#4146e6", "--iconBackgroundColorDark", "#4146e6",
    "--splashBackgroundColor", BG.light, "--splashBackgroundColorDark", BG.dark,
  ],
  { cwd: root, stdio: "inherit" },
);
opaque("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
