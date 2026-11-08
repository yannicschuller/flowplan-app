// Push through the Flowplan push relay (src/push-relay.ts, src/native/push.ts,
// modules/flowplan-push, plugins/with-notification-service.js,
// plugins/with-push-android.js): the encryption against the relay's test
// vectors, the checks of everything the relay and the instance answer, the
// registration with a fake network, and how the native parts are wired.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import config from "../app.config";
import {
  allowLiveRegistration,
  badgeCount,
  categoryId,
  collapseTag,
  decodeBase64Url,
  DEFAULT_RELAY,
  encodeBase64Url,
  instanceSupport,
  isDeviceToken,
  leaveRelay,
  liveTokensFor,
  LIVE_REGISTRATIONS_PER_HOUR,
  MAX_KEYS,
  MAX_PAYLOAD,
  needsRegistration,
  notificationData,
  notificationPath,
  parseEnvelope,
  parseLiveRecords,
  parsePlaintext,
  parseRecord,
  parseRegistration,
  PROTOCOL_INFO,
  protocolInfo,
  rememberShown,
  SEEN_IDS,
  registrationBody,
  relayMismatch,
  sendLiveToken,
  LIVE_KINDS,
  registrationFields,
  registerWithRelay,
  relayOrigin,
  RENEW_AFTER_MS,
  supportsRelay,
  unregisterFromRelay,
  type Http,
  type LiveRecords,
  type PushRecord,
  type RegistrationDeps,
} from "../src/push-relay";
import { buttonRequest, CATEGORIES, categoryButtons } from "../src/notification-buttons";
import { focusActivity, liveActivityLabels } from "../src/activities";
import { timerProps } from "../src/summary";
import { t } from "../src/i18n";
import { PROFILE_KEYS } from "../src/profiles";
import { deriveKey, fromBase64Url, openPayload, privateKeyOf, rawPublic, sealPayload, x25519 } from "./push-crypto";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const INSTANCE = "https://flowplan.example.com";
const RELAY = "https://push.example.org";
const hex = (value: string) => new Uint8Array(Buffer.from(value, "hex"));
const now = Date.UTC(2026, 9, 24, 12);
const INFO = protocolInfo(INSTANCE);
const plain = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ title: "Ben commented", body: "Looks good", url: "/#page=p1", id: "n1", category: "comment", data: null, sentAt: now / 1000, ...fields });

// ---- Encryption ----

