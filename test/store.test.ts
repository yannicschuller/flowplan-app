import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The store listings (store/README.md): the limits App Store Connect and
// Play Console enforce, and screenshots in the sizes and format fastlane
// uploads (scripts/store-images.mjs).
const STORE = join(__dirname, "..", "store");
// fastlane's folder names: Simplified Chinese is zh-Hans in the App Store
// (deliver) and zh-CN on Google Play (supply).
const APP_STORE = ["de-DE", "en-US", "fr-FR", "zh-Hans"];
const PLAY = ["de-DE", "en-US", "fr-FR", "zh-CN"];
const read = (...path: string[]) => readFileSync(join(STORE, ...path), "utf8").trim();
const bytes = (text: string) => Buffer.byteLength(text, "utf8");
// Characters as App Store Connect and Play Console count them (code points).
const chars = (text: string) => [...text].length;
// Apple rejects other apps' names in the metadata (guideline 2.3.7).
const COMPETITORS = /\b(notion|evernote|obsidian|onenote|trello|asana|confluence|miro|todoist|coda)\b/i;

// Width, height, colour type and whether a PNG has transparency.
function png(file: string) {
  const data = readFileSync(file);
  assert.equal(data.toString("latin1", 1, 4), "PNG", `${file} is not a PNG`);
  let alpha = false;
  for (let at = 8; at < data.length; ) {
    const length = data.readUInt32BE(at);
    const type = data.toString("latin1", at + 4, at + 8);
    if (type === "tRNS") alpha = true;
    if (type === "IDAT") break;
    at += length + 12;
  }
  const colourType = data[25];
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), depth: data[24], alpha: alpha || colourType === 4 || colourType === 6 };
}

test("the store folders are the languages fastlane knows, the same in both stores", () => {
  const folders = (store: string) => readdirSync(join(STORE, store)).filter((f) => /^[a-z]{2}(-[A-Za-z]+)?$/.test(f)).sort();
  assert.deepEqual(folders("app-store"), [...APP_STORE].sort());
  assert.deepEqual(folders("google-play"), [...PLAY].sort());
});

test("App Store texts of every language stay within App Store Connect's limits", () => {
  const files = ["name", "subtitle", "keywords", "promotional_text", "description", "release_notes", "support_url", "marketing_url", "privacy_url"];
  for (const locale of APP_STORE) {
    for (const file of files) assert.ok(read("app-store", locale, `${file}.txt`), `${locale}/${file}.txt is empty`);
    const at = (file: string) => read("app-store", locale, `${file}.txt`);
    assert.ok(chars(at("name")) <= 30, `${locale} name: ${chars(at("name"))} > 30`);
    assert.ok(chars(at("subtitle")) <= 30, `${locale} subtitle: ${chars(at("subtitle"))} > 30`);
    // Bytes, not characters: the stricter reading of Apple's 100 – a
    // Chinese character is 3 bytes in UTF-8.
    assert.ok(bytes(at("keywords")) <= 100, `${locale} keywords: ${bytes(at("keywords"))} bytes > 100`);
    const keywords = at("keywords").split(",");
    assert.ok(keywords.every((word) => word && word === word.trim()), `${locale} keywords: no empty entries, no spaces around commas`);
    assert.equal(new Set(keywords).size, keywords.length, `${locale} keywords repeat`);
    assert.ok(chars(at("promotional_text")) <= 170, `${locale} promotional text: ${chars(at("promotional_text"))} > 170`);
    assert.ok(chars(at("description")) <= 4000, `${locale} description: ${chars(at("description"))} > 4000`);
    assert.ok(chars(at("release_notes")) <= 4000, `${locale} release notes: ${chars(at("release_notes"))} > 4000`);
    for (const file of ["support_url", "marketing_url", "privacy_url"]) assert.match(at(file), /^https:\/\/\S+$/, `${locale}/${file}.txt`);
    for (const file of ["name", "subtitle", "keywords", "promotional_text", "description", "release_notes"])
      assert.doesNotMatch(at(file), COMPETITORS, `${locale}/${file}.txt names another app`);
  }
});

