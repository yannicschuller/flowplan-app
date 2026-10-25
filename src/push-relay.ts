// Push through the Flowplan push relay (flowplan-push, PROTOCOL.md v1 with
// the v1.1 amendments of its §6). The
// relay alone holds Flowplan's APNs key and Firebase credentials; every
// instance – also a self-hosted one – sends through it, end-to-end encrypted
// to a key pair of this installation and instance (X25519, kept in the
// keychain / Android Keystore, modules/flowplan-push). The relay, Apple and
// Google only ever see ciphertext; the Notification Service Extension (iOS)
// and the messaging service (Android) decrypt and show the notification.
//
// Pure functions – the checks the app applies to everything the relay and
// the instance answer, the payload's envelope and plaintext (mirrored in
// Swift, modules/flowplan-push/ios/PushShared.swift, and Kotlin,
// modules/flowplan-push/android/…/PushContent.kt), and when to register
// again. src/native/push.ts runs them with the network and the keychain.
import { originOf } from "./server";
import type { LiveActivityLabels } from "./activities";
import { safePath } from "./navigation";

export const DEFAULT_RELAY = "https://push.flowplan.org";
export const PROTOCOL_INFO = "flowplan-push-v1";
// HKDF info and AES-GCM additional data (PROTOCOL.md §6.9): bound to the
// instance, so a payload sealed for one instance never opens as another's.
export const protocolInfo = (instance: string) => `${PROTOCOL_INFO}\n${instance}`;
export const ENVELOPE_VERSION = 1;
// Decoded payload: version, ephemeral key, nonce, at least the tag.
export const MAX_PAYLOAD = 2800;
export const MIN_PAYLOAD = 1 + 32 + 12 + 16;
// The app registers again at least this often (the relay forgets a token
// after 180 days without use).
export const RENEW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// An older plaintext is not shown (PROTOCOL.md §6.9: 7 days; a replay).
export const MAX_AGE_S = 7 * 86_400;
export const MAX_SKEW_S = 86_400;
// Notification ids already shown are not shown again (the last 200).
export const SEEN_IDS = 200;
export function rememberShown(seen: readonly string[], id: string): { seen: string[]; again: boolean } {
  if (seen.includes(id)) return { seen: [...seen], again: true };
  return { seen: [...seen, id].slice(-SEEN_IDS), again: false };
}
// The extension tries at most this many keys (one per profile; normally only
// the active profile has one).
export const MAX_KEYS = 10;
export const LIMITS = { title: 200, body: 2000, id: 128, path: 2000, collapseId: 64, badge: 9999 } as const;

export type RelayPlatform = "ios" | "android" | "ios-liveactivity";
export type PushEnvironment = "production" | "sandbox";

// The relay's address: an origin only, over HTTPS (HTTP only for local
// development), no credentials, path or query.
const LOCAL = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"];
export function relayOrigin(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) return null;
  const local = LOCAL.includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url.origin;
}

// ---- What the instance and the relay answer ----

// GET {instance}/.well-known/flowplan-push: version 1 with at least one
// Ed25519 key means the instance sends through the relay.
export function supportsRelay(data: unknown): boolean {
  const value = data as { version?: unknown; keys?: unknown } | null;
  if (!value || typeof value !== "object" || value.version !== 1 || !Array.isArray(value.keys)) return false;
  return value.keys.some(
    (key: { id?: unknown; alg?: unknown; publicKey?: unknown } | null) =>
      !!key && typeof key.id === "string" && key.alg === "Ed25519" && typeof key.publicKey === "string" && isBase64Url(key.publicKey, 32),
  );
}

export type RelayRegistration = { relayToken: string; expiresAt: string };
const RELAY_TOKEN = /^[A-Za-z0-9_-]{22,256}$/;
export const isRelayToken = (value: unknown): value is string => typeof value === "string" && RELAY_TOKEN.test(value);

// 201 { relayToken, expiresAt } – an opaque base64url id of at least 128 bits
// and a date in the future; anything else is refused.
export function parseRegistration(data: unknown, now = Date.now()): RelayRegistration | null {
  const value = data as { relayToken?: unknown; expiresAt?: unknown } | null;
  if (!value || typeof value !== "object" || !isRelayToken(value.relayToken) || typeof value.expiresAt !== "string") return null;
  const expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(expires) || expires <= now) return null;
  return { relayToken: value.relayToken, expiresAt: new Date(expires).toISOString() };
}

