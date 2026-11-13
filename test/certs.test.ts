// Self-signed and private-CA certificates (yannicschuller/flowplan#271 for
// the app): reading the certificate, the pins and the decision whether one
// is accepted, and the dialog's texts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { base64ToBytes, parseCertificate, toHex } from "../src/certs/x509";
import {
  certificateVerdict,
  formatDay,
  formatFingerprint,
  iosProblems,
  isCertificateError,
  makePin,
  namesCover,
  nativePins,
  normalizeFingerprint,
  normalizeHost,
  parsePins,
  pinAllows,
  pinFor,
  pinnableHost,
  prunePins,
  serializePins,
  withoutPin,
  withPin,
  type CertificatePin,
} from "../src/certs/pins";
import { certificateDialog } from "../src/certs/dialog";
import { certStrings } from "../src/i18n-certs";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/certs", `${name}.pem`), "utf8");
const derBase64 = (pem: string) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
const NOW = Date.UTC(2026, 11, 1);

test("a certificate's fields read as node:crypto reads them", () => {
  for (const name of ["self-signed", "private-ca", "ca-signed", "no-san"]) {
    const pem = fixture(name);
    const reference = new X509Certificate(pem);
    const details = parseCertificate(derBase64(pem));
    assert.equal(details.sha256, reference.fingerprint256.replace(/:/g, "").toLowerCase(), name);
    assert.equal(details.notBefore, Date.parse(reference.validFrom), name);
    assert.equal(details.notAfter, Date.parse(reference.validTo), name);
    assert.equal(details.selfSigned, reference.subject === reference.issuer, name);
    const san = reference.subjectAltName ?? "";
    assert.deepEqual(details.dnsNames, [...san.matchAll(/DNS:([^,]+)/g)].map((m) => m[1]), name);
    assert.deepEqual(details.ipAddresses, [...san.matchAll(/IP Address:([^,]+)/g)].map((m) => m[1]), name);
  }
  const self = parseCertificate(derBase64(fixture("self-signed")));
  assert.equal(self.subject, "CN=flowplan.example.lan, O=Home Lab");
  assert.equal(self.issuer, self.subject);
  assert.equal(self.commonName, "flowplan.example.lan");
  const leaf = parseCertificate(base64ToBytes(derBase64(fixture("ca-signed"))));
  assert.equal(leaf.subject, "CN=nas.home.arpa");
  assert.equal(leaf.issuer, "CN=Home Lab Root CA, OU=IT, O=Home Lab");
  assert.equal(leaf.selfSigned, false);
  // UTF8String names, a GeneralizedTime after 2049.
  const old = parseCertificate(derBase64(fixture("no-san")));
  assert.equal(old.subject, "CN=Ümlaut Server, C=DE");
  assert.equal(new Date(old.notAfter).getUTCFullYear(), 2052);
  assert.throws(() => parseCertificate("AAAA"));
  assert.throws(() => parseCertificate("not base64!"));
});

test("base64 and fingerprints", () => {
  assert.equal(toHex(base64ToBytes("3q2+7w==")), "deadbeef");
  assert.equal(toHex(base64ToBytes("3q2-7w")), "deadbeef");
  const hex = "8b".repeat(32);
  assert.equal(normalizeFingerprint("8B:".repeat(31) + "8B"), hex);
  assert.equal(normalizeFingerprint(` ${hex.toUpperCase()} `), hex);
  assert.equal(normalizeFingerprint("8b".repeat(31)), null);
  assert.equal(normalizeFingerprint("zz".repeat(32)), null);
  const shown = formatFingerprint(hex);
  assert.deepEqual(shown.split("\n"), ["8B:".repeat(15) + "8B", "8B:".repeat(15) + "8B"]);
  assert.equal(formatFingerprint(hex, 32).split("\n").length, 1);
  assert.equal(formatFingerprint("nope"), "");
  assert.equal(formatDay(Date.UTC(2026, 10, 13, 23, 0)), "2026-11-13");
  assert.equal(formatDay(NaN), "–");
});

test("only https addresses have a certificate to pin; hosts compare as the native side does", () => {
  assert.equal(pinnableHost("https://Flowplan.Example.LAN"), null, "not an origin as the profiles keep it");
  assert.equal(pinnableHost("https://flowplan.example.lan"), "flowplan.example.lan");
  assert.equal(pinnableHost("https://flowplan.example.lan:8443"), "flowplan.example.lan");
  assert.equal(pinnableHost("https://[fd00::1]"), "fd00::1");
  assert.equal(pinnableHost("http://192.168.1.20:3000"), null);
  assert.equal(pinnableHost("ftp://x"), null);
  assert.equal(normalizeHost(" NAS.lan. "), "nas.lan");
  assert.equal(normalizeHost("[::1]"), "::1");
});

