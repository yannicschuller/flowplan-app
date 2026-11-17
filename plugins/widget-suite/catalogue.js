// Reads the flat text catalogues of the native iOS parts
// (plugins/widget-suite/locales, plugins/intents/locales: one JSON file per
// language; German is written by hand, translations come in as pull
// requests from translate.flowplan.org) into the tables the config plugins
// and app.config.ts use. Keys:
// - the English text itself, as iOS looks it up in Localizable.strings
//   (en.json maps the text to itself);
// - "phrase.<name>": a Siri and Shortcuts phrase; its English text is the
//   key of AppShortcuts.strings, so it has to match the Swift source;
// - "gallery.<widget>.label" and "gallery.<widget>.description": the widget
//   gallery.
// A missing or empty translation reads as English.
const LANGS = ["de", "en", "fr", "zh"];

function read(dir) {
  const catalogues = Object.fromEntries(LANGS.map((lang) => [lang, require(`${dir}/${lang}.json`)]));
  const text = (lang, key) => catalogues[lang][key] || catalogues.en[key] || key;
  const entry = (key) => Object.fromEntries(LANGS.map((lang) => [lang, text(lang, key)]));
  const strings = {};
  const phrases = {};
  const gallery = {};
  for (const key of Object.keys(catalogues.de)) {
    const widget = key.match(/^gallery\.(\w+)\.(label|description)$/);
    if (widget) {
      gallery[widget[1]] ??= { label: [], description: [] };
      gallery[widget[1]][widget[2]] = LANGS.map((lang) => text(lang, key));
    } else if (key.startsWith("phrase.")) phrases[text("en", key)] = entry(key);
    else strings[key] = entry(key);
  }
  return { strings, phrases, gallery };
}

module.exports = { LANGS, read };
