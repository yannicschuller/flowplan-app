import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeProfile,
  addProfile,
  cleanName,
  findByServer,
  LEGACY_KEYS,
  loadProfiles,
  MAX_PROFILES,
  parseProfiles,
  PROFILES_KEY,
  profileKey,
  profileLabel,
  removeProfile,
  renameProfile,
  serializeProfiles,
  switchProfile,
  type ProfileState,
} from "../src/profiles";
import { decide, navigationState } from "../src/navigation";
import { acceptSignIn, PendingSignIns } from "../src/sign-in";
import { strings, t } from "../src/i18n";

const work = "https://flowplan.company.example";
const own = "https://notes.example";

// The keychain as a Map.
function keychain(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    read: (key: string) => map.get(key) ?? null,
    write: (key: string, value: string | null) => (value === null ? map.delete(key) : map.set(key, value)),
  };
}

test("the single address of an older version becomes the first profile, with its token and summary", () => {
  const chain = keychain({
    [LEGACY_KEYS.server]: work,
    [LEGACY_KEYS.deviceToken]: "fpd_old",
    [LEGACY_KEYS.summary]: '{"unread":2}',
    "flowplan.installation": "id-1",
    "flowplan.appLock": "1",
  });
  const state = loadProfiles(chain.read, chain.write);
  assert.deepEqual(state, { profiles: [{ id: "main", name: "flowplan.company.example", server: work }], active: "main" });
  assert.equal(chain.read(profileKey("main", "deviceToken")), "fpd_old");
  assert.equal(chain.read(profileKey("main", "summary")), '{"unread":2}');
  // The old keys are gone, the app's own ones stay.
  for (const key of Object.values(LEGACY_KEYS)) assert.equal(chain.read(key), null, key);
  assert.equal(chain.read("flowplan.installation"), "id-1");
  assert.equal(chain.read("flowplan.appLock"), "1");
  // Once: the next start reads the profiles.
  assert.deepEqual(loadProfiles(chain.read, chain.write), state);
  assert.equal(chain.read(PROFILES_KEY), serializeProfiles(state));
});

test("a fresh install has no profile; a broken old address is not taken over", () => {
  const fresh = keychain();
  assert.deepEqual(loadProfiles(fresh.read, fresh.write), { profiles: [], active: null });
  const broken = keychain({ [LEGACY_KEYS.server]: "javascript:alert(1)", [LEGACY_KEYS.deviceToken]: "fpd_x" });
  assert.deepEqual(loadProfiles(broken.read, broken.write), { profiles: [], active: null });
  assert.equal(broken.read(LEGACY_KEYS.deviceToken), null, "nothing of it stays");
});

test("every profile keeps its token and summary under its own keys", () => {
  assert.equal(profileKey("main", "deviceToken"), "flowplan.profile.main.deviceToken");
  assert.notEqual(profileKey("a1", "deviceToken"), profileKey("b2", "deviceToken"));
  // Keys stay within what the keychain / Keystore accepts.
  assert.match(profileKey("abc123", "summary"), /^[A-Za-z0-9._-]+$/);
  assert.throws(() => profileKey("../x", "deviceToken"));
  assert.throws(() => profileKey("", "deviceToken"));
});

test("profiles are added, switched, renamed and removed", () => {
  let state: ProfileState = { profiles: [{ id: "main", name: "Arbeit", server: work }], active: "main" };
  const added = addProfile(state, { name: "  Privat\n", server: own }, "abc123");
  state = added.state;
  assert.deepEqual(added.profile, { id: "abc123", name: "Privat", server: own });
  assert.equal(state.active, "abc123", "a new profile becomes active");
  assert.equal(activeProfile(state)?.server, own);
  // One profile per instance: the web view keeps one sign-in per address.
  assert.throws(() => addProfile(state, { server: work }), (e: { code?: string; profile?: { id: string } }) => e.code === "duplicate" && e.profile?.id === "main");
  assert.equal(findByServer(state, work)?.id, "main");
  assert.throws(() => addProfile(state, { server: `${work}/path` }), { code: "invalid" });
  assert.throws(() => addProfile(state, { server: "file:///etc/passwd" }), { code: "invalid" });
  state = switchProfile(state, "main");
  assert.equal(activeProfile(state)?.name, "Arbeit");
  assert.throws(() => switchProfile(state, "nope"), { code: "unknown" });
  state = renameProfile(state, "abc123", "");
  assert.equal(state.profiles[1].name, "notes.example", "no name: the host");
  assert.throws(() => renameProfile(state, "nope", "x"), { code: "unknown" });
  // Removing the active one moves on to its neighbour, the last one leaves none.
  const removed = removeProfile(state, "main");
  assert.deepEqual(removed, { profiles: [{ id: "abc123", name: "notes.example", server: own }], active: "abc123" });
  assert.deepEqual(removeProfile(removed, "abc123"), { profiles: [], active: null });
  assert.deepEqual(removeProfile(state, "abc123").active, "main", "removing another keeps the active one");
  // Ids stay unique, also when a generated one is taken.
  const again = addProfile({ profiles: [{ id: "x", name: "x", server: work }], active: "x" }, { server: own }, "x");
  assert.notEqual(again.profile.id, "x");
  assert.match(again.profile.id, /^[a-z0-9]{12}$/);
});

