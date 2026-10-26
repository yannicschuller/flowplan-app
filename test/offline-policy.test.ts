import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKind, checkEntry, cleanKey, estimate, keyAllowed, lookupAllowed, MAX_ENTRY, MAX_PROFILE, DISK_RESERVE } from "../src/offline/policy";

const PAGE = "0b7f7c56-0f3d-4f39-8d4c-8a2b9c3d4e5f";
const b64 = (text: string) => Buffer.from(text).toString("base64");
const entry = (body: string, headers: [string, string][] = [["content-type", "application/json"]], status = 200) => ({ status, statusText: "OK", headers, body: b64(body) });

test("only the copy's caches", () => {
  assert.equal(cacheKind("flowplan-settings"), "settings");
  assert.equal(cacheKind("flowplan-data-v1"), "data");
  assert.equal(cacheKind("flowplan-static-3RN7pqUEDKMhp4cyqg1SU"), "static");
  assert.equal(cacheKind("flowplan-static-v1"), "static");
  for (const name of ["flowplan-static-", "flowplan-static-../x", "flowplan-data-v2", "other", "", null, 3]) assert.equal(cacheKind(name), null, String(name));
});

test("keys are paths with a query on the instance, nothing that escapes", () => {
  assert.equal(cleanKey("/api/bootstrap?workspace=w"), "/api/bootstrap?workspace=w");
  for (const key of ["//evil.example/x", "https://evil.example/", "/a/../b", "/a/%2e%2e/b", "/a#b", "/a\\b", "a", "", "/x\n", "/" + "x".repeat(3000)])
    assert.equal(cleanKey(key), null, key);
});

test("each cache holds its own kind of key", () => {
  const allowed: [string, string][] = [
    ["flowplan-settings", "/__flowplan-offline"],
    ["flowplan-data-v1", "/"],
    ["flowplan-data-v1", "/api/bootstrap"],
    ["flowplan-data-v1", "/api/bootstrap?workspace=w1"],
    ["flowplan-data-v1", `/api/pages/${PAGE}`],
    ["flowplan-data-v1", `/api/pages/${PAGE}?view=v`],
    ["flowplan-data-v1", `/api/pages/${PAGE}/rows/${PAGE}`],
    ["flowplan-data-v1", `/api/files/${PAGE}?thumb=1`],
    ["flowplan-static-B1", "/_next/static/chunks/0a-rekt06v0sv.js"],
    ["flowplan-static-B1", "/_next/static/media/KaTeX_Main-Regular.1ryv.woff2"],
    ["flowplan-static-B1", "/fonts.css"],
    ["flowplan-static-B1", "/fonts/instrument-sans-latin-standard-normal.woff2"],
    ["flowplan-static-B1", "/icons/icon-192.png"],
  ];
  for (const [cache, key] of allowed) assert.equal(keyAllowed(cache, key), true, `${cache} ${key}`);
  const refused: [string, string][] = [
    ["flowplan-settings", "/"],
    ["flowplan-data-v1", "/__flowplan-offline"],
    ["flowplan-data-v1", "/api/command"],
    ["flowplan-data-v1", "/api/auth/session"],
    ["flowplan-data-v1", "/api/mobile/register"],
    ["flowplan-data-v1", "/api/pages/not-a-uuid"],
    ["flowplan-data-v1", `/api/pages/${PAGE}/export`],
    ["flowplan-data-v1", "/settings"],
    ["flowplan-data-v1", "/_next/static/chunks/a.js"],
    ["flowplan-static-B1", "/api/bootstrap"],
    ["flowplan-static-B1", "/sw.js"],
    ["flowplan-static-B1", "/fonts/a/b.woff2"],
    ["unknown", "/"],
  ];
  for (const [cache, key] of refused) assert.equal(keyAllowed(cache, key), false, `${cache} ${key}`);
  assert.equal(lookupAllowed("/_next/static/chunks/a.js"), true);
  assert.equal(lookupAllowed(`/api/files/${PAGE}`), true);
  assert.equal(lookupAllowed("/api/command"), false);
});

test("answers are kept without cookies, only with a 200 and within the size", () => {
  const kept = checkEntry("flowplan-data-v1", `/api/pages/${PAGE}`, entry('{"id":1}', [
    ["Content-Type", "application/json"],
    ["Set-Cookie", "flowplan_session=secret"],
    ["Cache-Control", "private, no-store"],
    ["X-Other", "dropped"],
  ]));
  assert.ok("entry" in kept);
  if ("entry" in kept)
    assert.deepEqual(kept.entry.headers, [
      ["content-type", "application/json"],
      ["cache-control", "private, no-store"],
    ]);
  assert.deepEqual(checkEntry("flowplan-data-v1", `/api/pages/${PAGE}`, entry("{}", [], 404)), { refused: "status" });
  assert.deepEqual(checkEntry("flowplan-data-v1", `/api/pages/${PAGE}`, { status: 200, headers: [], body: "not base64!" }), { refused: "body" });
  assert.deepEqual(checkEntry("flowplan-data-v1", "/api/command", entry("{}")), { refused: "key" });
  assert.deepEqual(checkEntry("nope", "/", entry("{}")), { refused: "cache" });
  const big = { status: 200, headers: [], body: "A".repeat(Math.ceil(((MAX_ENTRY + 3) * 4) / 3 / 4) * 4) };
  assert.deepEqual(checkEntry("flowplan-static-B1", "/_next/static/chunks/big.js", big), { refused: "size" });
});

test("no-store is respected except for what the copy is made of", () => {
  // The instance marks every API answer no-store: the pages are what offline use is for.
  assert.ok("entry" in checkEntry("flowplan-data-v1", "/api/bootstrap", entry("{}", [["cache-control", "private, no-store"]])));
  assert.ok("entry" in checkEntry("flowplan-data-v1", "/", entry("<html><head></head></html>", [["cache-control", "private, no-cache, no-store, max-age=0"]])));
  assert.deepEqual(checkEntry("flowplan-static-B1", "/_next/static/chunks/a.js", entry("x", [["cache-control", "no-store"]])), { refused: "no-store" });
  assert.ok("entry" in checkEntry("flowplan-static-B1", "/_next/static/chunks/a.js", entry("x", [["cache-control", "public, max-age=31536000, immutable"]])));
});

test("the sign-in page is never the stored app page, the marker names a person", () => {
  assert.deepEqual(checkEntry("flowplan-data-v1", "/", entry('<html><body data-signed-out="">Anmelden</body></html>')), { refused: "signed-out" });
  assert.ok("entry" in checkEntry("flowplan-settings", "/__flowplan-offline", entry(JSON.stringify({ user: "u1", since: 1 }))));
  assert.deepEqual(checkEntry("flowplan-settings", "/__flowplan-offline", entry("{}")), { refused: "marker" });
  assert.deepEqual(checkEntry("flowplan-settings", "/__flowplan-offline", entry("nope")), { refused: "marker" });
});

test("the room the page sees: the profile's limit or the disk's reserve", () => {
  assert.deepEqual(estimate(100, 10 * 1024 ** 3), { usage: 100, quota: MAX_PROFILE });
  assert.deepEqual(estimate(100, DISK_RESERVE + 50), { usage: 100, quota: 150 });
  assert.deepEqual(estimate(100, 10), { usage: 100, quota: 100 });
});
