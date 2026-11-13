// The native side of the certificates (#271) cannot run here: its wiring is
// checked against the sources (as for the offline files and the widgets).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const kotlinDir = "modules/flowplan-native/android/src/main/java/app/flowplan/nativeshell";
const pins = read(`${kotlinDir}/CertificatePins.kt`);
const client = read(`${kotlinDir}/PinnedWebViewClient.java`);
const module = read(`${kotlinDir}/FlowplanNativeModule.kt`);
const swift = read("modules/flowplan-native/ios/FlowplanNativeModule.swift");
const inspector = read("modules/flowplan-native/ios/FlowplanCertificates.swift");
const wrapper = read("modules/flowplan-native/src/index.ts");
const rncClient = read("node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java");
const { NETWORK_SECURITY_XML, FILE } = require("../plugins/with-network-security") as { NETWORK_SECURITY_XML: string; FILE: string };

test("Android: the app trusts the system's and the person's CAs, and plain HTTP stays as it was", () => {
  assert.match(NETWORK_SECURITY_XML, /<certificates src="system" \/>/);
  assert.match(NETWORK_SECURITY_XML, /<certificates src="user" \/>/);
  // A network security config makes Android ignore usesCleartextTraffic.
  assert.match(NETWORK_SECURITY_XML, /<base-config cleartextTrafficPermitted="true">/);
  assert.doesNotMatch(NETWORK_SECURITY_XML, /debug-overrides|domain-config|overridePins/);
  assert.ok((config.plugins ?? []).includes("./plugins/with-network-security"));
  const plugin = read("plugins/with-network-security.js");
  assert.ok(plugin.includes('application.$["android:networkSecurityConfig"] = `@xml/${FILE}`'));
  assert.ok(plugin.includes("app/src/main/res/xml"));
  assert.equal(FILE, "flowplan_network_security");
  // The trade-off is written down where the setting is made.
  assert.match(plugin, /The trade-off/);
});

