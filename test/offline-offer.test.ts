import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { bridgeScript, parsePageMessage } from "../src/bridge-script";
import {
  copyLine,
  ENABLE_EVENT,
  formatBytes,
  infoOfMarker,
  infoOfStatus,
  OFFLINE_SETTINGS_PATH,
  offlineEnableScript,
  offlineStatusScript,
  parseCopyInfo,
  parseOfflineStatus,
  shouldOffer,
  STATUS_EVENT,
} from "../src/offline-offer";
import { LASTING_KEYS, lastingKey, PROFILE_KEYS, profileKey } from "../src/profiles";
import { strings, t } from "../src/i18n";

// #203: the app offers offline use once per profile and shows the copy in
// its settings; the page reports where it stands (lib/app-offline-offer.ts
// in Flowplan) and switches it on when asked.
const server = "https://flowplan.example.com";
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function runBridge(platform: "ios" | "android") {
  const posted: unknown[] = [];
  const page: Record<string, unknown> = {
    location: { origin: server, pathname: "/", search: "", hash: "" },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(parsePageMessage(data)) },
    addEventListener: () => {},
    navigator: {},
    sessionStorage: { getItem: () => null, setItem() {} },
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
  vm.runInNewContext(bridgeScript({ server, platform, version: "1.0.12" }), page);
  return { app: page.FlowplanApp as { offlineStatus?: (status: unknown) => void }, posted };
}

const reported = { version: 1, available: true, enabled: false, busy: false };

test("the bridge hands the page's offline status to the app, on both platforms", () => {
  for (const platform of ["ios", "android"] as const) {
    const { app, posted } = runBridge(platform);
    assert.equal(typeof app.offlineStatus, "function");
    app.offlineStatus!(reported);
    app.offlineStatus!("nonsense");
    assert.deepEqual(posted, [
      { type: "offlineStatus", status: reported },
      { type: "offlineStatus", status: null },
    ]);
  }
});

test("parseOfflineStatus: a checked status of version 1 or newer, nothing else", () => {
  assert.deepEqual(parseOfflineStatus({ ...reported, progress: [3, 10], result: "done", since: 5, lastRefresh: 9, pages: 4, bytes: 100, appBytes: 50, extra: "x" }), {
    available: true,
    reason: null,
    enabled: false,
    busy: false,
    progress: [3, 10],
    result: "done",
    since: 5,
    lastRefresh: 9,
    pages: 4,
    bytes: 100,
    appBytes: 50,
  });
  const odd = parseOfflineStatus({ version: 2, available: "yes", enabled: 1, progress: [1], result: "maybe", since: -1, bytes: Infinity, reason: "guest" })!;
  assert.equal(odd.available, false);
  assert.equal(odd.enabled, false);
  assert.equal(odd.progress, null);
  assert.equal(odd.result, null);
  assert.equal(odd.since, null);
  assert.equal(odd.bytes, null);
  assert.equal(odd.reason, "guest");
  for (const raw of [null, undefined, "x", {}, { version: 0 }, { version: "1" }]) assert.equal(parseOfflineStatus(raw), null, JSON.stringify(raw));
});

test("offered once: only when the instance can, it is off, signed in, in front and nothing else asks", () => {
  const status = parseOfflineStatus(reported);
  const ask = { status, offered: false, signedIn: true, front: true, otherQuestion: false };
  assert.equal(shouldOffer(ask), true);
  // An instance without the hook reports nothing: never asked there.
  assert.equal(shouldOffer({ ...ask, status: null }), false);
  // "Nicht jetzt" (or "Speichern") before: not again.
  assert.equal(shouldOffer({ ...ask, offered: true }), false);
  // On already, being stored, or refused by the web app (HTTP on Android,
  // guests, the demo, little room).
  assert.equal(shouldOffer({ ...ask, status: parseOfflineStatus({ ...reported, enabled: true }) }), false);
  assert.equal(shouldOffer({ ...ask, status: parseOfflineStatus({ ...reported, busy: true }) }), false);
  for (const reason of ["insecure", "guest", "demo", "storage", "unsupported"])
    assert.equal(shouldOffer({ ...ask, status: parseOfflineStatus({ ...reported, available: false, reason }) }), false, reason);
  assert.equal(shouldOffer({ ...ask, signedIn: false }), false);
  assert.equal(shouldOffer({ ...ask, front: false }), false);
  // The notification question right after the first sign-in goes first.
  assert.equal(shouldOffer({ ...ask, otherQuestion: true }), false);
});

test("the app asks the page with events the page's hook listens to", () => {
  assert.equal(ENABLE_EVENT, "flowplan:offline-enable");
  assert.equal(STATUS_EVENT, "flowplan:offline-status");
  const events: string[] = [];
  const page = { window: { dispatchEvent: (event: { type: string }) => events.push(event.type) }, CustomEvent: class { constructor(public type: string) {} } };
  vm.runInNewContext(offlineEnableScript, page);
  vm.runInNewContext(offlineStatusScript, page);
  assert.deepEqual(events, [ENABLE_EVENT, STATUS_EVENT]);
  // Flowplan's Settings → Offline & devices (lib/settings-sections.ts "devices").
  assert.equal(OFFLINE_SETTINGS_PATH, "/#settings/devices");
});

