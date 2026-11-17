// The app's own screens, notifications and widgets speak the languages of
// Flowplan: German, English, French and Simplified Chinese, after the system
// language (English otherwise). The texts live in locales/ui/<lang>.json
// (German is the source, English what translations start from; Simplified
// Chinese, zh-Hans, uses the terms of Flowplan's own zh catalogue and Apple's
// and Google's names: 小组件, 实时活动, 灵动岛, 控制中心). Translations come in
// as pull requests from translate.flowplan.org; test/catalogues.test.ts keeps
// the four files in step.
import de from "../locales/ui/de.json";
import enText from "../locales/ui/en.json";
import frText from "../locales/ui/fr.json";
import zhText from "../locales/ui/zh.json";

type Key = keyof typeof de;

// Every language has every key of German (a missing one fails the type
// check, an extra one the catalogue test).
const en: Record<Key, string> = enText;
const fr: Record<Key, string> = frText;
const zh: Record<Key, string> = zhText;

export const strings = { de, en, fr, zh } as const;
export type Locale = keyof typeof strings;
export type TextKey = Key;

// Chinese in Traditional characters (zh-Hant, and Taiwan, Hong Kong and
// Macao without a script): not "zh", which is Simplified – the next language
// of the list, else English, as iOS and Android do for the native texts
// (zh-Hans.lproj and values-b+zh+Hans are not used for them either).
const TRADITIONAL = /^zh(?:[-_](?:hant\b|tw\b|hk\b|mo\b)|(?:[-_][a-z0-9]+)*[-_]hant\b)/i;

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