test("every native function JavaScript calls is defined, with its arguments", () => {
  assert.ok(module.includes('Function("setCertificatePins") { pins: List<Map<String, Any?>> ->'));
  assert.ok(module.includes('AsyncFunction("inspectCertificate") { origin: String, promise: Promise ->'));
  assert.match(module, /AsyncFunction\("armWebViews"\) \{[\s\S]*?PinnedWebViewClient\.arm\(root\)\s*\}\.runOnQueue\(Queues\.MAIN\)/);
  assert.match(module, /OnCreate \{[\s\S]*?CertificatePins\.install\(it\)/);
  assert.ok(swift.includes('AsyncFunction("inspectCertificate") { (origin: String, promise: Promise) in'));
  assert.ok(swift.includes("FlowplanCertificateInspector.inspect(origin) { promise.resolve($0) }"));
  for (const name of ["inspectCertificate", "setCertificatePins", "armWebViews"]) {
    assert.match(wrapper, new RegExp(`${name}\\?\\(`), name);
    assert.ok(wrapper.includes(`native?.${name}?.(`), name);
  }
  // Android only, where the app pins.
  assert.match(wrapper, /export function setCertificatePins[\s\S]*?if \(Platform\.OS !== "android"\) return;/);
  assert.match(wrapper, /export async function armWebViews[\s\S]*?if \(Platform\.OS !== "android"\) return 0;/);
  const gradle = read("modules/flowplan-native/android/build.gradle");
  assert.ok(gradle.includes("implementation 'com.facebook.react:react-android'"));
});

test("Android: a pin counts for its host and its exact certificate only (the rule of pins.ts → pinAllows)", () => {
  assert.match(pins, /fun matches\(host: String\?, der: ByteArray\?\): Boolean \{\s*val name = normalizeHost\(host\)\s*if \(name\.isEmpty\(\) \|\| der == null \|\| pins\.isEmpty\(\)\) return false\s*return pins\.contains\("\$name \$\{sha256\(der\)\}"\)/);
  assert.match(pins, /MessageDigest\.getInstance\("SHA-256"\)/);
  // The same normalization as normalizeHost in pins.ts.
  assert.ok(pins.includes('.trim().lowercase(Locale.ROOT).removePrefix("[").removeSuffix("]").removeSuffix(".")'));
  assert.ok(pins.includes('Regex("^[0-9a-f]{64}$")'));
});

test("Android: the app's requests ask the system first and fall back to the pin of the connection's host", () => {
  // No pins: OkHttp as React Native builds it.
  assert.match(pins, /NetworkingModule\.setCustomClientBuilder\(CustomClientBuilder \{ builder ->\s*if \(pins\.isEmpty\(\)\) return@CustomClientBuilder\s*builder\.sslSocketFactory\(socketFactory, trustManager\)\.hostnameVerifier\(hostnameVerifier\)/);
  const check = pins.slice(pins.indexOf("private fun check("));
  assert.match(check, /try \{\s*if \(host != null\) extensions\.checkServerTrusted\(arrayOf\(\*chain\), authType, host\)\s*else system\.checkServerTrusted\(chain, authType\)\s*\} catch \(error: CertificateException\) \{\s*if \(CertificatePins\.matches\(host, chain\[0\]\.encoded\)\) return\s*throw error/);
  // The host is the one the TLS connection is for.
  assert.ok(pins.includes("(socket as? SSLSocket)?.handshakeSession?.peerHost"));
  assert.match(pins, /HttpsURLConnection\.getDefaultHostnameVerifier\(\)\.verify\(host, session\) \|\|\s*matches\(host,/);
  // Never a trust manager that accepts everything: the only one of its own
  // (the inspection's) always refuses.
  const inspect = pins.slice(pins.indexOf("fun inspect("), pins.indexOf("private const val TIMEOUT_MS"));
  assert.match(inspect, /chain = certs\.map[\s\S]*?throw CertificateException\("Inspected"\)/);
  assert.doesNotMatch(pins + client, /ALLOW_ALL|TrustAll|trustAll|ALLOW_ALL_HOSTNAME_VERIFIER|HostnameVerifier \{ _, _ -> true \}/);
});

test("Android: the web view proceeds only for the pinned certificate of the page's host", () => {
  const ssl = client.slice(client.indexOf("public void onReceivedSslError"), client.indexOf("static byte[] certificateDer"));
  assert.match(ssl, /String host = url != null \? Uri\.parse\(url\)\.getHost\(\) : null;/);
  assert.match(ssl, /if \(CertificatePins\.matches\(host, der\)\) \{\s*handler\.proceed\(\);\s*return;\s*\}\s*delegate\.onReceivedSslError\(view, handler, error\);/);
  assert.equal(client.split("handler.proceed()").length - 1, 1, "proceed() only there");
  assert.match(client, /getX509Certificate\(\)/);
  assert.match(client, /getByteArray\("x509-certificate"\)/);
  // Every callback react-native-webview's client overrides goes on to it.
  const overridden = [...rncClient.matchAll(/@Override\s+public\s+[\w<>]+\s+(\w+)\s*\(/g)].map((m) => m[1]);
  assert.ok(overridden.includes("onReceivedSslError") && overridden.includes("onPageFinished"), "the installed version was read");
  for (const name of new Set(overridden)) {
    assert.match(client, new RegExp(`@Override\\s+public\\s+[\\w<>]+\\s+${name}\\s*\\(`), name);
    assert.ok(client.includes(`delegate.${name}(`), name);
  }
  // Both onReceivedError and shouldOverrideUrlLoading variants.
  assert.equal(client.split("delegate.onReceivedError(").length - 1, 2);
  assert.equal(client.split("delegate.shouldOverrideUrlLoading(").length - 1, 2);
  // Armed once per web view.
  assert.match(client, /if \(current instanceof PinnedWebViewClient\) return 0;/);
});

test("iOS: the inspection never accepts a certificate and sends no request", () => {
  assert.match(inspector, /trusted = SecTrustEvaluateWithError\(trust, nil\)/);
  assert.match(inspector, /SecTrustCopyCertificateChain\(trust\)/);
  assert.doesNotMatch(inspector, /\.useCredential|\.performDefaultHandling|URLCredential\(trust/);
  assert.equal(inspector.split("completionHandler(.cancelAuthenticationChallenge, nil)").length - 1, 2);
  assert.match(inspector, /URLSessionConfiguration\.ephemeral/);
  assert.match(inspector, /httpShouldSetCookies = false/);
  // No pinning on iOS: nothing hands certificates to the web view.
  for (const file of [swift, inspector, read("src/certs/review.ts"), read("src/certs/shell.ts")]) assert.doesNotMatch(file, /setCustomCertificatesForHost|customCertificatesForHost/);
});

test("the window and the setup go through the certificate handling", () => {
  const shell = read("src/screens/Shell.tsx");
  assert.match(shell, /if \(!certificateLoadError\(event\.nativeEvent, server, \{ reload: \(\) => web\.current\?\.reload\(\), retry, failed \}\)\) failed\(\);/);
  const setup = read("src/screens/Setup.tsx");
  assert.match(setup, /await checkServerTrusting\(origin, request\);/);
  assert.match(setup, /e instanceof CertificateRefused/);
  assert.match(read("src/App.tsx"), /useEffect\(\(\) => syncCertificatePins\(profiles\.profiles\.map\(\(profile\) => profile\.server\)\), \[profiles\]\);/);
  assert.match(read("src/screens/Settings.tsx"), /<CertificatePin server=\{current\?\.server\} \/>/);
  // Only Android pins (review.ts): iOS gets the explanation.
  assert.match(read("src/certs/review.ts"), /if \(!pin \|\| platform !== "android"\) return "declined";/);
  // The reason for App Store review is written down where pinning happens.
  assert.match(read("src/certs/review.ts"), /App Store review:/);
});