test("at most twenty profiles", () => {
  let state: ProfileState = { profiles: [], active: null };
  for (let i = 0; i < MAX_PROFILES; i++) state = addProfile(state, { server: `https://n${i}.example` }, `p${i}`).state;
  assert.throws(() => addProfile(state, { server: "https://one-more.example" }), { code: "tooMany" });
});

test("what the keychain holds is checked again", () => {
  const parsed = parseProfiles(
    JSON.stringify({
      profiles: [
        { id: "a1", name: "A", server: work },
        { id: "a1", name: "Same id", server: own },
        { id: "b2", name: "Same instance", server: work },
        { id: "../x", name: "Bad id", server: own },
        { id: "c3", name: "Path", server: `${own}/x` },
        { id: "d4", name: "Scheme", server: "javascript:alert(1)" },
        { id: "e5", name: "Line break\u0000", server: own },
        null,
        "x",
      ],
      active: "missing",
    }),
  );
  assert.deepEqual(parsed, {
    profiles: [
      { id: "a1", name: "A", server: work },
      { id: "e5", name: "Line break", server: own },
    ],
    active: "a1",
  });
  assert.equal(parseProfiles("{not json"), null);
  assert.equal(parseProfiles(null), null);
  assert.equal(cleanName("x".repeat(200), own).length, 60);
  assert.equal(profileLabel({ id: "a", name: "Arbeit", server: work }), "Arbeit – flowplan.company.example");
  assert.equal(profileLabel({ id: "a", name: "notes.example", server: own }), "notes.example");
});

test("the window and the sign-in keep to the active profile's instance", () => {
  // After a switch, the other profile's instance is another site.
  const state = navigationState();
  assert.deepEqual(decide(`${own}/`, { server: own, mainFrame: true, state }), { kind: "allow" });
  assert.deepEqual(decide(`${work}/`, { server: own, mainFrame: true, state }), { kind: "external", url: `${work}/` });
  // A sign-in code for the previous profile's instance is refused.
  const pending = new PendingSignIns();
  pending.add("challenge", "verifier");
  const link = `flowplan://sign-in?${new URLSearchParams({ server: work, challenge: "challenge", code: "code" })}`;
  assert.deepEqual(acceptSignIn(link, own, pending), { error: "foreign" });
});

test("App.tsx leaves the active instance before another one becomes active", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  // Token read and cleared while the old profile is still active, then the switch.
  assert.match(app, /const leaveActive = \(\) => \{[\s\S]*?const token = store\.deviceToken\(\);[\s\S]*?store\.forgetInstance\(current\.id\);[\s\S]*?leaveInstance\(current\.server, token\)/);
  assert.match(app, /leaveActive\(\);\s*saveProfiles\(switchProfile\(/);
  assert.match(app, /leaveActive\(\);\s*saveProfiles\(state\);/);
  const shell = readFileSync(new URL("../src/screens/Shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /pending\.current\.clear\(\);\s*navigation\.current = navigationState\(\);\s*redeemWhenLoaded\.current = null;/);
  // The store has no single server any more, only the active profile's.
  const store = readFileSync(new URL("../src/store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /"flowplan\.deviceToken"|"flowplan\.server"/);
});

test("profile texts exist in every language", () => {
  for (const key of ["switchProfile", "addProfile", "profiles", "profilesText", "nameLabel", "rename", "forget", "forgetConfirm", "tooManyProfiles"] as const)
    for (const locale of Object.keys(strings) as (keyof typeof strings)[]) assert.ok(strings[locale][key]?.trim(), `${locale}.${key}`);
  assert.equal(t("switchProfile", {}, "de"), "Profil wechseln");
  assert.equal(t("forgetConfirm", { server: "notes.example", name: "Privat" }, "en"), "The app signs out of notes.example and removes the profile “Privat”. Your data stays on the server.");
  assert.equal(t("tooManyProfiles", { count: 20 }, "fr"), "20 profils au maximum.");
});