test("X25519 as RFC 7748 §6.1 has it (the primitive the port builds on)", () => {
  const alice = hex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
  const bob = hex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
  assert.equal(Buffer.from(rawPublic(privateKeyOf(alice))).toString("hex"), "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
  const bobPublic = rawPublic(privateKeyOf(bob));
  assert.equal(Buffer.from(bobPublic).toString("hex"), "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
  assert.equal(Buffer.from(x25519(alice, bobPublic)).toString("hex"), "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742");
});

test("a payload opens with its device's key and its instance only; anything changed does not open", () => {
  const device = new Uint8Array(randomBytes(32));
  const other = new Uint8Array(randomBytes(32));
  const devicePublic = rawPublic(privateKeyOf(device));
  assert.equal(INFO, "flowplan-push-v1\nhttps://flowplan.example.com");
  const payload = sealPayload(plain(), devicePublic, INFO);
  assert.equal(openPayload(payload, device, INFO), plain());
  assert.equal(openPayload(payload, other, INFO), null);
  // Bound to the instance (PROTOCOL.md §6.9): not another's, not v1's unbound info.
  assert.equal(openPayload(payload, device, protocolInfo("https://other.example")), null);
  assert.equal(openPayload(payload, device, PROTOCOL_INFO), null);
  assert.equal(openPayload(payload, device, INFO, PROTOCOL_INFO), null, "info and additional data both bound");
  const bytes = fromBase64Url(payload);
  for (const at of [0, 1, 20, 33, 40, 45, bytes.length - 1]) {
    const changed = bytes.slice();
    changed[at] ^= 0x01;
    assert.equal(openPayload(encodeBase64Url(changed), device, INFO), null, `byte ${at}`);
  }
  // Another version, other additional data, cut short, too long.
  assert.equal(openPayload(sealPayload(plain(), devicePublic, INFO, { version: 2 }), device, INFO), null);
  assert.equal(openPayload(sealPayload(plain(), devicePublic, INFO, { aad: "flowplan-push-v2" }), device, INFO), null);
  assert.equal(openPayload(encodeBase64Url(bytes.slice(0, 60)), device, INFO), null);
  assert.equal(openPayload(sealPayload("x".repeat(MAX_PAYLOAD), devicePublic, INFO), device, INFO), null);
  // A low-order ephemeral key (all zero) never gives a key.
  const zero = new Uint8Array(bytes.length);
  zero.set(bytes);
  zero.fill(0, 1, 33);
  assert.equal(openPayload(encodeBase64Url(zero), device, INFO), null);
});

// The relay's vectors (flowplan-push/docs/test-vectors.json), mirrored here.
const VECTORS = join(root, "test/fixtures/push-test-vectors.json");
type Vector = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const hexOf = (value: Uint8Array | Buffer) => Buffer.from(value).toString("hex");

test("the relay's test vectors open as the instance sealed them, step by step", { skip: !existsSync(VECTORS) && "no test/fixtures/push-test-vectors.json" }, () => {
  const data = JSON.parse(readFileSync(VECTORS, "utf8")) as { e2e: { vectors: Vector[]; invalid?: Vector[] } };
  const { vectors, invalid = [] } = data.e2e;
  assert.ok(vectors.length > 0);
  for (const vector of vectors) {
    const name = String(vector.name);
    const device = fromBase64Url(String(vector.devicePrivateKey));
    // v1.1: info and additional data are "flowplan-push-v1\n" + instance.
    const info = text(vector.hkdfInfo) ?? protocolInfo(String(vector.instance));
    const aad = text(vector.aad) ?? info;
    if (typeof vector.instance === "string") {
      assert.equal(info, protocolInfo(vector.instance), name);
      assert.equal(aad, info, name);
    }
    const devicePublic = rawPublic(privateKeyOf(device));
    assert.deepEqual(devicePublic, fromBase64Url(String(vector.devicePublicKey)), name);
    const ephemeralPublic = fromBase64Url(String(vector.ephemeralPublicKey));
    assert.deepEqual(rawPublic(privateKeyOf(fromBase64Url(String(vector.ephemeralPrivateKey)))), ephemeralPublic, name);
    const shared = x25519(device, ephemeralPublic);
    assert.equal(hexOf(shared), vector.sharedSecretHex, name);
    assert.equal(hexOf(Buffer.concat([ephemeralPublic, devicePublic])), vector.hkdfSaltHex, name);
    assert.equal(hexOf(deriveKey(shared, ephemeralPublic, devicePublic, info)), vector.keyHex, name);
    const envelope = parseEnvelope(vector.payload)!;
    assert.ok(envelope, name);
    assert.equal(hexOf(envelope.nonce), vector.nonceHex, name);
    assert.equal(hexOf(envelope.sealed), vector.ciphertextAndTagHex, name);
    assert.equal(openPayload(String(vector.payload), device, info, aad), vector.plaintext, name);
    // With the instance in it, the same payload never opens unbound.
    if (info !== PROTOCOL_INFO) assert.equal(openPayload(String(vector.payload), device, PROTOCOL_INFO), null, name);
    if (typeof vector.instance === "string") {
      const message = parsePlaintext(String(vector.plaintext), vector.instance, Number(JSON.parse(String(vector.plaintext)).sentAt));
      assert.ok(message, `${name}: the plaintext checks out`);
    }
  }
  for (const vector of invalid) {
    const info = text(vector.hkdfInfo) ?? (typeof vector.instance === "string" ? protocolInfo(vector.instance) : text(vectors[0].hkdfInfo) ?? INFO);
    assert.equal(openPayload(String(vector.payload), fromBase64Url(String(vector.devicePrivateKey)), info, text(vector.aad) ?? info), null, String(vector.name));
  }
});

test("envelope and base64url are strict", () => {
  assert.equal(decodeBase64Url("a+b/"), null);
  assert.equal(decodeBase64Url("YQ=="), null);
  assert.equal(decodeBase64Url("YR"), null, "non-zero leftover bits");
  assert.deepEqual(decodeBase64Url("YQ"), new Uint8Array([0x61]));
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(randomBytes(n));
    assert.deepEqual(decodeBase64Url(encodeBase64Url(bytes)), bytes);
    assert.equal(encodeBase64Url(bytes), Buffer.from(bytes).toString("base64url"));
  }
  const device = rawPublic(privateKeyOf(new Uint8Array(randomBytes(32))));
  const envelope = parseEnvelope(sealPayload("{}", device, INFO));
  assert.ok(envelope);
  assert.equal(envelope!.ephemeral.length, 32);
  assert.equal(envelope!.nonce.length, 12);
  assert.equal(envelope!.sealed.length, 2 + 16);
  assert.equal(parseEnvelope(sealPayload("{}", device, INFO, { version: 0 })), null);
  assert.equal(parseEnvelope(42), null);
  assert.equal(parseEnvelope("A".repeat(5000)), null);
});

// ---- The plaintext ----

test("the plaintext is checked: links on the instance only, known categories, fresh", () => {
  const message = parsePlaintext(plain(), INSTANCE, now / 1000)!;
  assert.deepEqual(message, { title: "Ben commented", body: "Looks good", path: "/#page=p1", id: "n1", category: "flowplan.comment", data: null, sentAt: now / 1000 });
  assert.equal(parsePlaintext(plain({ url: `${INSTANCE}/#page=p2` }), INSTANCE, now / 1000)!.path, "/#page=p2");
  assert.equal(parsePlaintext(plain({ url: "https://flowplan.example.com:443/x?y=1#z" }), INSTANCE, now / 1000)!.path, "/x?y=1#z");
  for (const url of ["https://evil.example/#page=p1", "//evil.example/x", "javascript:alert(1)", "http://flowplan.example.com/x", "https://user@flowplan.example.com/x", "/a b", "/a\\b"])
    assert.equal(parsePlaintext(plain({ url }), INSTANCE, now / 1000)!.path, null, url);
  assert.equal(parsePlaintext(plain({ url: null }), INSTANCE, now / 1000)!.path, null);
  assert.equal(notificationPath("https://FLOWPLAN.example.com/#inbox", INSTANCE), "/#inbox");
  assert.equal(notificationPath("https://flowplan.example.com.evil.example/#inbox", INSTANCE), null);
  assert.equal(parsePlaintext(plain({ category: "task" }), INSTANCE, now / 1000)!.category, CATEGORIES.task);
  assert.equal(parsePlaintext(plain({ category: "flowplan.read" }), INSTANCE, now / 1000)!.category, CATEGORIES.read);
  assert.equal(parsePlaintext(plain({ category: "default" }), INSTANCE, now / 1000)!.category, null);
  assert.equal(parsePlaintext(plain({ category: "constructor" }), INSTANCE, now / 1000)!.category, null);
  assert.equal(parsePlaintext(plain({ title: "  \u0007 " }), INSTANCE, now / 1000)!.title, "Flowplan");
  assert.equal(parsePlaintext(plain({ body: "a\u0000b c\nd" }), INSTANCE, now / 1000)!.body, "abc\nd");
  assert.equal(parsePlaintext(plain({ body: "x".repeat(5000) }), INSTANCE, now / 1000)!.body.length, 2000);
  assert.deepEqual(parsePlaintext(plain({ data: { kind: "mention" } }), INSTANCE, now / 1000)!.data, { kind: "mention" });
  // Refused: wrong types, ids, too old (a replay) or from the future.
  for (const fields of [{ id: "" }, { id: "a\u0000b" }, { id: "x".repeat(129) }, { id: 5 }, { title: 1 }, { body: null }, { url: 5 }, { category: 1 }, { sentAt: "now" }, { sentAt: now / 1000 - 8 * 86400 }, { sentAt: now / 1000 + 2 * 86400 }])
    assert.equal(parsePlaintext(plain(fields), INSTANCE, now / 1000), null, JSON.stringify(fields));
  assert.equal(parsePlaintext("[]", INSTANCE, now / 1000), null);
  assert.equal(parsePlaintext("not json", INSTANCE, now / 1000), null);
});

test("notification ids already shown are not shown again (the last 200)", () => {
  let seen: string[] = [];
  for (let i = 0; i < SEEN_IDS + 5; i++) seen = rememberShown(seen, `n${i}`).seen;
  assert.equal(seen.length, SEEN_IDS);
  assert.equal(rememberShown(seen, "n10").again, true);
  assert.equal(rememberShown(seen, "n0").again, false, "the oldest are forgotten");
  assert.ok(parsePlaintext(plain({ sentAt: now / 1000 - 6 * 86400 }), INSTANCE, now / 1000));
});

test("the notification's data works for taps and buttons as before", () => {
  const message = parsePlaintext(plain({ category: "task", data: { url: "/#evil", notificationId: "spoofed", kind: "due" } }), INSTANCE, now / 1000)!;
  const data = notificationData(message, INSTANCE);
  assert.deepEqual(data, { kind: "due", url: "/#page=p1", notificationId: "n1", origin: INSTANCE, category: "flowplan.task" });
  // Android: expo-notifications hands it over as content.data; the button
  // finds the id there.
  const response = { actionIdentifier: "fp.done", notification: { request: { identifier: "x", content: { data } } } };
  assert.deepEqual(buttonRequest(response, "2026-10-24"), { action: "done", notificationId: "n1" });
  assert.equal(collapseTag("task-42"), "task-42");
  assert.equal(collapseTag("x".repeat(65)), null);
  assert.equal(collapseTag("a b"), null);
  assert.equal(badgeCount("12"), 12);
  assert.equal(badgeCount("-1"), null);
  assert.equal(badgeCount("10000"), null);
  assert.equal(categoryId("comment"), "flowplan.comment");
});

// ---- Relay and instance ----

test("relay addresses: an https origin only", () => {
  assert.equal(relayOrigin(DEFAULT_RELAY), "https://push.flowplan.org");
  assert.equal(relayOrigin("https://push.example.org/"), RELAY);
  assert.equal(relayOrigin("http://localhost:8787"), "http://localhost:8787");
  for (const value of ["http://push.example.org", "https://push.example.org/v1", "https://a@push.example.org", "https://push.example.org?x", "ftp://x", "", null])
    assert.equal(relayOrigin(value), null, String(value));
  assert.equal(config.extra?.pushRelay, DEFAULT_RELAY);
});

test("what the relay answers is checked", () => {
  const token = "a".repeat(22);
  assert.deepEqual(parseRegistration({ relayToken: token, expiresAt: "2027-04-22T12:00:00.000Z" }, now), { relayToken: token, expiresAt: "2027-04-22T12:00:00.000Z" });
  assert.equal(parseRegistration({ relayToken: "short", expiresAt: "2027-04-22T12:00:00Z" }, now), null);
  assert.equal(parseRegistration({ relayToken: `${token}/..`, expiresAt: "2027-04-22T12:00:00Z" }, now), null);
  assert.equal(parseRegistration({ relayToken: token, expiresAt: "2020-01-01T00:00:00Z" }, now), null);
  assert.equal(parseRegistration({ relayToken: token }, now), null);
  assert.ok(supportsRelay({ version: 1, keys: [{ id: "k1", alg: "Ed25519", publicKey: encodeBase64Url(new Uint8Array(32)) }] }));
  assert.ok(!supportsRelay({ version: 2, keys: [{ id: "k1", alg: "Ed25519", publicKey: encodeBase64Url(new Uint8Array(32)) }] }));
  assert.ok(!supportsRelay({ version: 1, keys: [] }));
  assert.ok(!supportsRelay({ version: 1, keys: [{ id: "k1", alg: "RS256", publicKey: "x" }] }));
  assert.ok(isDeviceToken("ios", "ab".repeat(32)));
  assert.ok(!isDeviceToken("ios", "ab".repeat(31) + "zz"));
  assert.ok(isDeviceToken("android", "fGx3:APA91b" + "x".repeat(140)));
  assert.ok(!isDeviceToken("android", "token with spaces and more than twenty"));
  assert.throws(() => registrationBody({ platform: "ios", token: "nothex", bundleId: "app.flowplan.mobile", instance: INSTANCE }));
  assert.throws(() => registrationBody({ platform: "ios", token: "ab".repeat(32), bundleId: "app.flowplan.mobile", instance: `${INSTANCE}/path` }));
  assert.deepEqual(registrationBody({ platform: "android", token: "f".repeat(40), environment: "sandbox", bundleId: "app.flowplan.mobile", instance: INSTANCE }), {
    platform: "android",
    token: "f".repeat(40),
    bundleId: "app.flowplan.mobile",
    instance: INSTANCE,
  });
});

type Call = { url: string; method: string; body: unknown };
function fakeNetwork(answers: Record<string, (call: Call) => { status: number; body?: unknown; url?: string } | Error>) {
  const calls: Call[] = [];
  const http: Http = async (url, init) => {
    const call = { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const key = Object.keys(answers).find((pattern) => `${call.method} ${url}`.startsWith(pattern));
    const answer = key ? answers[key](call) : { status: 404 };
    if (answer instanceof Error) throw answer;
    return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, url: answer.url ?? url, json: async () => answer.body };
  };
  return { http, calls };
}

const WELL_KNOWN = { version: 1, keys: [{ id: "k1", alg: "Ed25519", publicKey: encodeBase64Url(new Uint8Array(32).fill(7)) }] };

test("the instance's support: version 1 yes, 404 no, a redirect elsewhere no, offline unknown", async () => {
  const yes = fakeNetwork({ [`GET ${INSTANCE}/.well-known/flowplan-push`]: () => ({ status: 200, body: WELL_KNOWN }) });
  assert.equal(await instanceSupport(INSTANCE, yes.http), "yes");
  assert.equal(await instanceSupport(INSTANCE, fakeNetwork({}).http), "no");
  assert.equal(await instanceSupport(INSTANCE, fakeNetwork({ GET: () => ({ status: 200, body: WELL_KNOWN, url: "https://evil.example/.well-known/flowplan-push" }) }).http), "no");
  assert.equal(await instanceSupport(INSTANCE, fakeNetwork({ GET: () => ({ status: 200, body: { version: 1 } }) }).http), "no");
  assert.equal(await instanceSupport(INSTANCE, fakeNetwork({ GET: () => new Error("offline") }).http), "unknown");
  assert.equal(await instanceSupport(INSTANCE, fakeNetwork({ GET: () => ({ status: 503 }) }).http), "unknown");
});

test("relay registration and deletion: the request, and answers that are refused", async () => {
  const token = "R".repeat(43);
  const net = fakeNetwork({ [`POST ${RELAY}/v1/devices`]: () => ({ status: 201, body: { relayToken: token, expiresAt: "2027-04-22T12:00:00Z" } }), DELETE: () => ({ status: 204 }) });
  const device = { platform: "ios" as const, token: "ab".repeat(32), environment: "sandbox" as const, bundleId: "app.flowplan.mobile", instance: INSTANCE };
  assert.deepEqual(await registerWithRelay(RELAY, device, net.http, now), { relayToken: token, expiresAt: "2027-04-22T12:00:00.000Z" });
  assert.deepEqual(net.calls[0].body, { platform: "ios", token: "ab".repeat(32), environment: "sandbox", bundleId: "app.flowplan.mobile", instance: INSTANCE });
  assert.ok(await unregisterFromRelay(RELAY, token, net.http));
  assert.equal(net.calls[1].url, `${RELAY}/v1/devices/${token}`);
  assert.equal(net.calls[1].method, "DELETE");
  // A token that is not one is never put into a path.
  assert.ok(await unregisterFromRelay(RELAY, "../../admin", net.http));
  assert.equal(net.calls.length, 2);
  await assert.rejects(registerWithRelay(RELAY, device, fakeNetwork({ POST: () => ({ status: 201, body: { relayToken: "x" } }) }).http, now));
  await assert.rejects(registerWithRelay(RELAY, device, fakeNetwork({ POST: () => ({ status: 429 }) }).http, now), /rate_limited/);
  await assert.rejects(registerWithRelay(RELAY, device, fakeNetwork({ POST: () => ({ status: 201, body: { relayToken: token, expiresAt: "2027-04-22T12:00:00Z" }, url: "https://evil.example/v1/devices" }) }).http, now));
});

// The phone, faked: keychain records in a Map, a key, a device token.
function fakePhone(overrides: Partial<RegistrationDeps> = {}) {
  const records = new Map<string, PushRecord | null>();
  const live = new Map<string, LiveRecords>();
  const deleted: string[] = [];
  let relayCounter = 0;
  const net = fakeNetwork({
    [`GET ${INSTANCE}/.well-known/flowplan-push`]: () => ({ status: 200, body: WELL_KNOWN }),
    [`POST ${RELAY}/v1/devices`]: () => ({ status: 201, body: { relayToken: `relay${++relayCounter}`.padEnd(30, "x"), expiresAt: "2027-04-22T12:00:00Z" } }),
    DELETE: () => ({ status: 204 }),
  });
  const state = { clock: now, token: "ab".repeat(32), active: "p1" };
  const deps: RegistrationDeps = {
    relay: RELAY,
    bundleId: "app.flowplan.mobile",
    http: net.http,
    now: () => state.clock,
    permission: async () => true,
    support: (origin) => instanceSupport(origin, net.http),
    keysAvailable: () => true,
    publicKey: async () => encodeBase64Url(new Uint8Array(32).fill(9)),
    deviceToken: async () => ({ platform: "ios", token: state.token }),
    environment: () => "production",
    sha256: async (value) => Buffer.from(value.padEnd(64, "0").slice(0, 64)).toString("hex").slice(0, 64),
    expoToken: async () => "ExponentPushToken[abcdefghijklmnop]",
    record: (id) => records.get(id) ?? null,
    setRecord: (id, record) => void records.set(id, record),
    live: (id) => live.get(id) ?? {},
    setLive: (id, value) => void live.set(id, value),
    deleteKey: (id) => void deleted.push(id),
    isActive: (id) => id === state.active,
    ...overrides,
  };
  return { deps, net, records, live, deleted, state };
}
const profile = { id: "p1", server: INSTANCE };
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST");

test("registration: waits for the sign-in, registers once, hands the instance relay token and key", async () => {
  const phone = fakePhone();
  // Not signed in for sure yet (first start): nothing at the relay.
  const first = await registrationFields(profile, { create: false }, phone.deps);
  assert.deepEqual(first, { pushToken: null, pending: true });
  assert.equal(posts(phone.net.calls).length, 0);
  const fields = await registrationFields(profile, { create: true }, phone.deps);
  assert.equal(fields.pending, false);
  assert.equal(fields.pushToken, null, "never the Expo token next to the relay");
  assert.equal(fields.relayUrl, RELAY);
  assert.equal(fields.publicKey, encodeBase64Url(new Uint8Array(32).fill(9)));
  assert.match(fields.relayToken!, /^relay1/);
  assert.deepEqual(posts(phone.net.calls)[0].body, { platform: "ios", token: "ab".repeat(32), environment: "production", bundleId: "app.flowplan.mobile", instance: INSTANCE });
  const record = phone.records.get("p1")!;
  assert.equal(JSON.stringify(record).includes("ab".repeat(32)), false, "the device token is not kept");
  assert.deepEqual(parseRecord(JSON.stringify(record)), record);
  // The next start: the same registration, no request to the relay.
  const again = await registrationFields(profile, { create: true }, phone.deps);
  assert.equal(again.relayToken, fields.relayToken);
  assert.equal(posts(phone.net.calls).length, 1);
  // A new device token, then 30 days later: registered again.
  phone.state.token = "cd".repeat(32);
  assert.match((await registrationFields(profile, { create: true }, phone.deps)).relayToken!, /^relay2/);
  phone.state.clock += RENEW_AFTER_MS;
  assert.match((await registrationFields(profile, { create: true }, phone.deps)).relayToken!, /^relay3/);
});

test("registration: older instances get the Expo token; no permission, no push; the relay down keeps the last", async () => {
  const old = fakePhone({ support: async () => "no" });
  assert.deepEqual(await registrationFields(profile, { create: true }, old.deps), { pushToken: "ExponentPushToken[abcdefghijklmnop]", pending: false });
  assert.equal(posts(old.net.calls).length, 0);

  const phone = fakePhone();
  const registered = await registrationFields(profile, { create: true }, phone.deps);
  // The relay is not reachable: the last registration while it lasts.
  const down = { ...phone.deps, http: fakeNetwork({ GET: () => ({ status: 200, body: WELL_KNOWN }), POST: () => new Error("offline") }).http };
  phone.state.token = "ef".repeat(32);
  assert.equal((await registrationFields(profile, { create: true }, down)).relayToken, registered.relayToken);
  // Without a registration: no push – and no Expo token either.
  const fresh = fakePhone();
  assert.deepEqual(await registrationFields(profile, { create: true }, { ...fresh.deps, http: down.http }), { pushToken: null, pending: false });
  // Push switched off in the system: the relay registration goes.
  const denied = { ...phone.deps, permission: async () => false };
  assert.deepEqual(await registrationFields(profile, { create: true }, denied), { pushToken: null, pending: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(phone.records.get("p1"), null);
  assert.deepEqual(phone.deleted, ["p1"]);
  assert.ok(phone.net.calls.some((c) => c.method === "DELETE" && c.url.endsWith(registered.relayToken!)));
});

test("registration: no key, no push; a profile left meanwhile keeps nothing", async () => {
  const noKey = fakePhone({ publicKey: async () => null });
  assert.deepEqual(await registrationFields(profile, { create: true }, noKey.deps), { pushToken: null, pending: false });
  const badKey = fakePhone({ publicKey: async () => "not a key" });
  assert.deepEqual(await registrationFields(profile, { create: true }, badKey.deps), { pushToken: null, pending: false });
  const switched = fakePhone({ isActive: () => false });
  assert.deepEqual(await registrationFields(profile, { create: true }, switched.deps), { pushToken: null, pending: false });
  assert.equal(switched.records.get("p1"), undefined);
  assert.ok(switched.net.calls.some((c) => c.method === "DELETE"));
});

test("leaving: the relay tokens of the device and the Live Activities are deleted, the key too", async () => {
  const phone = fakePhone();
  const fields = await registrationFields(profile, { create: true }, phone.deps);
  phone.live.set("p1", { timer: { relayToken: "L".repeat(30), tokenHash: "0".repeat(64), relay: RELAY, instance: INSTANCE, registeredAt: now } });
  assert.deepEqual((await registrationFields(profile, { create: true }, phone.deps)).liveActivityRelayTokens, { timer: "L".repeat(30) });
  const leaving = leaveRelay("p1", phone.deps);
  // Cleared at once, before the network answers.
  assert.equal(phone.records.get("p1"), null);
  assert.deepEqual(phone.live.get("p1"), {});
  await leaving;
  const deletes = phone.net.calls.filter((c) => c.method === "DELETE").map((c) => c.url);
  assert.deepEqual(deletes.sort(), [`${RELAY}/v1/devices/${fields.relayToken}`, `${RELAY}/v1/devices/${"L".repeat(30)}`].sort());
  assert.deepEqual(phone.deleted, ["p1"]);
  assert.ok(PROFILE_KEYS.includes("push") && PROFILE_KEYS.includes("livePush"), "forgetting a profile clears them");
});

test("records and Live Activity tokens are checked when read; at most 8 activity registrations an hour", () => {
  const record: PushRecord = {
    v: 1,
    relay: RELAY,
    instance: INSTANCE,
    platform: "ios",
    environment: "production",
    tokenHash: "a".repeat(64),
    relayToken: "r".repeat(30),
    expiresAt: "2027-04-22T12:00:00.000Z",
    registeredAt: now,
    publicKey: encodeBase64Url(new Uint8Array(32)),
  };
  assert.deepEqual(parseRecord(JSON.stringify(record)), record);
  assert.equal(parseRecord(JSON.stringify({ ...record, relay: "http://evil.example" })), null);
  assert.equal(parseRecord(JSON.stringify({ ...record, relayToken: "x" })), null);
  assert.equal(parseRecord("{"), null);
  const want = { relay: RELAY, instance: INSTANCE, tokenHash: "a".repeat(64), publicKey: record.publicKey, environment: "production" as const };
  assert.equal(needsRegistration(record, want, now + 1000), false);
  assert.equal(needsRegistration(record, { ...want, environment: "sandbox" }, now), true);
  assert.equal(needsRegistration(record, { ...want, instance: "https://other.example" }, now), true);
  assert.equal(needsRegistration(record, want, now - 1000), true, "a clock set back");
  const live = parseLiveRecords(JSON.stringify({ focus: { relayToken: "f".repeat(30), tokenHash: "b".repeat(64), relay: RELAY, instance: INSTANCE, registeredAt: now }, recording: { relayToken: "x".repeat(30) }, other: 1 }));
  assert.deepEqual(Object.keys(live), ["focus"]);
  assert.deepEqual(liveTokensFor(live, INSTANCE, RELAY), { focus: "f".repeat(30) });
  assert.deepEqual(liveTokensFor(live, "https://other.example", RELAY), {});
  const history = Array.from({ length: LIVE_REGISTRATIONS_PER_HOUR }, (_, i) => now - i * 60_000);
  assert.equal(allowLiveRegistration(history, now), false);
  assert.equal(allowLiveRegistration(history, now + 61 * 60_000), true);
});

test("the instance's answer: another relay or origin makes the relay registration useless", () => {
  assert.equal(relayMismatch({ version: 1, url: RELAY, instance: INSTANCE }, RELAY, INSTANCE), false);
  assert.equal(relayMismatch(undefined, RELAY, INSTANCE), false, "older instances say nothing");
  // The instance answers null: it does not push through the relay (push or the relay off there).
  assert.equal(relayMismatch(null, RELAY, INSTANCE), true);
  assert.equal(relayMismatch({ version: 1, url: "https://relay.other.example", instance: INSTANCE }, RELAY, INSTANCE), true);
  assert.equal(relayMismatch({ version: 1, url: RELAY, instance: "https://www.flowplan.example.com" }, RELAY, INSTANCE), true);
});

test("a Live Activity's relay token goes to the instance with the device token; only its kinds", async () => {
  // The instance's LIVE_ACTIVITY_KINDS (a strict schema there).
  assert.deepEqual([...LIVE_KINDS], ["focus", "timer"]);
  const net = fakeNetwork({ [`POST ${INSTANCE}/api/mobile/live-activity`]: () => ({ status: 200, body: { ok: true, liveActivities: ["timer"] } }) });
  const token = "T".repeat(30);
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "timer", relayToken: token, relayUrl: RELAY }, net.http), "ok");
  assert.deepEqual(net.calls[0].body, { kind: "timer", relayToken: token, relayUrl: RELAY });
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "focus", relayToken: null, relayUrl: RELAY }, net.http), "ok");
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "meeting" as "focus", relayToken: token, relayUrl: RELAY }, net.http), "refused");
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "timer", relayToken: "bad", relayUrl: RELAY }, net.http), "refused");
  assert.equal(net.calls.length, 2);
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "timer", relayToken: token, relayUrl: RELAY }, fakeNetwork({}).http), "missing");
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "timer", relayToken: token, relayUrl: RELAY }, fakeNetwork({ POST: () => ({ status: 200, body: { ok: false } }) }).http), "refused");
});

