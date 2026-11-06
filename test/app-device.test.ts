// The device key per profile (src/app-device.ts) and the bridge that hands
// it to the instance's page: the instance gives a password sign-in in the
// app the app's lifetime only with it (lib/app-devices.ts in Flowplan).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appDeviceEntry, appDeviceFor, newAppDevice, parseAppDevice } from "../src/app-device";
import { bridgeScript } from "../src/bridge-script";
import { PROFILE_KEYS, profileKey } from "../src/profiles";

const server = "https://flowplan.example.com";
const random = (n: number) => new Uint8Array(randomBytes(n));
function keychain() {
  const map = new Map<string, string>();
  return { map, read: (key: string) => map.get(key) ?? null, write: (key: string, value: string | null) => void (value === null ? map.delete(key) : map.set(key, value)) };
}

test("a profile's key is made once, kept in the keychain and stays the same", () => {
  const chain = keychain();
  const first = appDeviceFor("a1", chain, random)!;
  assert.match(first.id, /^[A-Za-z0-9_-]{22}$/);
  assert.match(first.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(JSON.parse(chain.map.get("flowplan.profile.a1.appDevice")!), first);
  assert.deepEqual(appDeviceFor("a1", chain, () => { throw new Error("not again"); }), first, "the next launch reads it");
  const other = appDeviceFor("b2", chain, random)!;
  assert.notEqual(other.id, first.id, "every profile (instance) has its own");
  assert.notEqual(other.secret, first.secret);
});

test("the key is not one of the keys that go on every profile switch", () => {
  for (const key of PROFILE_KEYS) assert.notEqual(profileKey("a1", key), appDeviceEntry("a1"));
  assert.throws(() => appDeviceEntry("../x"), "profile ids are checked");
  assert.equal(appDeviceFor("../x", keychain(), random), null);
  // Leaving the profile for good (App.tsx dropProfile) removes it.
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  assert.match(app, /const dropProfile = \(id: string\) => \{[^}]*store\.forgetAppDevice\(id\)/);
});

test("a broken entry is replaced; a keychain that keeps nothing gives no key", () => {
  const chain = keychain();
  chain.map.set(appDeviceEntry("a1"), "{nonsense");
  const key = appDeviceFor("a1", chain, random)!;
  assert.deepEqual(parseAppDevice(chain.map.get(appDeviceEntry("a1"))!), key);
  // A key that would change with every launch is worse than none.
  assert.equal(appDeviceFor("a1", { read: () => null, write: () => {} }, random), null);
  assert.equal(appDeviceFor("a1", keychain(), () => new Uint8Array(0)), null, "no randomness, no key");
  assert.equal(parseAppDevice(JSON.stringify({ id: "short", secret: "x" })), null);
  assert.throws(() => newAppDevice(() => new Uint8Array(0)));
});

// The bridge in a minimal page.
function page(origin: string, deviceKey?: { id: string; secret: string } | null) {
  const window: Record<string, unknown> = { ReactNativeWebView: { postMessage() {} } };
  window.top = window;
  new Function("window", "location", "navigator", "document", "addEventListener", "matchMedia", "requestAnimationFrame", "MutationObserver", "getComputedStyle", bridgeScript({ server, platform: "android", version: "1.1.0", deviceKey }))(
    window,
    { origin },
    {},
    { documentElement: { append() {}, hasAttribute: () => false }, head: { append() {} }, body: null, createElement: () => ({}) },
    () => {},
    () => ({ addEventListener() {} }),
    () => 1,
    class {},
    () => ({}),
  );
  return window.FlowplanApp as { deviceKey?: { id: string; secret: string } } | undefined;
}

test("the instance's page – and only it – finds the key in window.FlowplanApp", () => {
  const key = newAppDevice(random);
  const app = page(server, key)!;
  assert.deepEqual(app.deviceKey, key);
  assert.ok(Object.isFrozen(app.deviceKey), "the page cannot swap it");
  assert.equal(page("https://evil.example", key), undefined, "another site gets no bridge at all");
  assert.equal(page(server, null)!.deviceKey, undefined, "without a key: none, as in older versions");
});
