// What the trust dialog shows of a server's certificate (src/certs/review.ts):
// subject, issuer, validity, the names it is for and its SHA-256
// fingerprint, read from the DER the native module hands over
// (modules/flowplan-native: the leaf of the chain the server presented).
// Neither iOS nor Android offer this from public API on both platforms, so
// the app reads the few fields itself – only to show them: whether the
// certificate is trusted is decided by the system (or by the pinned
// fingerprint, src/certs/pins.ts), never by this parser. Pure.
import { sha256Bytes } from "../sha256-js";

export type CertificateDetails = {
  // SHA-256 of the DER, lower-case hex (64 characters).
  sha256: string;
  // "CN=flowplan.example.lan, O=Home Lab" – the fields people recognise.
  subject: string;
  issuer: string;
  // Milliseconds since 1970 (NaN when the certificate had none readable).
  notBefore: number;
  notAfter: number;
  // subjectAltName: DNS names and IP addresses.
  dnsNames: string[];
  ipAddresses: string[];
  // The subject's common name, for certificates without subjectAltName.
  commonName: string;
  selfSigned: boolean;
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(value: string): Uint8Array {
  const clean = String(value || "").replace(/[\s=]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const out: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (const char of clean) {
    const index = B64.indexOf(char);
    if (index < 0) throw new Error("invalid base64");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

type Tlv = { tag: number; start: number; end: number };

function tlv(bytes: Uint8Array, offset: number, limit = bytes.length): Tlv {
  if (offset + 2 > limit) throw new Error("truncated");
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || start + count > limit) throw new Error("bad length");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[start + i];
    start += count;
  }
  const end = start + length;
  if (end > limit) throw new Error("truncated");
  return { tag, start, end };
}

function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const list: Tlv[] = [];
  for (let offset = parent.start; offset < parent.end; ) {
    const child = tlv(bytes, offset, parent.end);
    list.push(child);
    offset = child.end;
  }
  return list;
}

function oid(bytes: Uint8Array, node: Tlv): string {
  const parts: number[] = [];
  let value = 0;
  for (let i = node.start; i < node.end; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (!parts.length) parts.push(value < 80 ? Math.floor(value / 40) : 2, value < 80 ? value % 40 : value - 80);
      else parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function utf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code = b;
    let extra = 0;
    if (b >= 0xf0) (code = b & 0x07), (extra = 3);
    else if (b >= 0xe0) (code = b & 0x0f), (extra = 2);
    else if (b >= 0xc0) (code = b & 0x1f), (extra = 1);
    i++;
    for (let k = 0; k < extra && i < bytes.length; k++, i++) code = (code << 6) | (bytes[i] & 0x3f);
    out += String.fromCodePoint(code);
  }
  return out;
}

function text(bytes: Uint8Array, node: Tlv): string {
  const raw = bytes.subarray(node.start, node.end);
  // BMPString: UTF-16 big endian.
  if (node.tag === 0x1e) {
    let out = "";
    for (let i = 0; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw[i] << 8) | raw[i + 1]);
    return out;
  }
  // UTF8String; Printable, IA5, T61 and Visible strings are (in practice) ASCII.
  return utf8(raw);
}

// The fields of a Name that people recognise, most specific first.
const NAME_FIELDS: [string, string][] = [
  ["2.5.4.3", "CN"],
  ["2.5.4.11", "OU"],
  ["2.5.4.10", "O"],
  ["2.5.4.7", "L"],
  ["2.5.4.8", "ST"],
  ["2.5.4.6", "C"],
];

function name(bytes: Uint8Array, node: Tlv): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const set of children(bytes, node))
    for (const pair of children(bytes, set)) {
      const [type, value] = children(bytes, pair);
      if (!type || !value) continue;
      (fields[oid(bytes, type)] ??= []).push(text(bytes, value));
    }
  return fields;
}

const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim();

export function describeName(fields: Record<string, string[]>): string {
  const parts: string[] = [];
  for (const [id, label] of NAME_FIELDS) for (const value of fields[id] ?? []) parts.push(`${label}=${clean(value)}`);
  return parts.join(", ").slice(0, 300);
}

