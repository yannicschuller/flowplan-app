// The texts of the native iOS parts – the configurable widgets, controls,
// App Shortcuts and the configurable settings of the expo-widgets widgets –
// in German, English, French and Simplified Chinese (zh):
// plugins/widget-suite/locales/<lang>.json, read by catalogue.js. The
// English text is the key (so a missing entry still reads as English); the
// Siri phrases are "phrase.<name>", the widget gallery's names and
// descriptions "gallery.<widget>.label" and ".description". app.config.ts
// writes the texts into Localizable.strings of the app and the widget
// extension (locales → ios["Localizable.strings"]), plugins/with-widget-suite.js
// the phrases into AppShortcuts.strings, plugins/with-widget-gallery.js and
// app.config.ts the gallery into Android's string resources.
// test/widget-suite-native.test.ts checks that every text of the Swift
// sources is here, in every language, with the same placeholders.
const { LANGS, read } = require("./catalogue");

// English text → { de, en, fr, zh }; the Siri and Shortcuts phrases
// (AppShortcuts.strings) the same way; widget → { label: [de, en, fr, zh],
// description: [...] } for the widget gallery on Android (iOS takes them
// from Localizable.strings, keyed by the English text).
const { strings, phrases, gallery } = read(`${__dirname}/locales`);

// The .lproj folder of a language: Simplified Chinese is zh-Hans on iOS
// (app.config.ts → locales, CFBundleLocalizations).
const lproj = (lang) => (lang === "zh" ? "zh-Hans" : lang);

// Android string resources of the gallery for one language.
function galleryStrings(lang) {
  const index = { de: 0, en: 1, fr: 2, zh: 3 }[lang];
  const out = {};
  for (const [name, entry] of Object.entries(gallery)) {
    out[`widget_label_${name.toLowerCase()}`] = entry.label[index];
    out[`widget_${name.toLowerCase()}_description`] = entry.description[index];
  }
  return out;
}

// Localizable.strings of one language: English text → translation; with
// the gallery's names and descriptions (expo-widgets writes them into Swift
// as English text, which iOS looks up here).
function localizable(table, lang) {
  const out = Object.fromEntries(Object.entries(table).map(([key, value]) => [key, value[lang]]));
  const index = { de: 0, en: 1, fr: 2, zh: 3 }[lang];
  for (const entry of Object.values(gallery)) {
    out[entry.label[1]] ??= entry.label[index];
    out[entry.description[1]] ??= entry.description[index];
  }
  return out;
}

module.exports = { strings, phrases, gallery, galleryStrings, LANGS, lproj, localizable };
