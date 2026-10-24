import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import {
  entriesKey,
  isSpotlightData,
  matchesTarget,
  pageScanRequest,
  saveScan,
  scanLanguages,
  scanRequest,
  scanTitle,
  spotlightDomain,
  spotlightEntries,
  targetChoices,
  type SpotlightData,
} from "../src/capture";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { pathOfAppLink } from "../src/navigation";
import { strings as appStrings } from "../src/i18n";

const { strings, LANGS, swiftTable } = require("../plugins/capture/strings") as {
  strings: Record<string, string[]>;
  LANGS: string[];
  swiftTable: () => string;
};
const plugin = require("../plugins/with-capture") as { ACTIVATION_RULE: string; TARGET: string };
const root = join(__dirname, "..");
const PAGE = "0b9f8f7e-4a39-4d5c-9a51-2a8a3c0b6c11";
const ROW = "6c2d3e4f-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("scanner links and the page's request only take the instance's ids", () => {
  assert.deepEqual(scanRequest("flowplan://scan"), {});
  assert.deepEqual(scanRequest(`flowplan://scan?target=${PAGE.toUpperCase()}&row=${ROW}`), { target: PAGE, rowId: ROW, start: true });
  assert.deepEqual(scanRequest("flowplan://scan?target=../../etc"), {});
  assert.equal(scanRequest("flowplan://capture?mode=note"), null);
  assert.equal(scanRequest("https://example.com/scan"), null);
  assert.deepEqual(pageScanRequest({ pageId: PAGE }), { target: PAGE, start: true });
  assert.deepEqual(pageScanRequest({ pageId: PAGE, rowId: ROW }), { target: PAGE, rowId: ROW, start: true });
  assert.deepEqual(pageScanRequest({ pageId: PAGE, rowId: "x" }), { target: PAGE, start: true });
  assert.equal(pageScanRequest({ pageId: "javascript:alert(1)" }), null);
  assert.equal(pageScanRequest({}), null);
});

