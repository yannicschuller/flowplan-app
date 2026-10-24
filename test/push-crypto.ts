// The push relay's encryption (PROTOCOL.md §4) in node:crypto, for the
// tests: the decryption the Notification Service Extension (CryptoKit,
// modules/flowplan-push/ios/PushShared.swift) and the Android service (Tink
// and javax.crypto, PushCrypto.kt) do, step by step the same – checked
// against the relay's test vectors (test/fixtures/push-test-vectors.json) –
// and the instance's encryption, to make payloads.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomBytes, type KeyObject } from "node:crypto";
import { decodeBase64Url, encodeBase64Url, parseEnvelope } from "../src/push-relay";

const PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex");
const SPKI = Buffer.from("302a300506032b656e032100", "hex");

export const privateKeyOf = (raw: Uint8Array): KeyObject => createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(raw)]), format: "der", type: "pkcs8" });
export const publicKeyOf = (raw: Uint8Array): KeyObject => createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(raw)]), format: "der", type: "spki" });
export const rawPublic = (key: KeyObject) => new Uint8Array(createPublicKey(key).export({ format: "der", type: "spki" }).subarray(SPKI.length));
export const x25519 = (privateRaw: Uint8Array, publicRaw: Uint8Array) => new Uint8Array(diffieHellman({ privateKey: privateKeyOf(privateRaw), publicKey: publicKeyOf(publicRaw) }));

// info: HKDF info and AES-GCM additional data – "flowplan-push-v1\n" +
// instance since v1.1 (protocolInfo), "flowplan-push-v1" in v1's vectors.
export function deriveKey(shared: Uint8Array, ephemeralPublic: Uint8Array, devicePublic: Uint8Array, info: string) {
  return Buffer.from(hkdfSync("sha256", shared, Buffer.concat([ephemeralPublic, devicePublic]), Buffer.from(info, "utf8"), 32));
}

// What the extension does: null for every payload that does not verify.
export function openPayload(payload: string, devicePrivate: Uint8Array, info: string, aad = info): string | null {
  const envelope = parseEnvelope(payload);
  if (!envelope) return null;
  try {
    const shared = x25519(devicePrivate, envelope.ephemeral);
    if (shared.every((byte) => byte === 0)) return null;
    const key = deriveKey(shared, envelope.ephemeral, rawPublic(privateKeyOf(devicePrivate)), info);
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(envelope.sealed.subarray(envelope.sealed.length - 16));
    return Buffer.concat([decipher.update(envelope.sealed.subarray(0, envelope.sealed.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// What the instance does (ephemeral key and nonce given for fixed results).
export function sealPayload(plaintext: string, devicePublic: Uint8Array, info: string, options: { ephemeralPrivate?: Uint8Array; nonce?: Uint8Array; version?: number; aad?: string } = {}) {
  const ephemeralPrivate = options.ephemeralPrivate ?? new Uint8Array(randomBytes(32));
  const ephemeralPublic = rawPublic(privateKeyOf(ephemeralPrivate));
  const nonce = options.nonce ?? new Uint8Array(randomBytes(12));
  const key = deriveKey(x25519(ephemeralPrivate, devicePublic), ephemeralPublic, devicePublic, info);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(options.aad ?? info, "utf8"));
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return encodeBase64Url(new Uint8Array(Buffer.concat([Buffer.from([options.version ?? 1]), ephemeralPublic, nonce, sealed])));
}

export const fromBase64Url = (value: string) => {
  const bytes = decodeBase64Url(value);
  if (!bytes) throw new Error("not base64url");
  return bytes;
};