const details = parseCertificate(derBase64(fixture("self-signed")));
const other = parseCertificate(derBase64(fixture("ca-signed")));
const ORIGIN = "https://flowplan.example.lan";
const pin = makePin(ORIGIN, details, NOW)!;

test("a pin accepts exactly its certificate on its host – never another host or certificate", () => {
  assert.equal(pin.host, "flowplan.example.lan");
  assert.equal(pin.sha256, details.sha256);
  assert.equal(makePin("http://flowplan.example.lan", details, NOW), null, "plain HTTP: nothing to pin");
  const pins = nativePins([pin]);
  assert.deepEqual(pins, [{ host: "flowplan.example.lan", sha256: details.sha256 }]);
  assert.equal(pinAllows(pins, "flowplan.example.lan", details.sha256), true);
  assert.equal(pinAllows(pins, "FLOWPLAN.example.lan.", formatFingerprint(details.sha256)), true);
  assert.equal(pinAllows(pins, "other.example.lan", details.sha256), false, "another host – even one the certificate names");
  assert.equal(pinAllows(pins, "flowplan.example.lan.evil.com", details.sha256), false);
  assert.equal(pinAllows(pins, "flowplan.example.lan", other.sha256), false, "another certificate");
  assert.equal(pinAllows(pins, "", details.sha256), false);
  assert.equal(pinAllows([], "flowplan.example.lan", details.sha256), false);
  assert.equal(pinAllows(pins, "flowplan.example.lan", "garbage"), false);
});

test("the verdict: the system first, then the pin of this instance", () => {
  const verdict = (input: Partial<Parameters<typeof certificateVerdict>[0]>) =>
    certificateVerdict({ origin: ORIGIN, details, systemTrusted: false, pins: [], ...input }).kind;
  assert.equal(verdict({ systemTrusted: true }), "trusted");
  // The system's chain check alone is not enough: the names must cover the host.
  assert.equal(verdict({ systemTrusted: true, origin: "https://nas.home.arpa" }), "ask");
  assert.equal(verdict({}), "ask");
  assert.equal(verdict({ pins: [pin] }), "pinned");
  assert.equal(verdict({ pins: [pin], details: other }), "changed");
  const changed = certificateVerdict({ origin: ORIGIN, details: other, systemTrusted: false, pins: [pin] });
  assert.equal(changed.kind === "changed" && changed.pin.sha256, details.sha256);
  // Another instance's pin never counts – also not one of the same certificate.
  const elsewhere = makePin("https://nas.home.arpa", details, NOW)!;
  assert.equal(verdict({ pins: [elsewhere] }), "ask");
  // A system-trusted certificate wins over an old pin (the instance got a real one).
  assert.equal(certificateVerdict({ origin: ORIGIN, details, systemTrusted: true, pins: [makePin(ORIGIN, other, NOW)!] }).kind, "trusted");
});

test("pins are kept per instance, checked when read and go with their profile", () => {
  const second = makePin("https://nas.home.arpa", other, NOW)!;
  let pins: CertificatePin[] = withPin([], pin);
  pins = withPin(pins, second);
  pins = withPin(pins, { ...pin, sha256: other.sha256 });
  assert.equal(pins.length, 2, "one pin per instance: trusting another certificate replaces it");
  assert.equal(pinFor(pins, ORIGIN)?.sha256, other.sha256);
  assert.deepEqual(parsePins(serializePins(pins)), pins);
  assert.deepEqual(withoutPin(pins, ORIGIN), [second]);
  assert.deepEqual(prunePins(pins, ["https://nas.home.arpa"]), [second]);
  assert.deepEqual(prunePins(pins, [], ORIGIN).map((p) => p.origin), [ORIGIN]);
  // Broken or foreign entries are dropped.
  assert.deepEqual(parsePins("nope"), []);
  assert.deepEqual(parsePins('{"a":1}'), []);
  assert.deepEqual(parsePins(null), []);
  const raw = JSON.stringify([
    { ...pin, origin: "http://flowplan.example.lan", host: "flowplan.example.lan" },
    { ...pin, host: "other.lan" },
    { ...pin, sha256: "xyz" },
    pin,
    { ...pin, subject: "dup" },
  ]);
  assert.deepEqual(parsePins(raw), [pin]);
  // The native side gets each host and fingerprint once.
  assert.equal(nativePins([pin, { ...pin, origin: `${ORIGIN}:8443` }]).length, 1);
});

test("names: subjectAltName with one wildcard label, the common name only without it", () => {
  assert.equal(namesCover(details, "flowplan.example.lan"), true);
  assert.equal(namesCover(details, "wiki.example.lan"), true);
  assert.equal(namesCover(details, "a.b.example.lan"), false);
  assert.equal(namesCover(details, "example.lan"), false);
  assert.equal(namesCover(details, "192.168.1.20"), true);
  assert.equal(namesCover(details, "192.168.1.21"), false);
  const noSan = { dnsNames: [], ipAddresses: [], commonName: "nas.lan" };
  assert.equal(namesCover(noSan, "nas.lan"), true);
  assert.equal(namesCover({ ...noSan, dnsNames: ["other.lan"] }, "nas.lan"), false);
});