test("Google Play texts of every language stay within Play Console's limits", () => {
  const changelogs = (locale: string) => readdirSync(join(STORE, "google-play", locale, "changelogs")).sort();
  for (const locale of PLAY) {
    const at = (file: string) => read("google-play", locale, `${file}.txt`);
    assert.ok(at("title") && chars(at("title")) <= 30, `${locale} title`);
    assert.ok(at("short_description") && chars(at("short_description")) <= 80, `${locale} short description: ${chars(at("short_description"))} > 80`);
    assert.ok(at("full_description") && chars(at("full_description")) <= 4000, `${locale} full description`);
    assert.deepEqual(changelogs(locale), changelogs(PLAY[1]), `${locale} has other changelogs than ${PLAY[1]}`);
    for (const file of changelogs(locale))
      assert.ok(chars(read("google-play", locale, "changelogs", file)) <= 500, `${locale} changelog ${file} > 500`);
    for (const file of ["title", "short_description", "full_description"]) assert.doesNotMatch(at(file), COMPETITORS, `${locale}/${file}.txt names another app`);
  }
});

test("App Store screenshots: every device and language, exact sizes, PNG without alpha, at most 10", () => {
  const SIZES: Record<string, [number, number]> = { "iphone-69": [1320, 2868], "iphone-65": [1284, 2778], "ipad-13": [2064, 2752] };
  const frames = (locale: string) => readdirSync(join(STORE, "app-store", "screenshots", locale)).filter((f) => !f.startsWith(".")).sort();
  const reference = frames(APP_STORE[0]);
  for (const locale of APP_STORE) {
    const files = frames(locale);
    assert.deepEqual(files, reference, `${locale} has other screenshots than ${APP_STORE[0]}`);
    for (const [device, [width, height]] of Object.entries(SIZES)) {
      const shots = files.filter((f) => f.endsWith(`-${device}.png`));
      assert.ok(shots.length >= 3 && shots.length <= 10, `${locale} ${device}: ${shots.length} screenshots`);
      for (const file of shots) {
        const image = png(join(STORE, "app-store", "screenshots", locale, file));
        assert.deepEqual([image.width, image.height], [width, height], `${locale}/${file} size`);
        assert.equal(image.alpha, false, `${locale}/${file} has an alpha channel`);
        assert.equal(image.depth, 8, `${locale}/${file} bit depth`);
      }
    }
    assert.equal(files.filter((f) => !Object.keys(SIZES).some((d) => f.endsWith(`-${d}.png`))).length, 0, `${locale}: files of no known device`);
  }
});

test("App Store creative assets: header 3840×1646 (21:9) and search results 3:2, every language, PNG without alpha", () => {
  // App Store Connect Help → Creative assets specifications (scripts/creative-assets.mjs).
  for (const locale of APP_STORE) {
    const dir = join(STORE, "app-store", "creative", locale);
    assert.deepEqual(readdirSync(dir).filter((f) => !f.startsWith(".")).sort(), ["header.png", "search-results.png"], `${locale} creative assets`);
    const header = png(join(dir, "header.png"));
    assert.deepEqual([header.width, header.height], [3840, 1646], `${locale} header size`);
    const search = png(join(dir, "search-results.png"));
    assert.equal(search.width * 2, search.height * 3, `${locale} search results: not 3:2`);
    assert.ok(search.width >= 1920 && search.width <= 3840, `${locale} search results: ${search.width} px wide`);
    for (const [name, image] of [["header", header], ["search-results", search]] as const) {
      assert.equal(image.alpha, false, `${locale}/${name}.png has an alpha channel`);
      assert.equal(image.depth, 8, `${locale}/${name}.png bit depth`);
    }
  }
});

test("Google Play images: sizes, no alpha, two to eight screenshots per device", () => {
  const SIZES: Record<string, [number, number]> = { phoneScreenshots: [1080, 1920], sevenInchScreenshots: [1200, 1920], tenInchScreenshots: [1600, 2560] };
  for (const locale of PLAY) {
    const images = join(STORE, "google-play", locale, "images");
    for (const [folder, [width, height]] of Object.entries(SIZES)) {
      const shots = readdirSync(join(images, folder)).filter((f) => f.endsWith(".png"));
      assert.ok(shots.length >= 2 && shots.length <= 8, `${locale} ${folder}: ${shots.length}`);
      for (const file of shots) {
        const image = png(join(images, folder, file));
        assert.deepEqual([image.width, image.height], [width, height], `${locale}/${folder}/${file} size`);
        assert.equal(image.alpha, false, `${locale}/${folder}/${file} has an alpha channel`);
      }
    }
    const feature = png(join(images, "featureGraphic.png"));
    assert.deepEqual([feature.width, feature.height, feature.alpha], [1024, 500, false], `${locale} feature graphic`);
    assert.ok(existsSync(join(images, "icon.png")), `${locale} icon`);
  }
});
