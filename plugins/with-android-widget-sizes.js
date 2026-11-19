// Android: how far each home screen widget can be made smaller (and larger)
// than the size it is added with. react-native-android-widget writes the
// provider XML (res/xml/widgetprovider_<name>.xml) with minWidth, minHeight,
// targetCell* and maxResize*, but no minResizeWidth/minResizeHeight – so a
// widget could not shrink below the size it was added with. This adds them
// (Android 12+ also reads targetCellWidth/Height; before that minWidth and
// minHeight are the default size).
//
// Listed before react-native-android-widget in app.config.ts: mods run
// last-added first, so this runs after it has written the files.
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const DP = /^\d{1,4}dp$/;

// sizes: { [widgetName]: { minResizeWidth: "110dp", minResizeHeight: "40dp" } }
function patch(xml, size) {
  let out = xml.replace(/\s+android:minResize(Width|Height)="[^"]*"/g, "");
  const attributes = [];
  if (DP.test(size.minResizeWidth ?? "")) attributes.push(`android:minResizeWidth="${size.minResizeWidth}"`);
  if (DP.test(size.minResizeHeight ?? "")) attributes.push(`android:minResizeHeight="${size.minResizeHeight}"`);
  if (!attributes.length) return out;
  if (!out.includes("<appwidget-provider")) throw new Error("with-android-widget-sizes: no <appwidget-provider> in the widget's XML");
  return out.replace(/<appwidget-provider\b/, `<appwidget-provider\n    ${attributes.join("\n    ")}`);
}

module.exports = (config, sizes = {}) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      for (const [name, size] of Object.entries(sizes)) {
        const file = path.join(dir, `widgetprovider_${name.toLowerCase()}.xml`);
        if (!fs.existsSync(file)) throw new Error(`with-android-widget-sizes: ${path.basename(file)} is missing (list this plugin before react-native-android-widget)`);
        fs.writeFileSync(file, patch(fs.readFileSync(file, "utf8"), size));
      }
      return config;
    },
  ]);

module.exports.patch = patch;