test("the bridge offers the scanner only where the app has one", () => {
  const server = "https://flowplan.example.com";
  assert.doesNotMatch(bridgeScript({ server, platform: "ios", version: "1" }), /scanDocument/);
  assert.match(bridgeScript({ server, platform: "ios", version: "1", scanner: true }), /scanDocument: \(target\) => post\(\{ type: "scanDocument"/);
  assert.deepEqual(parsePageMessage(JSON.stringify({ type: "scanDocument", pageId: PAGE })), { type: "scanDocument", pageId: PAGE });
});

test("scan titles and recognition languages follow the person's language", () => {
  const date = new Date(2026, 9, 24, 9, 5);
  assert.equal(scanTitle("de", date), "Scan 2026-10-24 09.05");
  assert.equal(scanTitle("fr", date), "Numérisation 2026-10-24 09.05");
  assert.deepEqual(scanLanguages("fr"), ["fr-FR", "de-DE", "en-US"]);
  assert.deepEqual(scanLanguages("en"), ["en-US", "de-DE", "fr-FR"]);
});

test("a scan is sent as multipart with its text, appended to the page", async () => {
  let seen: { url: string; headers: Record<string, string>; body: FormData } | null = null;
  const result = await saveScan(
    { server: "https://flowplan.example.com", token: "fpd_x", lang: "de" },
    { targetId: PAGE, rowId: ROW, title: "Scan", text: "Rechnung 42", file: { uri: "file:///tmp/scan.pdf", name: "scan.pdf" } },
    async (url, init) => {
      seen = { url, headers: init.headers, body: init.body as FormData };
      return { status: 200, ok: true, json: async () => ({ ok: true, pageId: PAGE, url: `/#page=${PAGE}`, title: "Scan" }) };
    },
  );
  assert.ok(result.ok);
  assert.equal(seen!.url, "https://flowplan.example.com/api/mobile/capture/save?lang=de");
  assert.equal(seen!.headers.Authorization, "Bearer fpd_x");
  assert.equal(seen!.headers["Content-Type"], undefined);
  const form = seen!.body;
  assert.equal(form.get("targetId"), PAGE);
  assert.equal(form.get("rowId"), ROW);
  assert.equal(form.get("place"), "append");
  assert.equal(form.get("recognized"), "Rechnung 42");
  const signedOut = await saveScan({ server: "https://a.example", token: "t", lang: "en" }, { targetId: PAGE, title: "S", text: "", file: { uri: "file:///x.pdf", name: "x.pdf" } }, async () => ({
    status: 401,
    ok: false,
    json: async () => ({}),
  }));
  assert.deepEqual(signedOut, { ok: false, signedOut: true });
});

test("targets: the inbox first, protected pages left out, searchable", () => {
  const choices = targetChoices({
    inbox: { id: "a", name: "Inbox", kind: "database" },
    targets: [
      { id: "a", name: "Inbox", kind: "database", space: "Team" },
      { id: "b", name: "Notes", kind: "document", space: "Team", workspace: "Acme" },
      { id: "c", name: "", kind: "document", encrypted: true },
      { id: "d", name: "Diary", kind: "document", locked: true },
    ],
  });
  assert.deepEqual(choices.map((c) => c.id), ["a", "b"]);
  assert.equal((choices[0] as { inbox?: boolean }).inbox, true);
  assert.ok(matchesTarget(choices[1], "acme"));
  assert.ok(!matchesTarget(choices[1], "sales"));
});

test("Spotlight entries: titles, place, safe paths; a key that changes with them", () => {
  const data: SpotlightData = {
    pages: [
      { id: "p1", title: "Roadmap", kind: "document", place: "Acme · Product", excerpt: "Q4 goals", updatedAt: "2026-10-01 08:00:00", url: "/#page=p1" },
      { id: "p2", title: "Bugs", kind: "database", place: "Acme · Dev", excerpt: "", updatedAt: "2026-10-02 08:00:00", url: "/#page=p2" },
      { id: "p3", title: "Evil", kind: "document", place: "", excerpt: "", updatedAt: "", url: "//evil.example" },
    ],
    tasks: [{ id: "p1::0", text: "Ship it", page: "Roadmap", due: "2026-10-24", url: "/#page=p1" }],
  };
  assert.ok(isSpotlightData(data));
  assert.ok(!isSpotlightData({ pages: [] }));
  const entries = spotlightEntries(data, "en", "2026-10-24");
  assert.deepEqual(entries.map((e) => e.id), ["page:p1", "page:p2", "task:p1::0"]);
  assert.equal(entries[0].description, "Page · Acme · Product\nQ4 goals");
  assert.equal(entries[0].updatedAt, Date.UTC(2026, 9, 1, 8));
  assert.equal(entries[1].description, "Database · Acme · Dev");
  assert.equal(entries[2].description, "Task · Roadmap · Today");
  assert.ok(entries[2].keywords!.includes("Task"));
  assert.equal(spotlightEntries(data, "de", "2026-10-24")[2].description, "Aufgabe · Roadmap · Heute");
  assert.notEqual(entriesKey(entries), entriesKey(entries.slice(1)));
  assert.equal(entriesKey(entries), entriesKey(spotlightEntries(data, "en", "2026-10-24")));
  assert.equal(spotlightDomain("abc"), "app.flowplan.abc");
});

test("a Spotlight result's link opens its path (as the Swift side encodes it)", () => {
  // FPCLinks.link: everything but letters, digits and -._~/ percent-encoded.
  const encode = (path: string) => "flowplan://open?path=" + path.replace(/[^A-Za-z0-9\-._~/]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
  assert.equal(pathOfAppLink(encode(`/#page=${PAGE}&row=${ROW}`)), `/#page=${PAGE}&row=${ROW}`);
  const swift = readFileSync(join(root, "modules/flowplan-capture/ios/FlowplanCaptureModule.swift"), "utf8");
  assert.match(swift, /abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-\._~\//);
});

test("the share extension speaks German, English and French; every key it uses exists", () => {
  for (const [key, values] of Object.entries(strings)) {
    assert.equal(values.length, LANGS.length, key);
    for (const value of values) assert.ok(value.trim(), key);
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(names(values[0]), names(values[1]), key);
    assert.deepEqual(names(values[2]), names(values[1]), key);
  }
  const sources = readdirSync(join(root, "plugins/capture"))
    .filter((f) => f.endsWith(".swift"))
    .map((f) => readFileSync(join(root, "plugins/capture", f), "utf8"))
    .join("\n");
  const used = new Set([...sources.matchAll(/FPSStrings\.t\("(\w+)"/g)].map((m) => m[1]));
  assert.ok(used.size > 10);
  for (const key of used) assert.ok(strings[key], `missing: ${key}`);
  const table = swiftTable();
  assert.match(table, /private static let fr: \[String: String\] = \[/);
  assert.match(table, /"heading": "Enregistrer dans Flowplan",/);
});

test("the app's own texts for scanner and Spotlight exist in every language", () => {
  const keys = Object.keys(appStrings.de).filter((key) => key.startsWith("scan") || key.startsWith("spotlight"));
  assert.ok(keys.length >= 10);
  for (const key of keys) for (const lang of ["en", "fr"] as const) assert.ok((appStrings[lang] as Record<string, string>)[key], `${lang}: ${key}`);
});

test("the share extension is wired into the config with the App Group", () => {
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "./plugins/with-capture") as [string, Record<string, string>] | undefined;
  assert.ok(entry);
  assert.equal(entry![1].appGroup, (config.extra as { appGroup: string }).appGroup);
  assert.equal(entry![1].bundleIdentifier, `${config.ios!.bundleIdentifier}.share`);
  assert.match(plugin.ACTIVATION_RULE, /com\.adobe\.pdf/);
  assert.match(plugin.ACTIVATION_RULE, /public\.image/);
  assert.equal(plugin.TARGET, "FlowplanShare");
  // The extension reads the same keychain item the app writes for the widgets.
  const shared = readFileSync(join(root, "modules/flowplan-native/ios/WidgetShared.swift"), "utf8");
  const model = readFileSync(join(root, "plugins/capture/ShareModel.swift"), "utf8");
  for (const value of ['"app.flowplan.widgets"', '"session"']) {
    assert.ok(shared.includes(value) && model.includes(value), value);
  }
  // Fastlane signs it like the other targets.
  assert.match(readFileSync(join(root, "fastlane/Fastfile"), "utf8"), /target: "FlowplanShare", bundle_id: SHARE_ID/);
});
