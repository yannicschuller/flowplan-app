// The texts of the Swift sources that iOS looks up in Localizable.strings
// (and AppShortcuts.strings): what test/widget-suite-native.test.ts checks
// against strings.js, so no text is missing in German, English or French.
// A small reader of Swift string literals: interpolations become %@ (the
// key a LocalizedStringResource with arguments gets).

function literals(source) {
  const out = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (source[i] !== '"') continue;
    const start = i;
    let text = "";
    i++;
    while (i < source.length && source[i] !== '"') {
      if (source[i] === "\\" && source[i + 1] === "(") {
        // An interpolation, with nested parentheses and strings.
        let depth = 1;
        i += 2;
        while (i < source.length && depth) {
          if (source[i] === '"') {
            i++;
            while (i < source.length && source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
          } else if (source[i] === "(") depth++;
          else if (source[i] === ")") depth--;
          i++;
        }
        text += "%@";
        continue;
      }
      if (source[i] === "\\") {
        text += source[i + 1] === "n" ? "\n" : source[i + 1];
        i += 2;
        continue;
      }
      text += source[i++];
    }
    out.push({ text, before: source.slice(Math.max(0, start - 80), start), after: source.slice(i + 1, i + 3) });
  }
  return out;
}

// Contexts in which a literal is a localization key.
const KEY_CONTEXT = [
  /\bL\([^()]*$/,
  /\bL\(\w+\["\w+"\]\.bool \? $/,
  /\bL\(\w+\["\w+"\]\.bool \? "[^"]*" : $/,
  /FPFormat\.count\($/,
  /\btitle: $/,
  /LocalizedStringResource = $/,
  /TypeDisplayRepresentation = $/,
  /IntentDescription\($/,
  /\.configurationDisplayName\($/,
  /\.description\($/,
  /\.displayName\($/,
  /\bLabel\($/,
  /LocalizedStringKey\($/,
  /ControlWidgetToggle\($/,
  /\n\s+\.\w+: $/,
  /requestValueDialog: $/,
  /dialog: $/,
  /shortTitle: $/,
  /case \.\w+: return $/,
];

function swiftKeys(source) {
  const keys = new Set();
  for (const { text, before, after } of literals(source)) {
    if (!text || after.startsWith("]") || /^(%@|[^\p{L}])*$/u.test(text)) continue;
    if (/^[a-z][A-Za-z.]*$/.test(text) && !/\btitle: $|L\($/.test(before)) continue;
    if (KEY_CONTEXT.some((re) => re.test(before))) keys.add(text);
  }
  return keys;
}

// App Shortcut phrases: "Add a note to ${applicationName}".
function shortcutPhrases(source) {
  const phrases = new Set();
  for (const block of source.matchAll(/phrases: \[([^\]]*)\]/g))
    for (const { text } of literals(block[1])) phrases.add(text.replace("%@", "${applicationName}"));
  return phrases;
}

module.exports = { swiftKeys, shortcutPhrases };