// APNs tokens (also a Live Activity's) are hex, FCM tokens base64url-ish
// with ":" – never anything else goes to the relay.
export function isDeviceToken(platform: RelayPlatform, token: unknown): token is string {
  if (typeof token !== "string") return false;
  if (platform === "android") return /^[A-Za-z0-9_:.-]{20,4096}$/.test(token);
  return /^(?:[0-9a-fA-F]{2}){32,100}$/.test(token);
}

export const isPublicKey = (value: unknown): value is string => typeof value === "string" && isBase64Url(value, 32);

export type RelayDevice = {
  platform: RelayPlatform;
  token: string;
  environment?: PushEnvironment;
  bundleId: string;
  instance: string;
};

// The body of POST {relay}/v1/devices, checked before it leaves the phone.
export function registrationBody(device: RelayDevice): Record<string, string> {
  if (!isDeviceToken(device.platform, device.token)) throw new RelayError("invalid");
  const instance = originOf(device.instance);
  if (!instance || instance !== device.instance) throw new RelayError("invalid");
  if (!/^[A-Za-z0-9.-]{1,155}$/.test(device.bundleId)) throw new RelayError("invalid");
  const body: Record<string, string> = { platform: device.platform, token: device.token, bundleId: device.bundleId, instance };
  if (device.platform !== "android") body.environment = device.environment === "sandbox" ? "sandbox" : "production";
  return body;
}

// ---- Talking to them (the app passes fetch, the tests a fake) ----

export type HttpAnswer = { status: number; ok: boolean; url?: string; json(): Promise<unknown> };
export type Http = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<HttpAnswer>;

