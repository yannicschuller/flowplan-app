// App icons, splash screen and notification icon from the Flowplan logo
// (resources/*.svg), rendered with Chromium into assets/; Expo's prebuild
// makes every size for iOS and Android from them (app.config.ts). The store
// icons go to store/icons.
//   npm run icons
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const svg = (name) => readFileSync(`${root}resources/${name}.svg`, "utf8");

mkdirSync(`${root}assets`, { recursive: true });
mkdirSync(`${root}store/icons`, { recursive: true });
// CHROMIUM=/path/to/chrome uses an installed browser instead of Playwright's own.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();

async function render(html, size, file, { transparent = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block}</style>${html}`,
  );
  await page.screenshot({ path: file, omitBackground: transparent });
}
const full = (name, size) => svg(name).replace("<svg ", `<svg width="${size}" height="${size}" `);
// The white layers of the logo, filling the square (notification icon).
const glyph = (size) =>
  svg("icon-foreground").replace("<svg ", `<svg width="${size}" height="${size}" `).replace('viewBox="0 0 32 32"', 'viewBox="5.5 5.5 21 21"');

await render(full("icon", 1024), 1024, `${root}assets/icon.png`);
await render(full("icon-foreground", 1024), 1024, `${root}assets/adaptive-foreground.png`, { transparent: true });
await render(full("icon-foreground", 1024), 1024, `${root}assets/adaptive-monochrome.png`, { transparent: true });
await render(full("icon-background", 1024), 1024, `${root}assets/adaptive-background.png`);
await render(full("logo", 512), 512, `${root}assets/splash-logo.png`, { transparent: true });
await render(glyph(96), 96, `${root}assets/notification-icon.png`, { transparent: true });
await render(full("icon", 1024), 1024, `${root}store/icons/app-store-1024.png`);
await render(full("icon", 512), 512, `${root}store/icons/google-play-512.png`);
await browser.close();

// App Store icons must not have an alpha channel.
for (const file of ["store/icons/app-store-1024.png", "assets/icon.png"])
  execFileSync("convert", [`${root}${file}`, "-background", "#4146e6", "-alpha", "remove", "-alpha", "off", `${root}${file}`]);
