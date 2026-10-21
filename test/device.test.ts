import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceName } from "../src/device";

test("devices are named so that people can tell them apart", () => {
  assert.equal(deviceName(["Yannic's iPhone", "iPhone 15 Pro"], "iPhone"), "Yannic's iPhone");
  // iOS 16+ hands apps only the generic name: the model then.
  assert.equal(deviceName(["iPhone", "iPhone 15 Pro"], "iPhone"), "iPhone 15 Pro");
  assert.equal(deviceName([" iPad ", "iPad Pro 11-inch (M4)"], "iPad"), "iPad Pro 11-inch (M4)");
  assert.equal(deviceName([null, "Pixel 8"], "Android"), "Pixel 8");
  assert.equal(deviceName([null, undefined], "Android"), "Android");
  assert.equal(deviceName(["", "android"], "Android"), "Android");
});
