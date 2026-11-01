import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import { decide, httpErrorNeedsCheck, navigationState } from "../src/navigation";
import { profilesRequest, unsignedProfile } from "../src/profile-picker";
import { addProfile, ownName, parseSignedIn, ProfileError, replaceProfile, withSignedIn, type ProfileState } from "../src/profiles";
import { t, setLocale } from "../src/i18n";

// #69: the sign-in pages lead to the app's profiles ("Other server? Switch
// profile"), so a profile with the wrong address is no dead end.
const server = "https://flowplan.example.com";

function runBridge(location: { pathname: string; search: string; hash: string }) {
  const posted: unknown[] = [];
  const page: Record<string, unknown> = {
    location: { origin: server, ...location },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(parsePageMessage(data)) },
    addEventListener: () => {},
    navigator: {},
    document: { documentElement: {}, head: { append() {} }, body: null, createElement: () => ({}), querySelector: () => null },
    getComputedStyle: () => ({ backgroundColor: "" }),
    matchMedia: () => ({ addEventListener() {} }),
    requestAnimationFrame: () => 1,
    MutationObserver: class {
      observe() {}
    },
    innerWidth: 400,
    innerHeight: 800,
  };
  page.window = page;
  page.top = page;
  vm.runInNewContext(bridgeScript({ server, platform: "ios", version: "1.1.0" }), page);
  return { app: page.FlowplanApp as { openProfiles?: () => void }, posted };
}

