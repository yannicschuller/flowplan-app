import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SUITE_KINDS } from "../src/widgets/suite";
import { sampleResult } from "../src/widgets/present";

// The flat text catalogues, one JSON file per language: German is written
// by hand, the other languages come in as pull requests from
// translate.flowplan.org. They must stay in step with German and keep the
// format the translation tool writes.
const root = join(import.meta.dirname, "..");
const FOLDERS = ["locales/ui", "plugins/capture/locales", "plugins/intents/locales", "plugins/widget-suite/locales"];
const LANGS = ["de", "en", "fr", "pl", "pt", "ru", "zh"] as const;

const read = (folder: string, name: string) => {
  const raw = readFileSync(join(root, folder, `${name}.json`), "utf8");
  const parsed = JSON.parse(raw) as Record<string, string>;
  assert.equal(raw, JSON.stringify(parsed, null, 2) + "\n", `${folder}/${name}.json: format (two spaces, newline at the end)`);
  return parsed;
};

// {name} (the app, the share extension), %@ %d %1$s (iOS) and
// ${applicationName} (Siri phrases).
const placeholders = (text: string) => [...text.matchAll(/\$\{applicationName\}|\{\w+\}|%(?:\d+\$)?[@dfs]/g)].map((m) => m[0]).sort();

for (const folder of FOLDERS)
  test(`${folder}: every language has German's keys, with English's placeholders`, () => {
    const catalogues = Object.fromEntries(LANGS.map((lang) => [lang, read(folder, lang)])) as Record<(typeof LANGS)[number], Record<string, string>>;
    const keys = Object.keys(catalogues.de);
    assert.ok(keys.length > 0);
    for (const lang of LANGS) {
      assert.deepEqual(Object.keys(catalogues[lang]).sort(), [...keys].sort(), `${lang}: other keys than German`);
      for (const key of keys) {
        const text = catalogues[lang][key];
        assert.equal(typeof text, "string", `${lang}: ${key}`);
        // German and English are complete; an empty text of another
        // language reads as English.
        if (lang === "de" || lang === "en") assert.ok(text.trim(), `${lang}: ${key} is empty`);
        if (text) assert.deepEqual(placeholders(text), placeholders(catalogues.en[key]), `${lang}: ${key}`);
      }
    }
    if (existsSync(join(root, folder, "context.json"))) {
      const context = read(folder, "context");
      for (const [key, note] of Object.entries(context)) {
        assert.ok(key in catalogues.de, `context.json: unknown key ${key}`);
        assert.ok(note.trim(), `context.json: ${key} is empty`);
      }
    }
  });

test("the native catalogues key their plain texts by the English text", () => {
  for (const folder of ["plugins/intents/locales", "plugins/widget-suite/locales"]) {
    const en = read(folder, "en");
    for (const [key, text] of Object.entries(en)) if (!/^(phrase|gallery)\./.test(key)) assert.equal(text, key, `${folder}: ${key}`);
  }
});

test("French says vous", () => {
  // tu, te, t’, toi, ton, ta, tes as words (\b would see "tes" in "êtes").
  const informal = /(?<!\p{L})(?:tu|te|toi|ton|ta|tes)(?!\p{L})|(?<!\p{L})t’/iu;
  for (const folder of FOLDERS)
    for (const [key, text] of Object.entries(read(folder, "fr"))) assert.doesNotMatch(text, informal, `${folder}: ${key}`);
  // The native texts (iOS permissions, Android), the store listings with their
  // changelogs and the made-up widget content of the pickers.
  const strings = (value: unknown): string[] =>
    typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  for (const text of strings(JSON.parse(readFileSync(join(root, "locales/fr.json"), "utf8")))) assert.doesNotMatch(text, informal, `locales/fr.json: ${text}`);
  const listings = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? listings(join(dir, entry.name)) : entry.name.endsWith(".txt") ? [join(dir, entry.name)] : [],
    );
  for (const file of [...listings(join(root, "store/app-store/fr-FR")), ...listings(join(root, "store/google-play/fr-FR"))])
    assert.doesNotMatch(readFileSync(file, "utf8"), informal, file);
  for (const kind of SUITE_KINDS)
    for (const text of strings(sampleResult(kind, "fr", "2026-10-22", Date.parse("2026-10-22T10:00:00Z")))) assert.doesNotMatch(text, informal, `sample ${kind}: ${text}`);
});

// Russian and Portuguese address the reader formally ("вы"; Portuguese
// with "o seu/a sua", never "tu"), Polish informally ("ty", never
// "Pan"/"Pani") – as Flowplan's own catalogues do.
test("Russian says вы, Portuguese never tu, Polish never Pan/Pani", () => {
  const rules: [string, RegExp, string[]][] = [
    ["ru", /(?<!\p{L})(?:ты|тебя|тебе|тобой|тво[йяеёи]\p{L}*)(?!\p{L})/iu, ["store/app-store/ru", "store/google-play/ru-RU"]],
    ["pt", /(?<!\p{L})(?:tu|te|ti|contigo|teu|tua|teus|tuas)(?!\p{L})/iu, ["store/app-store/pt-PT", "store/google-play/pt-PT"]],
    ["pl", /(?<!\p{L})(?:Pan|Pani|Państwo|Pana|Panu)(?!\p{L})/u, ["store/app-store/pl", "store/google-play/pl-PL"]],
  ];
  const strings = (value: unknown): string[] =>
    typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  const listings = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? listings(join(dir, entry.name)) : entry.name.endsWith(".txt") ? [join(dir, entry.name)] : [],
    );
  for (const [lang, informal, stores] of rules) {
    for (const folder of FOLDERS) for (const [key, text] of Object.entries(read(folder, lang))) assert.doesNotMatch(text, informal, `${folder}/${lang}: ${key}`);
    for (const text of strings(JSON.parse(readFileSync(join(root, `locales/${lang}.json`), "utf8")))) assert.doesNotMatch(text, informal, `locales/${lang}.json: ${text}`);
    for (const file of stores.flatMap((dir) => listings(join(root, dir)))) assert.doesNotMatch(readFileSync(file, "utf8"), informal, file);
    for (const kind of SUITE_KINDS)
      for (const text of strings(sampleResult(kind, lang as "ru", "2026-10-22", Date.parse("2026-10-22T10:00:00Z")))) assert.doesNotMatch(text, informal, `sample ${kind} ${lang}: ${text}`);
  }
});

test("src/i18n.ts loads its catalogues without default imports (iOS widget layout bundle)", () => {
  // expo-widgets' layout registry resolves no packages, so Babel's
  // interopRequireDefault (used for `import x from`) is empty there and the
  // iOS build fails (release 1.0.15).
  const source = readFileSync("src/i18n.ts", "utf8");
  assert.doesNotMatch(source, /^import\s+(?!type\b)[\w$]+\s*(,|from)/m);
  assert.doesNotMatch(source, /^import\s+\*\s+as/m);
});