test("what iOS refuses even for a trusted certificate is named", () => {
  assert.deepEqual(iosProblems(details, "flowplan.example.lan", NOW), []);
  const old = parseCertificate(derBase64(fixture("no-san")));
  assert.deepEqual(iosProblems(old, "nas.lan", NOW), ["noSubjectAltName", "tooLong"]);
  assert.deepEqual(iosProblems(details, "nas.home.arpa", NOW), ["otherName"]);
  assert.deepEqual(iosProblems(details, "flowplan.example.lan", Date.UTC(2030, 0, 1)), ["expired"]);
});

test("certificate errors of the web view are told apart from other failures", () => {
  assert.equal(isCertificateError("android", { code: 3, description: "SSL error: The certificate authority is not trusted" }), true);
  assert.equal(isCertificateError("android", { code: 2, description: "SSL error: Hostname mismatch" }), true);
  assert.equal(isCertificateError("android", { code: -2, description: "net::ERR_NAME_NOT_RESOLVED" }), false);
  assert.equal(isCertificateError("android", { code: 3, description: "Something else" }), false);
  assert.equal(isCertificateError("ios", { code: -1202 }), true);
  assert.equal(isCertificateError("ios", { code: -1009 }), false);
  assert.equal(isCertificateError("web", { code: -1202 }), false);
});

test("the dialog names host, subject, issuer, validity and fingerprint; only Android offers to trust", () => {
  const ask = certificateDialog({ kind: "ask", platform: "android", origin: ORIGIN, details, now: NOW, lang: "de" });
  assert.equal(ask.title, "Zertifikat nicht vertrauenswürdig");
  assert.equal(ask.trust, "Diesem Zertifikat vertrauen");
  assert.equal(ask.cancel, "Abbrechen");
  for (const part of ["flowplan.example.lan", "CN=flowplan.example.lan, O=Home Lab", formatFingerprint(details.sha256), formatDay(details.notBefore), formatDay(details.notAfter)])
    assert.ok(ask.message.includes(part), part);
  assert.ok(!ask.message.includes("Achtung"));
  // A certificate for another name, expired: said so.
  const wrong = certificateDialog({ kind: "ask", platform: "android", origin: "https://nas.lan", details, now: Date.UTC(2030, 0, 1), lang: "en" });
  assert.match(wrong.message, /not issued for nas\.lan/);
  assert.match(wrong.message, /expired/);
  // iOS: how to install and trust it, no button that pins.
  const ios = certificateDialog({ kind: "ask", platform: "ios", origin: "https://nas.lan", details: parseCertificate(derBase64(fixture("no-san"))), now: NOW, lang: "en" });
  assert.equal(ios.trust, null);
  assert.equal(ios.cancel, "OK");
  assert.match(ios.message, /Settings → General → VPN & Device Management/);
  assert.match(ios.message, /Settings → General → About → Certificate Trust Settings/);
  assert.match(ios.message, /Subject Alternative Name/);
  assert.match(ios.message, /825 days/);
  // A changed certificate: old and new fingerprint.
  const changed = certificateDialog({ kind: "changed", platform: "android", origin: ORIGIN, details: other, pin, now: NOW, lang: "fr" });
  assert.equal(changed.title, "Le certificat a changé");
  assert.equal(changed.trust, "Faire confiance au nouveau certificat");
  assert.ok(changed.message.includes(formatFingerprint(pin.sha256)));
  assert.ok(changed.message.includes(formatFingerprint(other.sha256)));
  assert.ok(changed.message.indexOf(formatFingerprint(pin.sha256)) < changed.message.indexOf(formatFingerprint(other.sha256)));
});

test("the certificate texts exist in every language with the same placeholders", () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const lang of ["en", "fr", "zh"] as const) {
    assert.deepEqual(Object.keys(certStrings[lang]).sort(), Object.keys(certStrings.de).sort(), lang);
    for (const [key, text] of Object.entries(certStrings.de))
      assert.deepEqual(placeholders(certStrings[lang][key as keyof typeof certStrings.de]), placeholders(text), `${lang}.${key}`);
  }
  // German: informal "du"; French: "tu".
  assert.match(certStrings.de.certTrustHint, /Vertraue ihm/);
  assert.match(certStrings.de.certIosHint, /installiere/);
  assert.doesNotMatch(Object.values(certStrings.de).join(" "), /\b(Sie|Ihnen|Ihr)\b/);
  assert.doesNotMatch(Object.values(certStrings.fr).join(" "), /\bvous\b/i);
  assert.equal(certStrings.de.certTrust, "Diesem Zertifikat vertrauen");
});
