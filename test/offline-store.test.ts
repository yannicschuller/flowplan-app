import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OfflineCopy, wipeProfile } from "../src/offline/store";
import { answerOffline, parseOfflineMessage } from "../src/offline/messages";
import { nodeFiles, sha256, checkPath } from "./offline-files";

const PAGE = "0b7f7c56-0f3d-4f39-8d4c-8a2b9c3d4e5f";
const b64 = (text: string) => Buffer.from(text).toString("base64");
const entry = (body: string, type = "application/json") => ({ status: 200, statusText: "OK", headers: [["content-type", type]] as [string, string][], body: b64(body) });
const marker = entry(JSON.stringify({ user: "u1", since: 1 }));

function setup(available?: number) {
  const root = mkdtempSync(join(tmpdir(), "offline-store-"));
  const files = nodeFiles(root, available);
  return { root, files, copy: (profile = "p1") => new OfflineCopy(profile, files, sha256, () => 1000) };
}

test("what the page stores comes back, and stays after a restart", async (t) => {
  const { root, copy } = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const one = copy();
  assert.equal(await one.put("flowplan-settings", "/__flowplan-offline", marker), true);
  assert.equal(await one.put("flowplan-data-v1", `/api/pages/${PAGE}`, entry('{"rows":[]}')), true);
  assert.equal(await one.put("flowplan-static-B1", "/_next/static/chunks/a.js", entry("a()", "text/javascript")), true);
  assert.deepEqual(await one.names(), ["flowplan-data-v1", "flowplan-settings", "flowplan-static-B1"]);
  assert.deepEqual(await one.keys("flowplan-data-v1"), [`/api/pages/${PAGE}`]);
  const hit = await one.match("flowplan-data-v1", `/api/pages/${PAGE}`);
  assert.equal(Buffer.from(hit!.body, "base64").toString(), '{"rows":[]}');
  assert.deepEqual(hit!.headers, [["content-type", "application/json"]]);
  // Any cache: the app's files of every build.
  assert.equal(Buffer.from((await one.match(null, "/_next/static/chunks/a.js"))!.body, "base64").toString(), "a()");
  assert.equal(await one.match(null, "/api/command"), null);

  const again = copy();
  assert.deepEqual(await again.keys("flowplan-static-B1"), ["/_next/static/chunks/a.js"]);
  const state = await again.state();
  assert.equal(state.enabled, true);
  assert.equal(state.page, false);
  assert.equal(state.bytes, 3 + 11 + Buffer.from(JSON.stringify({ user: "u1", since: 1 })).length);
  // Bodies are named by a hash of the key, never by the key.
  const bodies = readdirSync(join(root, "p1", "flowplan-data-v1"));
  assert.ok(bodies.every((name) => name === "index.json" || /^[0-9a-f]{64}\.b$/.test(name)), bodies.join());
});

test("refused answers are not kept", async (t) => {
  const { root, copy } = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = copy();
  assert.equal(await store.put("flowplan-data-v1", "/api/command", entry("{}")), "key");
  assert.equal(await store.put("flowplan-data-v1", "/", entry('<body data-signed-out="">')), "signed-out");
  assert.equal(await store.put("cookies", "/", entry("x")), "cache");
  assert.deepEqual(await store.names(), []);
});

test("interrupted writes are cleaned up, missing bodies forgotten", async (t) => {
  const { root, copy } = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = copy();
  await store.put("flowplan-data-v1", `/api/pages/${PAGE}`, entry("{}"));
  await store.put("flowplan-data-v1", "/api/bootstrap", entry("{}"));
  // A body without an entry (the app ended before the index was written)…
  writeFileSync(join(root, "p1", "flowplan-data-v1", `${"0".repeat(64)}.b`), "orphan");
  // … and an entry whose body is gone.
  const index = JSON.parse(readFileSync(join(root, "p1", "flowplan-data-v1", "index.json"), "utf8"));
  rmSync(join(root, "p1", "flowplan-data-v1", index.entries["/api/bootstrap"].file));
  const reopened = copy();
  assert.deepEqual(await reopened.keys("flowplan-data-v1"), [`/api/pages/${PAGE}`]);
  assert.ok(!existsSync(join(root, "p1", "flowplan-data-v1", `${"0".repeat(64)}.b`)));
});

