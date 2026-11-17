import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// The flat text catalogues, one JSON file per language: German is written
// by hand, the other languages come in as pull requests from
// translate.flowplan.org. They must stay in step with German and keep the
// format the translation tool writes.
const root = join(import.meta.dirname, "..");
const FOLDERS = ["locales/ui", "plugins/capture/locales", "plugins/intents/locales", "plugins/widget-suite/locales"];
const LANGS = ["de", "en", "fr", "zh"] as const;

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
        // German and English are complete; an empty French or Chinese text
        // reads as English.
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
