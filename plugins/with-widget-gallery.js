// Android: the widget gallery's labels and descriptions in English (the
// default strings.xml); German and French come with the locales
// (app.config.ts → plugins/widget-suite/strings.js).
const { AndroidConfig, withStringsXml } = require("expo/config-plugins");
const { galleryStrings } = require("./widget-suite/strings");

module.exports = (config) =>
  withStringsXml(config, (config) => {
    // Android resources: a backslash starts an escape, a bare apostrophe is
    // an error – both are escaped.
    config.modResults = AndroidConfig.Strings.setStringItem(
      Object.entries(galleryStrings("en")).map(([name, value]) => ({ $: { name }, _: value.replace(/[\\']/g, "\\$&") })),
      config.modResults,
    );
    return config;
  });
