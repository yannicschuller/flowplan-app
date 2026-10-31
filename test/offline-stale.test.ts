// An outdated copy of the instance's page (#61 in Flowplan): the build of
// the stored page against the instance's, and what the app does when the
// page reports that its files did not load (src/offline/stale.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_CACHE, MARKER_KEY, SETTINGS_CACHE } from "../src/offline/policy";
import { OfflineCopy } from "../src/offline/store";
import { answerBuild, copyOnReach, forgetCopyPage, pageBuild, parseStaleMessage, staleAction } from "../src/offline/stale";
import { parsePageMessage } from "../src/bridge-script";
import { nodeFiles, sha256 } from "./offline-files";

test("the build of a stored page and of an answer", () => {
  assert.equal(pageBuild('<html><head><meta charSet="utf-8"/><meta name="flowplan-build" content="7fgem4PEMGY2lUDEPIA4K"/></head></html>'), "7fgem4PEMGY2lUDEPIA4K");
  assert.equal(pageBuild("<meta content='b-1' name='flowplan-build'>"), "b-1");
  // Older instances name none; nothing but an id counts.
  assert.equal(pageBuild('<html><head><meta name="viewport" content="x"/></head></html>'), null);
  assert.equal(pageBuild('<meta name="flowplan-build" content="a b"/>'), null);
  assert.equal(pageBuild('<meta name="flowplan-builds" content="x"/>'), null);
  const headers = (value: string | null) => ({ get: (name: string) => (name === "x-flowplan-build" ? value : null) });
  assert.equal(answerBuild(headers("HyzVg_-lYCJKcAOaE6pNK")), "HyzVg_-lYCJKcAOaE6pNK");
  assert.equal(answerBuild(headers(null)), null);
  assert.equal(answerBuild(headers("<script>")), null);
  // Real headers are looked up regardless of case.
  assert.equal(answerBuild(new Headers({ "X-Flowplan-Build": "abc" })), "abc");
});

test("the stored copy gives way at once to another build, otherwise once nobody types", () => {
  assert.equal(copyOnReach("A", "B"), "now");
  assert.equal(copyOnReach("A", "A"), "return");
  // Without both ids (an older instance or copy): as before.
  assert.equal(copyOnReach(null, "B"), "return");
  assert.equal(copyOnReach("A", null), "return");
});

test("the page's report: the stored copy is replaced, the live page reloads itself", () => {
  const raw = JSON.stringify({ type: "staleCopy", build: "A", clear: false });
  const message = parseStaleMessage(parsePageMessage(raw));
  assert.deepEqual(message, { type: "staleCopy", build: "A", clear: false, copy: false });
  assert.deepEqual(parseStaleMessage({ type: "staleCopy", build: "</x>", clear: "yes", copy: 1 }), { type: "staleCopy", build: null, clear: false, copy: false });
  assert.equal(parseStaleMessage({ type: "offline" }), null);
  assert.equal(parseStaleMessage(null), null);
  // From the stored copy: forgotten, the live page or the offline screen.
  assert.deepEqual(staleAction(message!, true, true), { forgetCopyPage: true, clearWebCache: false, next: "live" });
  assert.deepEqual(staleAction(message!, true, false), { forgetCopyPage: true, clearWebCache: false, next: "offline" });
  // From the live page: the web view's cache goes; the copy only on "Clear cache".
  assert.deepEqual(staleAction(message!, false, true), { forgetCopyPage: false, clearWebCache: true, next: "page" });
  assert.deepEqual(staleAction({ ...message!, clear: true }, false, true), { forgetCopyPage: true, clearWebCache: true, next: "page" });
});

test("a forgotten page is stored again by the page's next refresh", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "offline-stale-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const copy = new OfflineCopy("p1", nodeFiles(root), sha256, () => 1000);
  const b64 = (text: string) => Buffer.from(text).toString("base64");
  const entry = (body: string, type: string) => ({ status: 200, statusText: "OK", headers: [["content-type", type]] as [string, string][], body: b64(body) });
  const marker = { user: "u1", since: 1, app: { build: "A", version: "0.8.0", stored: 3, total: 3, bytes: 9, complete: true, shell: true } };
  assert.equal(await copy.put(SETTINGS_CACHE, MARKER_KEY, entry(JSON.stringify(marker), "application/json")), true);
  assert.equal(await copy.put(DATA_CACHE, "/", entry("<html><head></head><body>app</body></html>", "text/html")), true);
  assert.equal(await copy.put(DATA_CACHE, "/api/bootstrap", entry("{}", "application/json")), true);
  assert.equal((await copy.state()).page, true);
  await forgetCopyPage(copy);
  const state = await copy.state();
  assert.equal(state.page, false);
  assert.equal(state.enabled, true);
  // components/offline.ts stores the app's page when app.shell is false.
  assert.deepEqual(state.marker, { ...marker, app: { ...marker.app, shell: false } });
  // What was stored besides the page stays.
  assert.ok(await copy.match(DATA_CACHE, "/api/bootstrap"));
});