function time(bytes: Uint8Array, node: Tlv): number {
  const value = text(bytes, node);
  // UTCTime YYMMDDHHMM[SS]Z (years 1950–2049), GeneralizedTime YYYYMMDDHHMM[SS]Z.
  const match = node.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(value) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(value);
  if (!match) return NaN;
  let year = Number(match[1]);
  if (node.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
}

function ip(raw: Uint8Array): string {
  if (raw.length === 4) return Array.from(raw).join(".");
  if (raw.length !== 16) return "";
  const words: number[] = [];
  for (let i = 0; i < 16; i += 2) words.push((raw[i] << 8) | raw[i + 1]);
  // The compressed form the URL parser writes ("fd00::1"): the longest run
  // of at least two zero words becomes "::".
  let best = -1;
  let bestLength = 1;
  for (let i = 0; i < 8; ) {
    let j = i;
    while (j < 8 && words[j] === 0) j++;
    if (j - i > bestLength) (best = i), (bestLength = j - i);
    i = j > i ? j : i + 1;
  }
  const hex = words.map((word) => word.toString(16));
  if (best < 0) return hex.join(":");
  return `${hex.slice(0, best).join(":")}::${hex.slice(best + bestLength).join(":")}`;
}

function subjectAltNames(bytes: Uint8Array, extensions: Tlv | undefined) {
  const dnsNames: string[] = [];
  const ipAddresses: string[] = [];
  if (!extensions) return { dnsNames, ipAddresses };
  const [list] = children(bytes, extensions);
  if (!list) return { dnsNames, ipAddresses };
  for (const extension of children(bytes, list)) {
    const parts = children(bytes, extension);
    if (!parts.length || oid(bytes, parts[0]) !== "2.5.29.17") continue;
    const octets = parts[parts.length - 1];
    const sequence = tlv(bytes, octets.start, octets.end);
    for (const general of children(bytes, sequence)) {
      if (general.tag === 0x82) dnsNames.push(clean(text(bytes, general)).toLowerCase());
      else if (general.tag === 0x87) {
        const address = ip(bytes.subarray(general.start, general.end));
        if (address) ipAddresses.push(address);
      }
    }
  }
  return { dnsNames: dnsNames.slice(0, 50), ipAddresses: ipAddresses.slice(0, 50) };
}

// The details of a certificate (DER bytes or base64); throws on anything
// that is not one.
export function parseCertificate(input: Uint8Array | string): CertificateDetails {
  const bytes = typeof input === "string" ? base64ToBytes(input) : input;
  const certificate = tlv(bytes, 0);
  if (certificate.tag !== 0x30) throw new Error("not a certificate");
  const [tbs] = children(bytes, certificate);
  if (!tbs || tbs.tag !== 0x30) throw new Error("not a certificate");
  const fields = children(bytes, tbs);
  // [0] version is optional (v1 certificates have none).
  const rest = fields[0]?.tag === 0xa0 ? fields.slice(1) : fields;
  const [, , issuerNode, validityNode, subjectNode] = rest;
  if (!issuerNode || !validityNode || !subjectNode) throw new Error("not a certificate");
  const [from, to] = children(bytes, validityNode);
  const issuerFields = name(bytes, issuerNode);
  const subjectFields = name(bytes, subjectNode);
  const extensions = rest.find((node) => node.tag === 0xa3);
  const der = bytes.subarray(0, certificate.end);
  const issuerRaw = toHex(bytes.subarray(issuerNode.start, issuerNode.end));
  const subjectRaw = toHex(bytes.subarray(subjectNode.start, subjectNode.end));
  return {
    sha256: toHex(sha256Bytes(der)),
    subject: describeName(subjectFields),
    issuer: describeName(issuerFields),
    notBefore: from ? time(bytes, from) : NaN,
    notAfter: to ? time(bytes, to) : NaN,
    ...subjectAltNames(bytes, extensions),
    commonName: clean(subjectFields["2.5.4.3"]?.[0] ?? "").toLowerCase(),
    selfSigned: issuerRaw === subjectRaw,
  };
}
