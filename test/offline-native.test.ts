// The native side of the offline copy cannot run here: its wiring is
// checked against the sources (as for the widget suite and intents).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const module = read("modules/flowplan-native/ios/FlowplanNativeModule.swift");
const files = read("modules/flowplan-native/ios/FlowplanOfflineFiles.swift");
const wrapper = read("modules/flowplan-native/src/index.ts");

test("every file function JavaScript calls is defined in Swift, with its arguments", () => {
  const expected: Record<string, string> = {
    offlineRead: "(path: String, promise: Promise)",
    offlineWrite: "(path: String, base64: String, promise: Promise)",
    offlineReadText: "(path: String, promise: Promise)",
    offlineWriteText: "(path: String, text: String, promise: Promise)",
    offlineRemove: "(path: String, promise: Promise)",
    offlineList: "(path: String, promise: Promise)",
    offlineAvailable: "(promise: Promise)",
  };
  for (const [name, args] of Object.entries(expected)) {
    assert.ok(module.includes(`AsyncFunction("${name}") { ${args} in`), name);
    assert.match(wrapper, new RegExp(`${name}\\?\\(`), name);
    assert.ok(wrapper.includes(`m.${name}!(`), name);
  }
  // Every answer resolves or rejects the promise.
  const bodies = module.split('AsyncFunction("offline').slice(1);
  for (const body of bodies) assert.match(body.slice(0, 600), /FlowplanOfflineFiles\.run\(\{[^}]*promise\.resolve[^}]*\}, \{ promise\.reject\("ERR_OFFLINE_FILES", \$0\) \}\)/);
});

test("the files are protected, kept out of backups and confined to their folder", () => {
  assert.match(files, /\.applicationSupportDirectory/);
  assert.match(files, /FileProtectionType\.completeUntilFirstUserAuthentication/);
  assert.match(files, /\.completeFileProtectionUntilFirstUserAuthentication/);
  assert.match(files, /\.atomic/);
  assert.match(files, /isExcludedFromBackup = true/);
  // Paths: at most four components, no empty or dot-first one; the folder
  // itself only for listing.
  assert.match(files, /parts\.count <= 4/);
  assert.match(files, /first != "\."/);
  assert.match(files, /if path\.isEmpty && allowRoot \{ return try root\(\) \}/);
  assert.equal((files.match(/allowRoot: true/g) || []).length, 1);
  assert.match(files, /static func list[\s\S]*?allowRoot: true/);
  // Work off the main thread, one operation at a time.
  assert.match(files, /DispatchQueue\(label: "app\.flowplan\.offline\.files", qos: \.utility\)/);
  // Only Foundation APIs (the module has no further dependencies).
  assert.match(files, /^import Foundation$/m);
});

test("the window offers the copy, answers its calls and falls back to it", () => {
  const shell = read("src/screens/Shell.tsx");
  assert.match(shell, /offline: !!copy,/);
  assert.match(shell, /Platform\.OS === "ios" \? offlineCopy\(profile\) : null/);
  assert.match(shell, /message\.type === "offline"[\s\S]*offlineAnswer\(copy, call\)/);
  // Without a connection: the copy first, the offline screen without one.
  assert.match(shell, /else void showCopy\(\);/);
  assert.match(shell, /if \(!html\) \{\s*setOffline\(true\);/);
  assert.match(shell, /setSource\(\{ html, baseUrl: `\$\{server\}\/\$\{hash\}` \}\)/);
  // Back online: reached, then the live page once nobody types – at once
  // when the instance runs another build (src/offline/stale.ts, #61).
  assert.match(shell, /run\(reachedScript\);\s*if \(copyOnReach\(copyBuild\.current, answer\.build\) === "now"\) goLive\(\);\s*else run\(returnScript\);/);
  assert.match(shell, /copyBuild\.current = pageBuild\(html\);/);
  // The page's report of files that did not load, and no stale page from
  // Android's HTTP cache.
  assert.match(shell, /message\.type === "staleCopy"[\s\S]*handleStale\(stale\)/);
  assert.match(shell, /cacheMode="LOAD_DEFAULT"/);
  assert.match(shell, /source=\{webSource\}/);
  const app = read("src/App.tsx");
  // A removed profile's copy goes (dropProfile: removed, or replaced by
  // another address, #69).
  assert.match(app, /void wipeOfflineCopy\(id\);/);
  assert.match(app, /dropProfile\(current\.id\);/);
  assert.match(app, /wipeOrphanCopies\(/);
  assert.match(read("src/native/background.ts"), /requestOfflineRefresh\(\);/);
  // Android keeps its copy with the web view's service worker.
  assert.match(wrapper, /Platform\.OS !== "ios"/);
});
