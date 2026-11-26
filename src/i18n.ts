// The app's own screens, notifications and widgets speak the languages of
// Flowplan: German, English, French, Polish, European Portuguese (pt-PT),
// Russian and Simplified Chinese, after the system language (English
// otherwise). The texts live in locales/ui/<lang>.json
// (German is the source, English what translations start from; Simplified
// Chinese, zh-Hans, uses the terms of Flowplan's own zh catalogue and Apple's
// and Google's names: 小组件, 实时活动, 灵动岛, 控制中心; Portuguese is pt-PT
// with the terms of Flowplan's pt catalogue, Russian says "вы", Polish "ty"
// like Flowplan's own catalogues). Translations come in as pull requests
// from translate.flowplan.org; test/catalogues.test.ts keeps the files in
// step.
//
// Loaded with require(), not `import x from`: Babel turns a default import
// into a call of @babel/runtime's interopRequireDefault, and the bundle of
// the iOS widget layouts (expo-widgets' layout registry) resolves no
// packages – the helper is empty there, so the layouts threw "t is not a
// function" and the iOS build failed (release 1.0.15).
/* eslint-disable @typescript-eslint/no-require-imports */
const de: typeof import("../locales/ui/de.json") = require("../locales/ui/de.json");
const enText: typeof import("../locales/ui/en.json") = require("../locales/ui/en.json");
const frText: typeof import("../locales/ui/fr.json") = require("../locales/ui/fr.json");
const zhText: typeof import("../locales/ui/zh.json") = require("../locales/ui/zh.json");
const plText: typeof import("../locales/ui/pl.json") = require("../locales/ui/pl.json");
const ptText: typeof import("../locales/ui/pt.json") = require("../locales/ui/pt.json");
const ruText: typeof import("../locales/ui/ru.json") = require("../locales/ui/ru.json");

type Key = keyof typeof de;

// Every language has every key of German (a missing one fails the type
// check, an extra one the catalogue test).
const en: Record<Key, string> = enText;
const fr: Record<Key, string> = frText;
const zh: Record<Key, string> = zhText;
const pl: Record<Key, string> = plText;
const pt: Record<Key, string> = ptText;
const ru: Record<Key, string> = ruText;

export const strings = { de, en, fr, pl, pt, ru, zh } as const;
export type Locale = keyof typeof strings;
export type TextKey = Key;

// Chinese in Traditional characters (zh-Hant, and Taiwan, Hong Kong and
// Macao without a script): not "zh", which is Simplified – the next language
// of the list, else English, as iOS and Android do for the native texts
// (zh-Hans.lproj and values-b+zh+Hans are not used for them either).
const TRADITIONAL = /^zh(?:[-_](?:hant\b|tw\b|hk\b|mo\b)|(?:[-_][a-z0-9]+)*[-_]hant\b)/i;

// The tag for Intl (numbers, dates, relative times): Portuguese is
// European Portuguese (pt-PT; "pt" alone formats as Brazilian Portuguese),
// Chinese Simplified Chinese.
export const intlLocale = (lang: Locale) => (lang === "pt" ? "pt-PT" : lang === "zh" ? "zh-CN" : lang);

// Every Portuguese (pt-PT, pt-BR, pt) gets the European Portuguese texts –
// the only Portuguese Flowplan has.
export function pickLocale(languages: readonly (string | null | undefined)[]): Locale {
  for (const language of languages) {
    const tag = String(language || "").toLowerCase();
    const base = tag.split(/[-_]/)[0];
    if (base === "zh" && TRADITIONAL.test(tag)) continue;
    if (Object.hasOwn(strings, base)) return base as Locale;
  }
  return "en";
}

let current: Locale = "en";
export const setLocale = (locale: Locale) => {
  current = locale;
};
export const locale = () => current;

// A text in the chosen language with its {name} placeholders filled in; a
// missing or empty translation reads as English (and a missing English one
// as the key).
export function t(key: Key, params: Record<string, string | number> = {}, lang: Locale = current) {
  const text = strings[lang]?.[key] || strings.en[key] || key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}