test("delete, remove and wipe; profiles stay apart", async (t) => {
  const { root, files, copy } = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = copy("work"),
    home = copy("home");
  await work.put("flowplan-data-v1", `/api/pages/${PAGE}`, entry('{"t":"work"}'));
  await home.put("flowplan-data-v1", `/api/pages/${PAGE}`, entry('{"t":"home"}'));
  assert.equal(Buffer.from((await home.match("flowplan-data-v1", `/api/pages/${PAGE}`))!.body, "base64").toString(), '{"t":"home"}');
  assert.equal(await work.delete("flowplan-data-v1", `/api/pages/${PAGE}`), true);
  assert.equal(await work.delete("flowplan-data-v1", `/api/pages/${PAGE}`), false);
  await work.put("flowplan-static-B1", "/fonts.css", entry("body{}", "text/css"));
  assert.equal(await work.remove("flowplan-static-B1"), true);
  assert.equal(await work.remove("flowplan-static-B1"), false);
  assert.deepEqual(await work.names(), ["flowplan-data-v1"]);
  await work.wipe();
  assert.deepEqual(await files.list(""), ["home"]);
  await wipeProfile(files, "home");
  assert.deepEqual(await files.list(""), []);
  // Names that could leave the folder are refused before any file is touched.
  assert.throws(() => new OfflineCopy("../x", files, sha256));
  await wipeProfile(files, "..");
  assert.ok(existsSync(root));
});

test("a full device or profile refuses more", async (t) => {
  const { root, copy } = setup(300 * 1024 * 1024 + 4);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(await copy().put("flowplan-data-v1", "/api/bootstrap", entry("0123456789")), "full");
  const estimate = await copy().estimate();
  assert.deepEqual(estimate, { usage: 0, quota: 4 });
});

test("the path rules of the Swift side", () => {
  for (const ok of ["p1", "p1/flowplan-data-v1", "p1/flowplan-data-v1/index.json", `p1/flowplan-static-B_1/${"a".repeat(64)}.b`]) checkPath(ok);
  for (const bad of ["", "..", "p1/..", "p1/.hidden", "/abs", "p1//x", "a/b/c/d/e", "p1/x y", "p1/ü"]) assert.throws(() => checkPath(bad), bad);
  checkPath("", true);
});

test("the page's calls are answered by the profile's copy", async (t) => {
  const { root, copy } = setup();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = copy();
  const call = (op: string, args: Record<string, unknown> = {}) => answerOffline(store, parseOfflineMessage({ type: "offline", id: 1, op, ...args })!);
  assert.deepEqual(await call("put", { cache: "flowplan-settings", key: "/__flowplan-offline", entry: marker }), { ok: true, value: true });
  assert.deepEqual(await call("put", { cache: "flowplan-data-v1", key: "/api/command", entry: entry("{}") }), { ok: true, value: false });
  assert.deepEqual(await call("names"), { ok: true, value: ["flowplan-settings"] });
  assert.deepEqual(await call("keys", { cache: "flowplan-settings" }), { ok: true, value: ["/__flowplan-offline"] });
  const matched = await call("match", { cache: null, key: "/__flowplan-offline" });
  assert.equal(matched.ok && (matched.value as { status: number }).status, 200);
  assert.deepEqual(await call("state"), { ok: true, value: { enabled: true, page: false, bytes: Buffer.from(JSON.stringify({ user: "u1", since: 1 })).length } });
  assert.deepEqual(await call("has", { cache: null, key: "/__flowplan-offline" }), { ok: true, value: true });
  assert.deepEqual(await call("has", { cache: null, key: "/_next/static/chunks/none.js" }), { ok: true, value: false });
  assert.deepEqual(await call("has", { cache: null, key: "/api/command" }), { ok: true, value: false });
  assert.deepEqual(await call("nope"), { ok: false, error: "unknown" });
  assert.equal(parseOfflineMessage({ type: "offline", id: "1", op: "names" }), null);
  assert.equal(parseOfflineMessage({ type: "edges" }), null);
  assert.deepEqual(await call("remove", { cache: "flowplan-settings" }), { ok: true, value: true });
});
