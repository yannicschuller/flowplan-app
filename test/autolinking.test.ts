// expo-print 58.0.9's prebuilt iOS framework was compiled against a newer
// expo-modules-core than SDK 58.0.11 ships (the symbol AnyModule._classTypes
// is missing at launch – dyld stops the app before any code runs, 1.1.3 and
// 1.1.4 on iPhone and Mac). Built from source it links against the core the
// app actually has. Keep it there until the SDK and its prebuilt modules
// match again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("expo-print is built from source on iOS", () => {
  assert.ok(pkg.expo.autolinking.ios.buildFromSource.includes("expo-print"));
});