// ---- Native wiring ----

const swift = read("modules/flowplan-push/ios/PushShared.swift");
const kotlin = readdirSync(join(root, "modules/flowplan-push/android/src/main/java/app/flowplan/push"))
  .map((file) => read(`modules/flowplan-push/android/src/main/java/app/flowplan/push/${file}`))
  .join("\n");

test("Swift and Kotlin decrypt with the same constants and rules as the app", () => {
  for (const source of [swift, kotlin]) {
    assert.ok(source.includes(`"${PROTOCOL_INFO}"`));
    assert.match(source, new RegExp(`maxPayload = ${MAX_PAYLOAD}|MAX_PAYLOAD = ${MAX_PAYLOAD}`));
    assert.match(source, new RegExp(`maxKeys = ${MAX_KEYS}|MAX_KEYS = ${MAX_KEYS}`));
    assert.match(source, new RegExp(`seenIds = ${SEEN_IDS}|SEEN_IDS = ${SEEN_IDS}`));
    assert.match(source, /1 \+ 32 \+ 12 \+ 16/);
    assert.match(source, /7 \* 86_400|7L \* 86_400L/);
    // Every category the app has buttons for, under both names.
    for (const [short, id] of Object.entries(CATEGORIES)) assert.ok(source.includes(`"${short}"`) && source.includes(`"${id}"`), `${short} → ${id}`);
  }
  // CryptoKit: X25519, HKDF-SHA256 with ephemeral ‖ device public as salt, AES-GCM with the info as AAD.
  assert.match(swift, /sharedSecretFromKeyAgreement\(with: peer\)/);
  assert.match(swift, /salt\.append\(ephemeral\)\s+salt\.append\(key\.publicKey\.rawRepresentation\)/);
  // Info and additional data: "flowplan-push-v1\n" + the key's own instance.
  assert.match(swift, /static func info\(_ instance: String\) -> Data \{ Data\("\\\(protocolName\)\\n\\\(instance\)"\.utf8\) \}/);
  assert.match(swift, /let info = FPPush\.info\(instance\)/);
  assert.match(swift, /hkdfDerivedSymmetricKey\(using: SHA256\.self, salt: salt, sharedInfo: info, outputByteCount: 32\)/);
  assert.match(swift, /AES\.GCM\.open\(box, using: symmetric, authenticating: info\)/);
  assert.match(swift, /open\(payload, with: key\.privateKey, instance: key\.origin\)/);
  assert.match(read("plugins/notification-service/NotificationService.swift"), /FPPushSeen\.again\(message\.id, origin: message\.origin\)/);
  // Keys: this device only, after the first unlock, in the App Group, never synced.
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(swift, /kSecAttrSynchronizable as String\] = false/);
  assert.match(swift, /kSecAttrAccessGroup as String: group/);
  // Tink X25519 and HKDF, platform AES-GCM, a Keystore key for the private keys.
  assert.match(kotlin, /X25519\.computeSharedSecret\(privateKey, ephemeral\)/);
  assert.match(kotlin, /fun info\(instance: String\): ByteArray = "\$PROTOCOL\\n\$instance"/);
  assert.match(kotlin, /Hkdf\.computeHkdf\("HMACSHA256", secret, ephemeral \+ publicKey\(privateKey\), bound, 32\)/);
  assert.match(kotlin, /cipher\.updateAAD\(bound\)/);
  assert.match(kotlin, /PushCrypto\.open\(payload, entry\.privateKey, entry\.origin\)/);
  assert.match(kotlin, /original\.data\["type"\] == "background"/);
  assert.match(kotlin, /PushKeys\.shownBefore\(context, opened\.origin, message\.id\)/);
  assert.match(kotlin, /"AndroidKeyStore"/);
  // Nothing logs a token, a key or a payload: only statuses and exception class names.
  for (const line of swift.split("\n").filter((l) => l.includes("os_log("))) assert.doesNotMatch(line, /%@|%\{public\}/, line);
  for (const line of kotlin.split("\n").filter((l) => /Log\.[dewiv]\(/.test(l))) assert.match(line, /javaClass\.simpleName/, line);
  for (const file of ["src/native/push.ts", "src/native/live-push.ts", "src/push-relay.ts"]) assert.doesNotMatch(read(file), /console\./, file);
});