test("the bridge offers openProfiles on every platform, with the page to come back to", () => {
  for (const platform of ["ios", "android"] as const) assert.match(bridgeScript({ server, platform, version: "1" }), /openProfiles: \(\) => post\(\{ type: "openProfiles"/);
  const { app, posted } = runBridge({ pathname: "/register", search: "?invite=x", hash: "#inbox" });
  assert.equal(typeof app.openProfiles, "function");
  app.openProfiles!();
  assert.deepEqual(posted, [{ type: "openProfiles", path: "/register?invite=x#inbox" }]);
  assert.deepEqual(profilesRequest(posted[0]), { path: "/register?invite=x#inbox" });
});

test("profilesRequest: only paths of the instance come back, the start page needs none", () => {
  assert.deepEqual(profilesRequest({ type: "openProfiles", path: "/login" }), { path: "/login" });
  assert.deepEqual(profilesRequest({ type: "openProfiles", path: "/" }), { path: null });
  assert.deepEqual(profilesRequest({ type: "openProfiles" }), { path: null });
  // Another site, a protocol-relative address, odd values: no path, still the profiles.
  for (const path of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "/a b", 5, null, "/" + "x".repeat(3000)])
    assert.deepEqual(profilesRequest({ type: "openProfiles", path }), { path: null }, String(path).slice(0, 40));
  assert.equal(profilesRequest({ type: "openSettings" }), null);
  assert.equal(profilesRequest(null), null);
  assert.equal(profilesRequest("openProfiles"), null);
});

test("older apps: the page's flowplan://change-server link is an app link (every version opens the profiles with it)", () => {
  assert.deepEqual(decide("flowplan://change-server", { server, mainFrame: true, state: navigationState(), now: 1 }), {
    kind: "appLink",
    url: "flowplan://change-server",
  });
});

test("a profile never signed in is offered to change its address or go", () => {
  const { state } = addProfile({ profiles: [], active: null }, { server, name: "Work" }, "work");
  assert.equal(unsignedProfile(state, () => false)?.id, "work");
  assert.equal(unsignedProfile(state, (id) => id === "work"), null);
  assert.equal(unsignedProfile({ profiles: [], active: null }, () => false), null);
});

test("replaceProfile: a new profile in the old one's place, active, with a new id", () => {
  let state: ProfileState = { profiles: [], active: null };
  state = addProfile(state, { server: "https://a.example" }, "first").state;
  state = addProfile(state, { server: "https://wrong.example", name: "Work" }, "wrong").state;
  state = addProfile(state, { server: "https://c.example" }, "third").state;
  state = { ...state, active: "wrong" };
  const result = replaceProfile(state, "wrong", { server: "https://right.example", name: "Work" }, "right");
  assert.deepEqual(result.state, {
    profiles: [
      { id: "first", name: "a.example", server: "https://a.example" },
      { id: "right", name: "Work", server: "https://right.example" },
      { id: "third", name: "c.example", server: "https://c.example" },
    ],
    active: "right",
  });
  assert.equal(result.previous.id, "wrong");
  // An empty name becomes the new host; the old id is never reused.
  assert.equal(replaceProfile(state, "wrong", { server: "https://right.example" }, "wrong").profile.name, "right.example");
  assert.notEqual(replaceProfile(state, "wrong", { server: "https://right.example" }, "wrong").profile.id, "wrong");
  // Another profile's address, an unknown profile, no origin: refused.
  assert.throws(() => replaceProfile(state, "wrong", { server: "https://a.example" }), (e: unknown) => e instanceof ProfileError && e.code === "duplicate" && e.profile?.id === "first");
  assert.throws(() => replaceProfile(state, "nope", { server: "https://right.example" }), (e: unknown) => e instanceof ProfileError && e.code === "unknown");
  assert.throws(() => replaceProfile(state, "wrong", { server: "https://right.example/path" }), (e: unknown) => e instanceof ProfileError && e.code === "invalid");
  // The name field offers a name of its own only.
  assert.equal(ownName({ id: "x", name: "Work", server: "https://a.example" }), "Work");
  assert.equal(ownName({ id: "x", name: "a.example", server: "https://a.example" }), "");
});

test("the profiles signed in once: a checked list of ids", () => {
  assert.deepEqual(parseSignedIn(null), []);
  assert.deepEqual(parseSignedIn("nonsense"), []);
  assert.deepEqual(parseSignedIn('{"a":1}'), []);
  assert.deepEqual(parseSignedIn('["main","main","Bad Id",3,"abc"]'), ["main", "abc"]);
  assert.deepEqual(withSignedIn([], "main", true), ["main"]);
  assert.deepEqual(withSignedIn(["main"], "main", true), ["main"]);
  assert.deepEqual(withSignedIn(["main", "abc"], "main", false), ["abc"]);
  assert.deepEqual(withSignedIn(["main"], "../x", true), ["main"]);
  assert.equal(withSignedIn([], "a", true).length, 1);
  const many = Array.from({ length: 50 }, (_, i) => `p${i}`).reduce((list, id) => withSignedIn(list, id, true), [] as string[]);
  assert.equal(many.length, 40);
  assert.equal(many.at(-1), "p49");
});

test("an error page instead of the instance is checked; Flowplan's own errors are not", () => {
  assert.equal(httpErrorNeedsCheck(`${server}/`, 502, server), true);
  assert.equal(httpErrorNeedsCheck(`${server}/login`, 503, server), true);
  assert.equal(httpErrorNeedsCheck(`${server}/`, 404, server), true);
  // A missing page of a working instance is Flowplan's own page.
  assert.equal(httpErrorNeedsCheck(`${server}/share/x`, 404, server), false);
  assert.equal(httpErrorNeedsCheck(`${server}/`, 200, server), false);
  // Another site (the identity provider) is not the instance.
  assert.equal(httpErrorNeedsCheck("https://login.example/", 500, server), false);
  assert.equal(httpErrorNeedsCheck(`${server}/`, Number.NaN, server), false);
  assert.equal(httpErrorNeedsCheck(`${server}/`, 500, null), false);
});

test("the texts of the profile screen exist in German, English and French", () => {
  for (const locale of ["de", "en", "fr"] as const) {
    setLocale(locale);
    for (const key of ["changeAddress", "changeAddressText", "notSignedInTitle", "notSignedInText", "removeProfile", "removeProfileTitle", "removeProfileConfirm"] as const) {
      const text = t(key, { name: "Work – a.example" });
      assert.ok(text && text !== key && !/\{\w+\}/.test(text), `${locale} ${key}`);
    }
  }
  setLocale("en");
});
