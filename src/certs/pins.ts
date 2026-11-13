// Certificates the person trusted for an instance (yannicschuller/flowplan#271,
// for the app): a self-hosted instance with a self-signed certificate or one
// of a private CA that this device does not trust.
//
// 1. What the system trusts works as it is: iOS honours a CA installed and
//    fully trusted in Settings; on Android the app trusts CAs the person
//    installed as well (plugins/with-network-security.js).
// 2. Otherwise, on Android, the person can trust exactly the certificate the
//    instance presents, after seeing its fingerprint (src/certs/review.ts):
//    it is pinned for that host – the web view (PinnedWebViewClient.kt) and
//    the app's own requests (CertificatePins.kt) accept it there and nowhere
//    else; a different certificate on that host is refused and asked about
//    again. Never "ignore certificate errors", never another host, nothing
//    changes for plain HTTP (src/server.ts → plainHttpAllowed).
//
// iOS has no pinning in the app: see src/certs/review.ts for why.
//
// Kept per instance address (the profile's server, profiles.ts) under one
// key of its own (store.ts → certificatePins): pins of profiles that are gone
// are dropped (prunePins). Pure functions.
import type { CertificateDetails } from "./x509";

export type CertificatePin = {
  // The profile's address (https only) and its host name.
  origin: string;
  host: string;
  // SHA-256 of the certificate's DER, lower-case hex.
  sha256: string;
  subject: string;
  issuer: string;
  notBefore: number;
  notAfter: number;
  // When the person trusted it (ms).
  pinnedAt: number;
};

export const CERTIFICATE_PINS_KEY = "flowplan.certificatePins";
const MAX_PINS = 40;
const FINGERPRINT = /^[0-9a-f]{64}$/;

// "AB:CD:…", "ab cd …" or "abcd…" → "abcd…"; null for anything that is not
// a SHA-256 fingerprint.
export function normalizeFingerprint(value: unknown): string | null {
  const hex = String(value ?? "")
    .toLowerCase()
    .replace(/[\s:]/g, "");
  return FINGERPRINT.test(hex) ? hex : null;
}

// How fingerprints are shown: upper-case byte pairs with colons, in lines of
// `perLine` bytes (16: two lines for SHA-256, as browsers show it).
export function formatFingerprint(value: string, perLine = 16): string {
  const hex = normalizeFingerprint(value);
  if (!hex) return "";
  const pairs = hex.toUpperCase().match(/../g) ?? [];
  const lines: string[] = [];
  for (let i = 0; i < pairs.length; i += perLine) lines.push(pairs.slice(i, i + perLine).join(":"));
  return lines.join("\n");
}

// A host as the native side compares it: lower case, no brackets around
// IPv6, no trailing dot.
export function normalizeHost(host: string | null | undefined): string {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
}

// The host of an https origin; null for plain HTTP and anything else – there
// is no certificate to pin.
export function pinnableHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
    return normalizeHost(url.hostname) || null;
  } catch {
    return null;
  }
}

export function makePin(origin: string, details: CertificateDetails, at: number): CertificatePin | null {
  const host = pinnableHost(origin);
  const sha256 = normalizeFingerprint(details.sha256);
  if (!host || !sha256) return null;
  return {
    origin,
    host,
    sha256,
    subject: String(details.subject || "").slice(0, 300),
    issuer: String(details.issuer || "").slice(0, 300),
    notBefore: Number(details.notBefore) || 0,
    notAfter: Number(details.notAfter) || 0,
    pinnedAt: at,
  };
}

// What the keychain holds, checked again.
export function parsePins(raw: string | null): CertificatePin[] {
  let list: unknown;
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const pins: CertificatePin[] = [];
  for (const entry of list as Partial<CertificatePin>[]) {
    if (!entry || typeof entry !== "object" || typeof entry.origin !== "string") continue;
    const host = pinnableHost(entry.origin);
    const sha256 = normalizeFingerprint(entry.sha256);
    if (!host || !sha256 || host !== entry.host || pins.some((pin) => pin.origin === entry.origin)) continue;
    pins.push({
      origin: entry.origin,
      host,
      sha256,
      subject: String(entry.subject ?? "").slice(0, 300),
      issuer: String(entry.issuer ?? "").slice(0, 300),
      notBefore: Number(entry.notBefore) || 0,
      notAfter: Number(entry.notAfter) || 0,
      pinnedAt: Number(entry.pinnedAt) || 0,
    });
    if (pins.length >= MAX_PINS) break;
  }
  return pins;
}
export const serializePins = (pins: CertificatePin[]) => JSON.stringify(pins);

export const pinFor = (pins: CertificatePin[], origin: string) => pins.find((pin) => pin.origin === origin) ?? null;

// One pin per instance: trusting another certificate replaces the one before.
export function withPin(pins: CertificatePin[], pin: CertificatePin): CertificatePin[] {
  return [...pins.filter((entry) => entry.origin !== pin.origin), pin].slice(-MAX_PINS);
}
export const withoutPin = (pins: CertificatePin[], origin: string) => pins.filter((pin) => pin.origin !== origin);