export class RelayError extends Error {
  code: "invalid" | "rejected" | "rate_limited" | "unreachable" | "answer";
  constructor(code: RelayError["code"], detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

const timeout = (ms: number) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

// Whether the instance sends through the relay: "yes", "no" (an older
// instance: 404, or not version 1), or "unknown" (not reachable now).
export async function instanceSupport(instance: string, http: Http): Promise<"yes" | "no" | "unknown"> {
  let answer: HttpAnswer;
  try {
    answer = await http(`${instance}/.well-known/flowplan-push`, { headers: { Accept: "application/json" }, signal: timeout(10_000) });
  } catch {
    return "unknown";
  }
  // Redirected to another site: not this instance's answer.
  if (answer.url && originOf(answer.url) !== instance) return "no";
  if (answer.status === 404 || answer.status === 410) return "no";
  if (!answer.ok) return "unknown";
  const data = await answer.json().catch(() => null);
  return supportsRelay(data) ? "yes" : "no";
}

export async function registerWithRelay(relay: string, device: RelayDevice, http: Http, now = Date.now()): Promise<RelayRegistration> {
  const body = registrationBody(device);
  let answer: HttpAnswer;
  try {
    answer = await http(`${relay}/v1/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: timeout(15_000),
    });
  } catch {
    throw new RelayError("unreachable");
  }
  if (answer.url && originOf(answer.url) !== relay) throw new RelayError("answer", "redirect");
  if (answer.status === 429) throw new RelayError("rate_limited");
  if (answer.status !== 201 && answer.status !== 200) throw new RelayError("rejected", String(answer.status));
  const registration = parseRegistration(await answer.json().catch(() => null), now);
  if (!registration) throw new RelayError("answer");
  return registration;
}

// DELETE {relay}/v1/devices/{relayToken}; true when the relay no longer
// knows it (204, or 404: already gone).
export async function unregisterFromRelay(relay: string, relayToken: string, http: Http): Promise<boolean> {
  if (!isRelayToken(relayToken)) return true;
  try {
    const answer = await http(`${relay}/v1/devices/${encodeURIComponent(relayToken)}`, { method: "DELETE", signal: timeout(10_000) });
    return answer.status === 204 || answer.status === 200 || answer.status === 404 || answer.status === 410;
  } catch {
    return false;
  }
}

// ---- What the app keeps per profile ----

// The device token itself is not kept, only its SHA-256 (to notice a new one).
export type PushRecord = {
  v: 1;
  relay: string;
  instance: string;
  platform: RelayPlatform;
  environment: PushEnvironment | null;
  tokenHash: string;
  relayToken: string;
  expiresAt: string;
  registeredAt: number;
  publicKey: string;
};

export function parseRecord(raw: string | null): PushRecord | null {
  if (!raw) return null;
  let value: Partial<PushRecord>;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || value.v !== 1) return null;
  if (!relayOrigin(value.relay) || originOf(value.instance) !== value.instance) return null;
  if (value.platform !== "ios" && value.platform !== "android" && value.platform !== "ios-liveactivity") return null;
  if (typeof value.tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(value.tokenHash)) return null;
  if (!isRelayToken(value.relayToken) || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return null;
  if (typeof value.registeredAt !== "number" || !Number.isFinite(value.registeredAt) || !isPublicKey(value.publicKey)) return null;
  return {
    v: 1,
    relay: value.relay as string,
    instance: value.instance as string,
    platform: value.platform,
    environment: value.environment === "sandbox" || value.environment === "production" ? value.environment : null,
    tokenHash: value.tokenHash,
    relayToken: value.relayToken,
    expiresAt: value.expiresAt,
    registeredAt: value.registeredAt,
    publicKey: value.publicKey as string,
  };
}

// Registered again: after 30 days, a new device token, another relay,
// instance, environment or key – or when the relay's token runs out.
export function needsRegistration(
  record: PushRecord | null,
  want: { relay: string; instance: string; tokenHash: string; publicKey: string; environment: PushEnvironment | null },
  now = Date.now(),
): boolean {
  if (!record) return true;
  if (record.relay !== want.relay || record.instance !== want.instance || record.tokenHash !== want.tokenHash) return true;
  if (record.publicKey !== want.publicKey || record.environment !== want.environment) return true;
  if (now - record.registeredAt >= RENEW_AFTER_MS || now < record.registeredAt) return true;
  return Date.parse(record.expiresAt) - now < 7 * 24 * 60 * 60 * 1000;
}

// Still good enough to hand to the instance when the relay cannot be
// reached right now.
export const recordUsable = (record: PushRecord | null, now = Date.now()) => !!record && Date.parse(record.expiresAt) > now;

// Live Activities: one relay token per running activity (kind → token) –
// the kinds whose state the instance changes and pushes itself (its
// LIVE_ACTIVITY_KINDS, lib/mobile-devices.ts in Flowplan: an unknown kind
// would make the instance refuse the whole registration).
export type LiveRecord = { relayToken: string; tokenHash: string; relay: string; instance: string; registeredAt: number };
export type LiveRecords = Record<string, LiveRecord>;
export const LIVE_KINDS = ["focus", "timer"] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];
export const isLiveKind = (value: unknown): value is LiveKind => typeof value === "string" && (LIVE_KINDS as readonly string[]).includes(value);

export function parseLiveRecords(raw: string | null): LiveRecords {
  if (!raw) return {};
  let value: Record<string, Partial<LiveRecord>>;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  const out: LiveRecords = {};
  if (!value || typeof value !== "object") return out;
  for (const kind of LIVE_KINDS) {
    const entry = value[kind];
    if (!entry || !isRelayToken(entry.relayToken) || typeof entry.tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(entry.tokenHash)) continue;
    if (!relayOrigin(entry.relay) || originOf(entry.instance) !== entry.instance || typeof entry.registeredAt !== "number") continue;
    out[kind] = { relayToken: entry.relayToken, tokenHash: entry.tokenHash, relay: entry.relay as string, instance: entry.instance as string, registeredAt: entry.registeredAt };
  }
  return out;
}

// What the instance gets: kind → relay token, for this instance only.
export function liveTokensFor(records: LiveRecords, instance: string, relay: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kind of LIVE_KINDS) {
    const entry = records[kind];
    if (entry && entry.instance === instance && entry.relay === relay) out[kind] = entry.relayToken;
  }
  return out;
}

// The instance's answer to the registration names the relay it sends
// through and the origin it signs as (pushRelay). Another relay than the
// app's (only the app's relay can reach this app) or another origin than the
// profile's: the relay registration is of no use there.
// null: the instance does not send through the relay at all (push or the
// relay switched off there); undefined: an older instance that says nothing.
export function relayMismatch(answer: unknown, relay: string, instance: string): boolean {
  if (answer === null) return true;
  if (!answer || typeof answer !== "object") return false;
  const value = answer as { url?: unknown; instance?: unknown };
  return relayOrigin(value.url) !== relay || originOf(typeof value.instance === "string" ? value.instance : null) !== instance;
}

// The relay allows 120 registrations per address and hour: Live Activities
// take at most this many of them.
export const LIVE_REGISTRATIONS_PER_HOUR = 8;
export function allowLiveRegistration(history: number[], now = Date.now()): boolean {
  return history.filter((at) => now - at < 60 * 60 * 1000 && at <= now).length < LIVE_REGISTRATIONS_PER_HOUR;
}

// ---- The payload ----

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Strict base64url without padding; null for anything else.
export function decodeBase64Url(value: string): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((value.length * 3) / 4));
  let bits = 0,
    buffer = 0,
    at = 0;
  for (const char of value) {
    buffer = (buffer << 6) | B64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (buffer >> bits) & 0xff;
    }
  }
  // Leftover bits must be zero (one encoding per value).
  if (bits && buffer & ((1 << bits) - 1)) return null;
  return out.subarray(0, at);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let out = "",
    bits = 0,
    buffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64[(buffer >> bits) & 63];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) out += B64[(buffer << (6 - bits)) & 63];
  return out;
}

function isBase64Url(value: string, length: number) {
  const bytes = decodeBase64Url(value);
  return !!bytes && bytes.length === length;
}

export type Envelope = { ephemeral: Uint8Array; nonce: Uint8Array; sealed: Uint8Array };

// base64url( 0x01 || e.public (32) || nonce (12) || ciphertext || tag (16) )
export function parseEnvelope(payload: unknown): Envelope | null {
  if (typeof payload !== "string" || payload.length > Math.ceil((MAX_PAYLOAD * 4) / 3)) return null;
  const bytes = decodeBase64Url(payload);
  if (!bytes || bytes.length < MIN_PAYLOAD || bytes.length > MAX_PAYLOAD || bytes[0] !== ENVELOPE_VERSION) return null;
  return { ephemeral: bytes.slice(1, 33), nonce: bytes.slice(33, 45), sealed: bytes.slice(45) };
}

// The categories (and with them the buttons) the app knows; the protocol's
// short names and the instance's ids (src/notification-buttons.ts).
const CATEGORY_IDS: Record<string, string> = {
  task: "flowplan.task",
  comment: "flowplan.comment",
  read: "flowplan.read",
  "flowplan.task": "flowplan.task",
  "flowplan.comment": "flowplan.comment",
  "flowplan.read": "flowplan.read",
};
export function categoryId(value: unknown): string | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_IDS, value) ? CATEGORY_IDS[value] : null;
}

// A link of the notification: a path, or an address on the instance's own
// origin (made a path). Anything else is dropped.
export function notificationPath(url: unknown, instance: string): string | null {
  if (typeof url !== "string" || !url || url.length > LIMITS.path) return null;
  if (url.startsWith("/")) return safePath(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || originOf(parsed.href) !== instance) return null;
  return safePath(`${parsed.pathname || "/"}${parsed.search}${parsed.hash}`);
}

// The notification's id: any text of 1–128 characters without control
// characters (it travels as JSON only, never in a path).
const ID = /^[^\u0000-\u001f\u007f\u2028\u2029]{1,128}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g;
const clean = (value: string, max: number) => value.replace(CONTROL, "").trim().slice(0, max);

export type PushMessage = {
  title: string;
  body: string;
  path: string | null;
  id: string;
  category: string | null;
  data: Record<string, unknown> | null;
  sentAt: number;
};

// The decrypted plaintext: { title, body, url, id, category, data, sentAt }.
// null for anything that does not fit (the placeholder stays).
export function parsePlaintext(text: string, instance: string, nowSeconds = Date.now() / 1000): PushMessage | null {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.title !== "string" || typeof value.body !== "string" || typeof value.id !== "string" || !ID.test(value.id)) return null;
  if (typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt)) return null;
  if (value.sentAt > nowSeconds + MAX_SKEW_S || value.sentAt < nowSeconds - MAX_AGE_S) return null;
  if (value.url !== null && value.url !== undefined && typeof value.url !== "string") return null;
  if (value.category !== null && value.category !== undefined && typeof value.category !== "string") return null;
  const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? (value.data as Record<string, unknown>) : null;
  return {
    title: clean(value.title, LIMITS.title) || "Flowplan",
    body: clean(value.body, LIMITS.body),
    path: notificationPath(value.url, instance),
    id: value.id,
    category: categoryId(value.category),
    data,
    sentAt: value.sentAt,
  };
}

// What the notification carries for the app (expo-notifications' `data`,
// iOS userInfo["body"]): the same fields as Expo's pushes had (url,
// notificationId) – so taps (notifications.ts) and buttons
// (notification-buttons.ts, NotificationActions.swift) work unchanged – plus
// the instance it came from.
export function notificationData(message: PushMessage, instance: string): Record<string, unknown> {
  return {
    ...(message.data ?? {}),
    ...(message.path ? { url: message.path } : {}),
    notificationId: message.id,
    origin: instance,
    ...(message.category ? { category: message.category } : {}),
  };
}

// Android: the relay's collapseId and badge travel outside the encryption;
// only what fits is used.
export const collapseTag = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null);
export const badgeCount = (value: unknown) => {
  const n = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n >= 0 && n <= LIMITS.badge ? n : null;
};

// ---- The registration, step by step (native/push.ts hands in the phone) ----

export type PushFields = {
  pushToken: string | null;
  relayToken?: string;
  relayUrl?: string;
  publicKey?: string;
  liveActivityRelayTokens?: Record<string, string>;
  // The texts of the Live Activity views, with the tokens (activities.ts).
  liveActivityLabels?: LiveActivityLabels;
};

export type RegistrationDeps = {
  relay: string;
  bundleId: string;
  http: Http;
  now: () => number;
  permission: () => Promise<boolean>;
  support: (instance: string) => Promise<"yes" | "no" | "unknown">;
  keysAvailable: () => boolean;
  publicKey: (profile: string, instance: string) => Promise<string | null>;
  deviceToken: () => Promise<{ platform: "ios" | "android"; token: string } | null>;
  environment: () => PushEnvironment;
  sha256: (value: string) => Promise<string>;
  expoToken: () => Promise<string | null>;
  record: (profile: string) => PushRecord | null;
  setRecord: (profile: string, record: PushRecord | null) => void;
  live: (profile: string) => LiveRecords;
  setLive: (profile: string, records: LiveRecords) => void;
  deleteKey: (profile: string) => void;
  isActive: (profile: string) => boolean;
  liveLabels?: () => LiveActivityLabels | null;
};

function fieldsOf(record: PushRecord, live: LiveRecords, labels: LiveActivityLabels | null): Omit<PushFields, "pushToken"> {
  const tokens = liveTokensFor(live, record.instance, record.relay);
  return {
    relayToken: record.relayToken,
    relayUrl: record.relay,
    publicKey: record.publicKey,
    ...(Object.keys(tokens).length ? { liveActivityRelayTokens: tokens, ...(labels ? { liveActivityLabels: labels } : {}) } : {}),
  };
}

// What the registration with the instance gets for a profile. create:
// whether a new registration with the relay may be made – only once the
// instance has confirmed the sign-in (the app registers at every start, also
// signed out, and the relay limits registrations per address); pending: it
// would have been made, register again after the instance's answer.
export async function registrationFields(
  profile: { id: string; server: string },
  options: { create: boolean },
  deps: RegistrationDeps,
): Promise<PushFields & { pending: boolean }> {
  const record = deps.record(profile.id);
  const none = { pushToken: null, pending: false };
  if (!(await deps.permission())) {
    if (record) void leaveRelay(profile.id, deps);
    return none;
  }
  const support = await deps.support(profile.server);
  if (support === "no") {
    // An older instance: Expo's push service, if the build has a project.
    if (record) void leaveRelay(profile.id, deps);
    return { pushToken: await deps.expoToken(), pending: false };
  }
  if (!deps.keysAvailable()) return none;
  const publicKey = await deps.publicKey(profile.id, profile.server);
  if (!isPublicKey(publicKey)) return none;
  const now = deps.now();
  const reusable = () =>
    record && record.instance === profile.server && record.relay === deps.relay && record.publicKey === publicKey && recordUsable(record, now)
      ? { pushToken: null, pending: false, ...fieldsOf(record, deps.live(profile.id), deps.liveLabels?.() ?? null) }
      : none;
  const device = await deps.deviceToken();
  if (!device || !isDeviceToken(device.platform, device.token)) return reusable();
  const tokenHash = await deps.sha256(device.token);
  const environment = device.platform === "ios" ? deps.environment() : null;
  if (record && !needsRegistration(record, { relay: deps.relay, instance: profile.server, tokenHash, publicKey, environment }, now))
    return { pushToken: null, pending: false, ...fieldsOf(record, deps.live(profile.id), deps.liveLabels?.() ?? null) };
  if (!record && (support !== "yes" || !options.create)) return { ...none, pending: support === "yes" };
  let registration: RelayRegistration;
  try {
    registration = await registerWithRelay(
      deps.relay,
      { platform: device.platform, token: device.token, environment: environment ?? undefined, bundleId: deps.bundleId, instance: profile.server },
      deps.http,
      now,
    );
  } catch {
    // Not reachable or refused: the last registration while it lasts,
    // otherwise no push for now – never a way around the relay.
    return reusable();
  }
  // The registration with another relay or address goes there.
  if (record && (record.relay !== deps.relay || record.instance !== profile.server)) void unregisterFromRelay(record.relay, record.relayToken, deps.http);
  // Left meanwhile (another profile, signed out): not kept.
  if (!deps.isActive(profile.id)) {
    void unregisterFromRelay(deps.relay, registration.relayToken, deps.http);
    return none;
  }
  const next: PushRecord = {
    v: 1,
    relay: deps.relay,
    instance: profile.server,
    platform: device.platform,
    environment,
    tokenHash,
    relayToken: registration.relayToken,
    expiresAt: registration.expiresAt,
    registeredAt: now,
    publicKey,
  };
  deps.setRecord(profile.id, next);
  return { pushToken: null, pending: false, ...fieldsOf(next, deps.live(profile.id), deps.liveLabels?.() ?? null) };
}

// Leaves the relay for a profile: its relay tokens (device and Live
// Activities) are deleted there, its key on the phone. Read and cleared
// before anything is awaited, so the caller may forget the profile's keys
// right after.
export async function leaveRelay(profile: string, deps: Pick<RegistrationDeps, "record" | "setRecord" | "live" | "setLive" | "deleteKey" | "http">) {
  const record = deps.record(profile);
  const live = deps.live(profile);
  deps.setRecord(profile, null);
  deps.setLive(profile, {});
  deps.deleteKey(profile);
  await Promise.allSettled([
    record ? unregisterFromRelay(record.relay, record.relayToken, deps.http) : Promise.resolve(true),
    ...Object.values(live).map((entry) => unregisterFromRelay(entry.relay, entry.relayToken, deps.http)),
  ]);
}

// POST {instance}/api/mobile/live-activity with the device token: a Live
// Activity's relay token right after it started (null: it ended), without a
// whole new registration. "missing": the instance has no such endpoint
// (register again instead).
export async function sendLiveToken(
  instance: string,
  deviceToken: string,
  body: { kind: LiveKind; relayToken: string | null; relayUrl: string; labels?: LiveActivityLabels },
  http: Http,
): Promise<"ok" | "refused" | "missing" | "failed"> {
  if (!isLiveKind(body.kind) || (body.relayToken !== null && !isRelayToken(body.relayToken))) return "refused";
  try {
    const answer = await http(`${instance}/api/mobile/live-activity`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deviceToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: timeout(10_000),
    });
    if (answer.status === 404 || answer.status === 405) return "missing";
    if (!answer.ok) return "failed";
    const data = (await answer.json().catch(() => null)) as { ok?: unknown } | null;
    return data?.ok === true ? "ok" : "refused";
  } catch {
    return "failed";
  }
}