test("the settings' line: no copy, not complete, its age and size, or managed in Flowplan", () => {
  const now = Date.UTC(2026, 10, 13, 12);
  assert.equal(copyLine(null, now, "de"), t("offlineCopyManaged", {}, "de"));
  assert.equal(copyLine({ enabled: false, since: null, lastRefresh: null, bytes: null }, now, "en"), t("offlineCopyNone", {}, "en"));
  assert.equal(copyLine({ enabled: true, since: 1, lastRefresh: null, bytes: null }, now, "en"), t("offlineCopyIncomplete", {}, "en"));
  assert.equal(copyLine({ enabled: true, since: 1, lastRefresh: now - 3 * 3600_000, bytes: 35 * 1024 * 1024 }, now, "en"), "Offline copy on this device, updated 3 hours ago · 35 MB");
  assert.equal(copyLine({ enabled: true, since: 1, lastRefresh: now - 3 * 3600_000, bytes: null }, now, "de"), "Offline-Kopie auf diesem Gerät, aktualisiert vor 3 Stunden");
  assert.equal(copyLine({ enabled: true, since: 1, lastRefresh: now - 86400_000, bytes: null }, now, "de"), "Offline-Kopie auf diesem Gerät, aktualisiert gestern");
  assert.equal(formatBytes(512, "en"), "512 B");
  assert.equal(formatBytes(1.5 * 1024 * 1024, "de"), "1,5 MB");
  assert.equal(formatBytes(3 * 1024 ** 3, "en"), "3 GB");
});

test("the copy's facts: from the page's report (Android) or the marker the app keeps (iOS)", () => {
  assert.deepEqual(infoOfStatus(parseOfflineStatus({ ...reported, enabled: true, since: 1, lastRefresh: 2, bytes: 10, appBytes: 5 })!), { enabled: true, since: 1, lastRefresh: 2, bytes: 15 });
  assert.deepEqual(infoOfStatus(parseOfflineStatus(reported)!), { enabled: false, since: null, lastRefresh: null, bytes: null });
  assert.deepEqual(infoOfMarker({ user: "u", since: 1, lastRefresh: 2, bytes: 3 }, 99), { enabled: true, since: 1, lastRefresh: 2, bytes: 99 });
  assert.deepEqual(infoOfMarker(null, 0), { enabled: false, since: null, lastRefresh: null, bytes: null });
  const info = { enabled: true, since: 1, lastRefresh: 2, bytes: 3 };
  assert.deepEqual(parseCopyInfo(JSON.stringify(info)), info);
  for (const raw of [null, "", "{", "[]", '{"enabled":"yes"}']) assert.equal(parseCopyInfo(raw), null, String(raw));
});

test("the offer and the motion are kept per profile across switches, gone with the profile", () => {
  for (const key of LASTING_KEYS) {
    assert.ok(!(PROFILE_KEYS as readonly string[]).includes(key), key);
    assert.equal(lastingKey("a1", key), `flowplan.profile.a1.${key}`);
    for (const other of PROFILE_KEYS) assert.notEqual(lastingKey("a1", key), profileKey("a1", other));
  }
  assert.throws(() => lastingKey("../x", "motion"));
  const app = src("src/App.tsx");
  assert.match(app, /store\.forgetLasting\(id\)/);
  // Asked once, whatever the answer; "Speichern" has the page switch it on.
  assert.match(app, /store\.setOfflineOffered\(activeId\);\s*\n\s*Alert\.alert\(t\("offerTitle"\), t\("offerText"\)/);
  assert.match(app, /text: t\("offerSave"\), onPress: \(\) => shell\.current\?\.offline\("enable"\)/);
  assert.match(app, /text: t\("offerLater"\), style: "cancel"/);
  // On already: never offered on this profile.
  assert.match(app, /if \(status\.enabled && !store\.offlineOffered\(id\)\) store\.setOfflineOffered\(id\)/);
  const shell = src("src/screens/Shell.tsx");
  assert.match(shell, /if \(onServer\(\) && !showingCopyRef\.current\) run\(op === "enable" \? offlineEnableScript : offlineStatusScript\)/);
});

test("texts: the question and the settings in every language, with Flowplan's name of the section", () => {
  const section = { de: "Offline & Geräte", en: "Offline & devices", fr: "Hors ligne et appareils", zh: "离线与设备" } as const;
  for (const lang of ["de", "en", "fr", "zh"] as const) {
    const text = strings[lang];
    for (const key of ["offerTitle", "offerText", "offerSave", "offerLater", "offlineCopyTitle", "offlineCopyManaged", "offlineCopyNone", "offlineCopyIncomplete", "offlineCopyAt", "offlineCopyOpen"] as const)
      assert.ok(text[key], `${lang} ${key}`);
    assert.ok(text.offerText.includes(section[lang]), `${lang} offerText names the section`);
    assert.ok(text.offlineCopyManaged.includes(section[lang]), `${lang} offlineCopyManaged names the section`);
    assert.ok(text.offlineCopyOpen.includes(section[lang]), `${lang} offlineCopyOpen names the section`);
    assert.match(text.offlineCopyAt, /\{age\}/);
  }
  assert.equal(strings.de.offerTitle, "Seiten auf diesem Gerät speichern?");
  assert.equal(strings.de.offerSave, "Speichern");
  assert.equal(strings.de.offerLater, "Nicht jetzt");
  // Informal: "du" in German, "tu" in French.
  assert.match(strings.de.offerText, /\bdu\b/);
  assert.doesNotMatch(strings.de.offerText, /\bSie\b/);
  assert.match(strings.fr.offerText, /\bTu\b|\btu\b/);
  assert.doesNotMatch(strings.fr.offerText, /\bvous\b/i);
});