test("the Notification Service Extension is wired: target, Info.plist, App Group, shared code", () => {
  const plugin = require("../plugins/with-notification-service") as { TARGET: string; EXTENSION_POINT: string; infoPlist: (group: string) => string; swiftFiles: () => string[] };
  assert.equal(plugin.TARGET, "FlowplanNotifications");
  const info = plugin.infoPlist("group.app.flowplan.mobile");
  assert.match(info, /<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.usernotifications\.service<\/string>/);
  assert.match(info, /<key>NSExtensionPrincipalClass<\/key>\s*<string>\$\(PRODUCT_MODULE_NAME\)\.NotificationService<\/string>/);
  assert.match(info, /<key>FlowplanPushAppGroup<\/key>\s*<string>group\.app\.flowplan\.mobile<\/string>/);
  assert.deepEqual(plugin.swiftFiles(), ["NotificationService.swift", "PushShared.swift"]);
  const service = read("plugins/notification-service/NotificationService.swift");
  assert.match(service, /final class NotificationService: UNNotificationServiceExtension/);
  assert.match(service, /serviceExtensionTimeWillExpire/);
  assert.match(service, /userInfo\["fp"\]/);
  // On failure: the placeholder, without buttons, link or ciphertext.
  assert.match(service, /content\.categoryIdentifier = ""\s+content\.userInfo = \[:\]/);
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "./plugins/with-notification-service") as [string, Record<string, string>] | undefined;
  assert.ok(entry);
  assert.equal(entry![1].appGroup, (config.extra as { appGroup: string }).appGroup);
  assert.equal(entry![1].bundleIdentifier, `${config.ios!.bundleIdentifier}.notifications`);
  // The buttons answer with the decrypted data, for its instance only.
  const actions = read("modules/flowplan-notify/ios/NotificationActions.swift");
  assert.match(actions, /if let body = info\["body"\] as\? \[String: Any\] \{ return body \}/);
  assert.match(actions, /origin != session\.server/);
  assert.match(swift, /return \["body": out\]/);
  assert.match(swift, /out\["notificationId"\] = id/);
  // Fastlane signs it like the other targets; the build passes its profile.
  const fastfile = read("fastlane/Fastfile");
  assert.match(fastfile, /target: "FlowplanNotifications", bundle_id: NOTIFICATIONS_ID/);
  assert.match(fastfile, /NOTIFICATIONS_ID = "#\{BUNDLE_ID\}\.notifications"/);
  assert.match(fastfile, /"FlowplanNotifications" => \[NOTIFICATIONS_ID, "IOS_NOTIFICATIONS_PROVISIONING_PROFILE"/);
  assert.match(fastfile, /Identifiers → #\{NOTIFICATIONS_ID\} → App Groups/);
  assert.match(read(".github/workflows/build.yml"), /IOS_NOTIFICATIONS_PROVISIONING_PROFILE: \$\{\{ secrets\.IOS_NOTIFICATIONS_PROVISIONING_PROFILE \}\}/);
});

test("Android: one FCM service, the app's; expo-notifications shows what it decrypted", () => {
  const plugin = require("../plugins/with-push-android") as { EXPO_SERVICE: string; SERVICE: string; oneMessagingService: (m: unknown) => { manifest: { $: Record<string, string>; application: { service: { $: Record<string, string> }[] }[] } } };
  const manifest = plugin.oneMessagingService({
    manifest: { $: { "xmlns:android": "http://schemas.android.com/apk/res/android" }, application: [{ $: { "android:name": ".MainApplication" }, service: [{ $: { "android:name": plugin.EXPO_SERVICE } }] }] },
  });
  assert.equal(manifest.manifest.$["xmlns:tools"], "http://schemas.android.com/tools");
  assert.deepEqual(manifest.manifest.application[0].service, [{ $: { "android:name": plugin.EXPO_SERVICE, "tools:node": "remove" } }]);
  assert.ok((config.plugins ?? []).includes("./plugins/with-push-android"));
  const moduleManifest = read("modules/flowplan-push/android/src/main/AndroidManifest.xml");
  assert.ok(moduleManifest.includes(`android:name="${plugin.SERVICE}"`));
  assert.match(moduleManifest, /<intent-filter android:priority="10">\s*<action android:name="com\.google\.firebase\.MESSAGING_EVENT" \/>/);
  assert.match(moduleManifest, /android:exported="false"/);
  assert.match(kotlin, /class FlowplanMessagingService : ExpoFirebaseMessagingService\(\)/);
  // The keys expo-notifications reads from a data message (NotificationData.kt).
  for (const key of ['data["title"]', 'data["message"]', 'data["body"]', 'data["categoryId"]', 'data["channelId"] = "inbox"', 'data["tag"]', 'data["badge"]'])
    assert.ok(kotlin.includes(key), key);
  assert.match(read("node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/notifications/model/NotificationData.kt"), /data\["categoryId"\]/);
  assert.match(read("node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/ExpoFirebaseMessagingService.kt"), /^open class ExpoFirebaseMessagingService/m);
  const gradle = read("modules/flowplan-push/android/build.gradle");
  assert.match(gradle, /implementation project\(':expo-notifications'\)/);
  assert.match(gradle, /com\.google\.crypto\.tink:tink-android:\d+\.\d+\.\d+/);
  for (const lang of ["", "-de", "-fr", "-b+zh+Hans"]) assert.match(read(`modules/flowplan-push/android/src/main/res/values${lang}/strings.xml`), /flowplan_push_placeholder/);
});

test("the relay's iOS placeholder is in the app's Localizable.strings, in every language", () => {
  const locales = config.locales as Record<string, { ios: Record<string, Record<string, string>> }>;
  const body = { de: "Neue Mitteilung", en: "New notification", fr: "Nouvelle notification", zh: "新通知" } as const;
  // The config's locale and the Android resource folder of each language.
  const where = { de: ["de", "-de"], en: ["en", ""], fr: ["fr", "-fr"], zh: ["zh-Hans", "-b+zh+Hans"] } as const;
  for (const lang of ["de", "en", "fr", "zh"] as const) {
    const table = locales[where[lang][0]].ios["Localizable.strings"];
    assert.equal(table.FP_PUSH_TITLE, "Flowplan", lang);
    assert.equal(table.FP_PUSH_BODY, body[lang], lang);
    // The extension's and Android's placeholder say the same.
    assert.ok(read("plugins/notification-service/NotificationService.swift").includes(`"${body[lang]}"`), lang);
    assert.ok(read(`modules/flowplan-push/android/src/main/res/values${where[lang][1]}/strings.xml`).includes(body[lang]), lang);
  }
});

test("Live Activities ask for push tokens in store builds", () => {
  const widgets = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-widgets") as [string, { enablePushNotifications: boolean }];
  assert.equal(widgets[1].enablePushNotifications, true);
  const activities = read("src/native/activities.ts");
  assert.match(activities, /watchLiveActivity\(kind, factory\.start\(props, props\.url\)\)/);
  assert.match(activities, /endLiveActivity\(kind\)/);
  assert.match(read("src/native/sync.ts"), /watchLiveActivity\("timer"/);
});

// ---- The contract with the instance (Flowplan tests/fixtures/push-contract.json) ----
//
// What a Flowplan instance really sends (written by its tests/push-relay.test.ts,
// copied here): the app's own code must open and read all of it.
const CONTRACT = join(__dirname, "fixtures", "push-contract.json");
const contract = JSON.parse(readFileSync(CONTRACT, "utf8")) as {
  instance: string;
  devicePrivateKey: string;
  devicePublicKey: string;
  alert: { message: Record<string, unknown> & { payload: string; category: string }; plaintext: Record<string, unknown> & { sentAt: number; id: string } };
  comment: { payload: string; sentAt: number };
  liveActivity: Record<string, unknown> & { labels: unknown };
};

test("contract: the instance's alert opens with the app's code and works for taps and buttons", () => {
  const device = fromBase64Url(contract.devicePrivateKey);
  assert.equal(encodeBase64Url(rawPublic(privateKeyOf(device))), contract.devicePublicKey);
  const text = openPayload(contract.alert.message.payload, device, protocolInfo(contract.instance));
  assert.ok(text, "opens with the instance's origin as HKDF info and aad");
  assert.equal(openPayload(contract.alert.message.payload, device, protocolInfo("https://other.example.org")), null);
  const message = parsePlaintext(text!, contract.instance, contract.alert.plaintext.sentAt)!;
  assert.ok(message, "a plaintext the app accepts (seconds, known category, link on the instance)");
  assert.equal(message.id, contract.alert.plaintext.id);
  assert.equal(message.category, "flowplan.read");
  assert.ok(message.path?.startsWith("/"));
  const data = notificationData(message, contract.instance);
  assert.equal(data.notificationId, contract.alert.plaintext.id);
  assert.equal(data.origin, contract.instance);
  assert.equal(data.url, message.path);
  // The envelope fits the app's limits.
  assert.ok(parseEnvelope(contract.alert.message.payload));

  // Buttons come only from the encrypted category (the Notification Service
  // Extension / the Android service set it). The relay's own category
  // (aps.category, outside the encryption) is never a registered one, so a
  // placeholder the extension could not replace never shows buttons whose
  // notification id is missing.
  const registered = categoryButtons({ done: "", tomorrow: "", reply: "", send: "", placeholder: "", read: "", approve: "", reject: "" }).map((c) => c.identifier);
  assert.deepEqual(registered.sort(), Object.values(CATEGORIES).sort());
  assert.ok(registered.includes(message.category!));
  for (const outer of ["task", "comment", "default"]) assert.ok(!registered.includes(outer), outer);
  assert.ok(["task", "comment", "default"].includes(contract.alert.message.category));

  const comment = parsePlaintext(openPayload(contract.comment.payload, device, protocolInfo(contract.instance))!, contract.instance, contract.comment.sentAt)!;
  assert.equal(comment.category, CATEGORIES.comment);
  assert.equal(comment.path, "/#page=00000000-0000-4000-8000-000000000001");
});

test("contract: the instance's Live Activity states are exactly the props the app's views take", () => {
  const live = contract.liveActivity as Record<string, { name: string; props: string }> & { labels: unknown };
  // The labels the instance used are what the app sends (German, Berlin).
  assert.deepEqual(live.labels, liveActivityLabels("de", "Europe/Berlin"));
  const at = Date.UTC(2026, 9, 24, 12, 0, 0);
  const berlin = (ms: number) => t("focusEndsAt", { time: new Intl.DateTimeFormat("de", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(ms)) }, "de");
  const task = { title: "Write the release notes", url: "/#page=00000000-0000-4000-8000-000000000002" };
  const session = (withTask: boolean) => ({ phase: "focus", startedAt: at, focusEndsAt: at + 25 * 60_000, breakEndsAt: at + 30 * 60_000, task: withTask ? task : null });
  const expected: Record<string, { name: string; props: object }> = {
    focus: { name: "FlowplanFocus", props: { ...focusActivity(session(false), "de", at + 60_000)!, untilLabel: berlin(at + 25 * 60_000) } },
    focusBreakWithContent: { name: "FlowplanFocus", props: { ...focusActivity(session(true), "de", at + 26 * 60_000)!, untilLabel: berlin(at + 30 * 60_000) } },
    timer: { name: "FlowplanTimer", props: timerProps({ timer: { start: at, title: "", database: "", url: "/" } } as never, "de")! },
    timerWithContent: { name: "FlowplanTimer", props: timerProps({ timer: { start: at, title: "Client call", database: "Billable work", url: "/#page=00000000-0000-4000-8000-000000000003" } } as never, "de")! },
  };
  for (const [name, want] of Object.entries(expected)) {
    const state = live[name];
    // expo-widgets' ContentState: { name, props: String }.
    assert.deepEqual(Object.keys(state).sort(), ["name", "props"], name);
    assert.equal(typeof state.props, "string", name);
    assert.equal(state.name, want.name, name);
    assert.deepEqual(JSON.parse(state.props), JSON.parse(JSON.stringify(want.props)), name);
  }
  // Every prop the views read is in the state (src/widgets/ios.tsx), none null.
  const source = read("src/widgets/ios.tsx");
  for (const [view, sample] of [["FlowplanTimer", live.timer], ["FlowplanFocus", live.focus]] as const) {
    const body = source.slice(source.indexOf(`function ${view}(`), source.indexOf("\n}\n", source.indexOf(`function ${view}(`)));
    const read_ = [...new Set([...body.matchAll(/props\.(\w+)/g)].map((m) => m[1]))];
    const props = JSON.parse(sample.props) as Record<string, unknown>;
    assert.ok(read_.length >= 4, view);
    for (const key of read_) assert.ok(props[key] !== undefined && props[key] !== null, `${view} reads ${key}`);
  }
});

test("Live Activity tokens reach the instance with the views' texts; without tokens no texts", async () => {
  const labels = liveActivityLabels("fr", "Europe/Paris");
  assert.equal(labels.focus.until.includes("{time}"), true);
  const phone = fakePhone({ liveLabels: () => labels });
  const first = await registrationFields(profile, { create: true }, phone.deps);
  assert.equal(first.liveActivityLabels, undefined);
  phone.live.set("p1", { focus: { relayToken: "F".repeat(30), tokenHash: "0".repeat(64), relay: RELAY, instance: INSTANCE, registeredAt: now } });
  const fields = await registrationFields(profile, { create: true }, phone.deps);
  assert.deepEqual(fields.liveActivityRelayTokens, { focus: "F".repeat(30) });
  assert.deepEqual(fields.liveActivityLabels, labels);
  const net = fakeNetwork({ POST: () => ({ status: 200, body: { ok: true } }) });
  assert.equal(await sendLiveToken(INSTANCE, "fpd_x", { kind: "focus", relayToken: "F".repeat(30), relayUrl: RELAY, labels }, net.http), "ok");
  assert.deepEqual((net.calls[0].body as { labels?: unknown }).labels, labels);
});
