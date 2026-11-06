import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { sha256Base64Js, sha256HexJs } from "../src/sha256-js";

// #109: the fallback digest matches the platform's for any input.
test("plain SHA-256 matches node:crypto (hex and base64, ASCII, Unicode, block edges)", () => {
  const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "Grüße 👋 中文", randomBytes(48).toString("base64url")];
  for (const value of inputs) {
    assert.equal(sha256HexJs(value), createHash("sha256").update(value, "utf8").digest("hex"), value);
    assert.equal(sha256Base64Js(value), createHash("sha256").update(value, "utf8").digest("base64"), value);
  }
});
