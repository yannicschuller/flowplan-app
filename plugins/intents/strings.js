// The texts of the Siri, Shortcuts, Focus filter and control parts
// (plugins/intents/app and ios) in German, English, French and Simplified
// Chinese (zh): plugins/intents/locales/<lang>.json, read by
// plugins/widget-suite/catalogue.js. The English text is the key, as in the
// widget suite; the Siri phrases are "phrase.<name>". app.config.ts adds the
// texts to Localizable.strings of the app and the widget extension,
// plugins/with-intents.js the phrases to AppShortcuts.strings.
// test/intents-native.test.ts checks that every text of the Swift sources
// is here (or in the widget suite's table), with the same placeholders.
const { LANGS, read } = require("../widget-suite/catalogue");

// English text → { de, fr, zh }, and the Siri and Shortcuts phrases
// (AppShortcuts.strings, next to the widget suite's) the same way.
const { strings, phrases } = read(`${__dirname}/locales`);

// Localizable.strings entries of one language: English text → translation.
function localizable(lang) {
  return Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[lang]]));
}

module.exports = { strings, phrases, LANGS, localizable };