// Only pins of the profiles there are (a removed profile, an address that
// changed: its pin goes along). `keep`: an address being added right now.
export function prunePins(pins: CertificatePin[], servers: string[], keep: string | null = null): CertificatePin[] {
  const wanted = new Set(servers);
  if (keep) wanted.add(keep);
  return pins.filter((pin) => wanted.has(pin.origin));
}

// What the native side gets: host and fingerprint, nothing else.
export type NativePin = { host: string; sha256: string };
export function nativePins(pins: CertificatePin[]): NativePin[] {
  const seen = new Set<string>();
  const out: NativePin[] = [];
  for (const pin of pins) {
    const key = `${pin.host} ${pin.sha256}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ host: pin.host, sha256: pin.sha256 });
  }
  return out;
}

// The rule the native side applies to a certificate it would otherwise
// refuse (CertificatePins.kt → matches, the same in Kotlin): accepted only
// when the host it was presented for is a pinned host and the certificate is
// exactly the pinned one. A pin of another host never counts.
export function pinAllows(pins: NativePin[], host: string, fingerprint: string): boolean {
  const name = normalizeHost(host);
  const sha256 = normalizeFingerprint(fingerprint);
  if (!name || !sha256) return false;
  return pins.some((pin) => normalizeHost(pin.host) === name && pin.sha256 === sha256);
}

// Whether a certificate's names cover a host (RFC 6125: subjectAltName,
// one wildcard label at the left; the common name only without any
// subjectAltName). Shown in the dialog – the system checks it itself.
export function namesCover(details: Pick<CertificateDetails, "dnsNames" | "ipAddresses" | "commonName">, host: string): boolean {
  const name = normalizeHost(host);
  if (!name) return false;
  if (/^[\d.]+$/.test(name) || name.includes(":")) return details.ipAddresses.includes(name);
  const matches = (pattern: string) => {
    const value = normalizeHost(pattern);
    if (value === name) return true;
    if (!value.startsWith("*.")) return false;
    const rest = value.slice(1);
    return name.endsWith(rest) && !name.slice(0, -rest.length).includes(".") && name.length > rest.length;
  };
  const names = details.dnsNames.length || details.ipAddresses.length ? details.dnsNames : details.commonName ? [details.commonName] : [];
  return names.some(matches);
}

// What happens with the certificate an instance presented:
// - "trusted": the system trusts it for that host – nothing to ask;
// - "pinned": it is the one the person trusted for this instance;
// - "changed": the person trusted another one here – refused, asked again
//   with both fingerprints;
// - "ask": not trusted, nothing pinned – the person may trust it (Android)
//   or is told how to install it (iOS).
export type CertificateVerdict = { kind: "trusted" } | { kind: "pinned"; pin: CertificatePin } | { kind: "changed"; pin: CertificatePin } | { kind: "ask" };

export function certificateVerdict(input: { origin: string; details: CertificateDetails; systemTrusted: boolean; pins: CertificatePin[] }): CertificateVerdict {
  const host = pinnableHost(input.origin);
  if (input.systemTrusted && host && namesCover(input.details, host)) return { kind: "trusted" };
  const pin = pinFor(input.pins, input.origin);
  if (pin && host && pin.host === host) {
    return pinAllows([pin], host, input.details.sha256) ? { kind: "pinned", pin } : { kind: "changed", pin };
  }
  return { kind: "ask" };
}

// What iOS refuses even for a certificate the person trusts (Apple's
// requirements for TLS server certificates since iOS 13): its names only
// count in subjectAltName, and it may be valid for at most 825 days.
export type IosProblem = "noSubjectAltName" | "otherName" | "tooLong" | "expired";
const DAY = 86_400_000;
export function iosProblems(details: CertificateDetails, host: string, now: number): IosProblem[] {
  const problems: IosProblem[] = [];
  if (!details.dnsNames.length && !details.ipAddresses.length) problems.push("noSubjectAltName");
  else if (!namesCover({ ...details, commonName: "" }, host)) problems.push("otherName");
  if (Number.isFinite(details.notAfter) && Number.isFinite(details.notBefore) && details.notAfter - details.notBefore > 825 * DAY)
    problems.push("tooLong");
  if (Number.isFinite(details.notAfter) && details.notAfter < now) problems.push("expired");
  return problems;
}

// Android's web view reports certificate errors to onError with the
// SslError's primary error (0–5) and "SSL error: …"; iOS with the
// NSURLError codes of an untrusted, expired, not yet valid or unknown-root
// certificate.
const IOS_CERT_CODES = new Set([-1202, -1201, -1203, -1204, -1200]);
export function isCertificateError(platform: string, event: { code?: number; description?: string }): boolean {
  const code = Number(event?.code);
  if (platform === "android") return code >= 0 && code <= 5 && /^SSL error/i.test(String(event?.description ?? ""));
  if (platform === "ios") return IOS_CERT_CODES.has(code);
  return false;
}

// Dates in the dialog: 2026-11-13 – the same in every language, no doubt
// about day and month.
export function formatDay(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "–";
  return new Date(ms).toISOString().slice(0, 10);
}
