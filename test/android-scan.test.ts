// The document scanner on Android (#397): where "Scan document" is offered
// and what it does without Google Play services, the file instead of a scan,
// and the Kotlin side matching the iOS module's answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { saveImport, scanEntryShown, scanMode, scannerRefused } from "../src/capture";
import { bridgeScript } from "../src/bridge-script";
import { strings } from "../src/i18n";
import type { NativeUploader, NativeUploadRequest } from "../src/upload";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const kotlinDir = "modules/flowplan-capture/android/src/main/java/app/flowplan/capture";
const PAGE = "0b9f8f7e-4a39-4d5c-9a51-2a8a3c0b6c11";
const ROW = "6c2d3e4f-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("scan mode: scanner where it works, the explanation on Android without Play services, nothing otherwise", () => {
  assert.equal(scanMode("ios", true, true), "scan");
  assert.equal(scanMode("android", true, true), "scan");
  // Android without Google Play services: explained, with a file instead.
  assert.equal(scanMode("android", true, false), "explain");
  // An iPhone without VisionKit's scanner, or a build without the module.
  assert.equal(scanMode("ios", true, false), "none");
  assert.equal(scanMode("android", false, false), "none");
  assert.equal(scanMode("ios", false, true), "none");
  assert.equal(scanMode("web", true, false), "none");
  assert.equal(scanEntryShown("scan"), true);
  assert.equal(scanEntryShown("explain"), true);
  assert.equal(scanEntryShown("none"), false);
});

