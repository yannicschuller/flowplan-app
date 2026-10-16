// Android release builds: signed with the upload key from the environment
// (README → Signing), otherwise unsigned (app-release-unsigned.apk) instead of
// with the debug key that a generated project would use.
//   ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
//   ANDROID_KEY_PASSWORD (defaults to the keystore password)
const { withAppBuildGradle } = require("expo/config-plugins");

const SIGNING = `
    // Upload key from the environment (plugins/with-android-signing.js).
    signingConfigs {
        upload {
            if (System.getenv("ANDROID_KEYSTORE_FILE")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }
`;

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes("signingConfigs {\n        upload")) return config;
    // A second signingConfigs block merges into the first one.
    gradle = gradle.replace(/\n(\s*)buildTypes \{/, `\n${SIGNING}$1buildTypes {`);
    const release = /(release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!release.test(gradle)) throw new Error("with-android-signing: release signingConfig not found in app/build.gradle");
    gradle = gradle.replace(release, '$1signingConfig System.getenv("ANDROID_KEYSTORE_FILE") ? signingConfigs.upload : null');
    config.modResults.contents = gradle;
    return config;
  });