test("the page gets 'Scan document' on Android too, also without Play services", () => {
  const server = "https://flowplan.example.com";
  const offered = (available: boolean) => bridgeScript({ server, platform: "android", version: "1", scanner: scanEntryShown(scanMode("android", true, available)) });
  assert.match(offered(true), /scanDocument: \(target\) => post\(\{ type: "scanDocument"/);
  assert.match(offered(false), /scanDocument: \(target\) => post\(\{ type: "scanDocument"/);
  assert.doesNotMatch(bridgeScript({ server, platform: "android", version: "1", scanner: scanEntryShown(scanMode("android", false, false)) }), /scanDocument/);
  // Shell.tsx decides with the same function.
  assert.match(read("src/screens/Shell.tsx"), /scanner: scanEntryShown\(scanMode\(Platform\.OS, scannerModule\(\), scannerAvailable\(\)\)\)/);
});

test("a scanner that cannot be loaded on Android is explained like missing Play services", () => {
  assert.equal(scannerRefused({ code: "ERR_SCANNER_UNAVAILABLE" }, "android"), true);
  assert.equal(scannerRefused({ code: "ERR_SCAN_FAILED" }, "android"), false);
  assert.equal(scannerRefused({ code: "ERR_SCANNER_UNAVAILABLE" }, "ios"), false);
  assert.equal(scannerRefused(null, "android"), false);
  assert.equal(scannerRefused(new Error("x"), "android"), false);
});

test("a picked file goes to the same place as a scan, without recognised text (Android: the native uploader)", async () => {
  const sent: NativeUploadRequest[] = [];
  const uploader: NativeUploader = async (request) => {
    sent.push(request);
    return { status: 200, body: JSON.stringify({ ok: true, pageId: PAGE, url: `/#page=${PAGE}`, title: "Invoice 42" }) };
  };
  const noFetch = async () => {
    throw new Error("fetch must not be used");
  };
  const file = { uri: "file:///cache/FlowplanScans/Invoice%2042.pdf", name: "Invoice 42.pdf", type: "application/pdf" };
  const result = await saveImport({ server: "https://flowplan.example.com", token: "fpd_x", lang: "en" }, { targetId: PAGE, rowId: ROW, file }, noFetch, "import-key-1", uploader);
  assert.ok(result.ok);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://flowplan.example.com/api/mobile/capture/save?lang=en");
  assert.deepEqual(sent[0].file, file);
  assert.deepEqual(sent[0].fields, { targetId: PAGE, rowId: ROW, place: "append", title: "Invoice 42" });
  assert.equal(sent[0].headers.Authorization, "Bearer fpd_x");
  assert.equal(sent[0].headers["Idempotency-Key"], "import-key-1");
  assert.equal(sent[0].headers["Content-Type"], undefined);
  // A photo without a name that has an extension keeps its name as the title.
  await saveImport({ server: "https://a.example", token: "t", lang: "de" }, { targetId: PAGE, file: { uri: "file:///x", name: "Beleg", type: "" } }, noFetch, "k2", uploader);
  assert.deepEqual(sent[1].fields, { targetId: PAGE, place: "append", title: "Beleg" });
  assert.equal(sent[1].file.type, "application/octet-stream");
});

test("without a native uploader (iOS) a picked file still goes as FormData", async () => {
  let form: FormData | null = null;
  let url = "";
  const result = await saveImport(
    { server: "https://flowplan.example.com", token: "fpd_x", lang: "en" },
    { targetId: PAGE, rowId: ROW, file: { uri: "file:///cache/FlowplanScans/Invoice 42.pdf", name: "Invoice 42.pdf", type: "application/pdf" } },
    async (to, init) => {
      url = to;
      form = init.body as FormData;
      return { status: 200, ok: true, json: async () => ({ ok: true, pageId: PAGE, url: `/#page=${PAGE}`, title: "Invoice 42" }) };
    },
    undefined,
    null,
  );
  assert.ok(result.ok);
  assert.equal(url, "https://flowplan.example.com/api/mobile/capture/save?lang=en");
  assert.equal(form!.get("targetId"), PAGE);
  assert.equal(form!.get("rowId"), ROW);
  assert.equal(form!.get("place"), "append");
  assert.equal(form!.get("title"), "Invoice 42");
  assert.equal(form!.get("scan"), null);
  assert.equal(form!.get("recognized"), null);
  assert.ok(form!.get("file"));
});

test("the explanation names Google Play services in every language", () => {
  for (const lang of ["de", "en", "fr", "zh"] as const) {
    assert.match(strings[lang].scanNeedsPlayServices, /Google Play/, lang);
    assert.ok(strings[lang].scanPickFile.trim(), lang);
  }
});

test("Android's module is autolinked and answers like the iOS one", () => {
  const config = JSON.parse(read("modules/flowplan-capture/expo-module.config.json")) as { platforms: string[]; android: { modules: string[] } };
  assert.deepEqual(config.platforms, ["apple", "android"]);
  assert.deepEqual(config.android.modules, ["app.flowplan.capture.FlowplanCaptureModule"]);
  const module = read(`${kotlinDir}/FlowplanCaptureModule.kt`);
  const scan = read(`${kotlinDir}/DocumentScan.kt`);
  assert.match(module, /^package app\.flowplan\.capture$/m);
  assert.match(module, /class FlowplanCaptureModule : Module\(\)/);
  assert.match(module, /Name\("FlowplanCapture"\)/);
  // Every function the JavaScript side calls on Android.
  for (const name of ["isScannerAvailable", "scanDocument", "pickDocument"]) assert.match(module, new RegExp(`Function\\("${name}"\\)`), name);
  assert.match(read("modules/flowplan-capture/src/index.ts"), /pickDocument\(\): Promise<PickedFile \| null>/);
  // The same keys as FPCScanResult.dictionary in DocumentScanner.swift.
  const swiftKeys = [...read("modules/flowplan-capture/ios/DocumentScanner.swift").matchAll(/"(\w+)": /g)].map((m) => m[1]);
  const kotlinKeys = [...scan.matchAll(/"(\w+)" to /g)].map((m) => m[1]);
  assert.deepEqual(kotlinKeys, swiftKeys);
  assert.match(module, /"ERR_SCANNER_UNAVAILABLE"/);
  // Its own request codes, not those of modules/flowplan-native.
  const updates = read("modules/flowplan-native/android/src/main/java/app/flowplan/nativeshell/AppUpdates.kt");
  for (const [, code] of module.matchAll(/const val REQUEST_\w+ = (0x[0-9a-f]+)/gi)) assert.doesNotMatch(updates, new RegExp(`= ${code}\\b`));
});

test("Android: ML Kit from Play services, no camera permission of its own", () => {
  const gradle = read("modules/flowplan-capture/android/build.gradle");
  assert.match(gradle, /com\.google\.android\.gms:play-services-mlkit-document-scanner:/);
  // The text model from Play services, not bundled (about 4 MB per ABI).
  assert.match(gradle, /com\.google\.android\.gms:play-services-mlkit-text-recognition:/);
  assert.doesNotMatch(gradle, /com\.google\.mlkit:text-recognition:/);
  assert.match(read(`${kotlinDir}/DocumentScan.kt`), /SCANNER_MODE_FULL/);
  assert.match(read("modules/flowplan-capture/android/src/main/AndroidManifest.xml"), /android:name="com\.google\.mlkit\.vision\.DEPENDENCIES" android:value="ocr"/);
  assert.doesNotMatch(read("modules/flowplan-capture/android/src/main/AndroidManifest.xml"), /uses-permission/);
  assert.doesNotMatch(read("app.config.ts"), /android\.permission\.CAMERA/);
});

test("the scan's PDF writes the text invisibly over the page images", () => {
  const pdf = read(`${kotlinDir}/ScanPdf.kt`);
  assert.match(pdf, /BT 3 Tr/);
  assert.match(pdf, /\/Filter \/DCTDecode/);
  assert.match(pdf, /\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
  // Each cross-reference entry is exactly 20 bytes.
  assert.match(pdf, /"%010d 00000 n \\n"/);
});
