// The administrators' widgets (src/admin.ts): finished texts in every
// language, "Administrators only" for everyone else, no live numbers when
// the instance's statistics are off, and no null in the props.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminIssueText,
  adminLiveWidget,
  adminStatusWidget,
  adminStorageWidget,
  formatBytes,
  formatWhen,
  isAdminSummary,
  parseAdminState,
  sampleAdminSummary,
  type AdminState,
  type AdminSummary,
} from "../src/admin";
import { loadProfiles, PROFILE_KEYS, profileKey } from "../src/profiles";

const now = new Date(2026, 9, 22, 15, 0).getTime();
const base = sampleAdminSummary(now);
const data = (extra: Partial<AdminSummary> = {}): AdminState => ({ kind: "data", data: { ...base, ...extra } });

const nulls = (value: unknown, path = "props"): string[] =>
  value === null || value === undefined
    ? [path]
    : Array.isArray(value)
      ? value.flatMap((item, i) => nulls(item, `${path}[${i}]`))
      : typeof value === "object"
        ? Object.entries(value).flatMap(([key, item]) => nulls(item, `${path}.${key}`))
        : [];

test("signed out and non-administrators get a line instead of data", () => {
  for (const lang of ["de", "en", "fr"] as const) {
    assert.equal(adminStatusWidget(null, lang).state, "signedOut");
    assert.equal(adminLiveWidget({ kind: "notAdmin" }, lang).state, "notAdmin");
  }
  assert.equal(adminStatusWidget({ kind: "notAdmin" }, "de").message, "Nur für Administratoren");
  assert.equal(adminStorageWidget({ kind: "notAdmin" }, "en").message, "Administrators only");
  assert.equal(adminLiveWidget({ kind: "notAdmin" }, "fr").message, "Réservé aux administrateurs");
  assert.equal(adminStatusWidget(null, "en").message, "Open Flowplan to sign in");
});

test("the state: headline, first problem, update and backup; links into the administration", () => {
  const ok = adminStatusWidget(data({ health: { ...base.health, state: "ok", notices: [], nearlyFull: 0 } }), "de", now);
  assert.equal(ok.headline, "Alles in Ordnung");
  assert.equal(ok.detail, "");
  assert.equal(ok.url, "flowplan://open?path=%2F%23admin");
  assert.equal(ok.update, "Update 1.5.0 verfügbar");
  assert.equal(ok.version, "v1.4.2");
  assert.equal(ok.backup, "Letzte Sicherung 12:00");
  const broken = adminStatusWidget(
    data({ health: { state: "problem", problems: ["backup", "workers"], notices: ["quota"], failingWorkers: 2, nearlyFull: 1 }, backup: { enabled: true, lastAt: now - 3 * 86_400_000, failed: true } }),
    "en",
    now,
  );
  assert.equal(broken.headline, "2 problems");
  assert.equal(broken.detail, "Backup failed");
  assert.equal(broken.more, "+2 more");
  assert.equal(broken.url, "flowplan://open?path=%2F%23admin%2Fmonitoring");
  assert.equal(broken.backupLate, true);
  assert.match(broken.backup, /^Last backup /);
  assert.equal(adminStatusWidget(data(), "fr", now).headline, "1 remarque");
  assert.equal(adminIssueText("quota", base, "fr"), "1 espaces presque pleins");
  assert.equal(adminIssueText("workers", { ...base, health: { ...base.health, failingWorkers: 3 } }, "de"), "Dienste mit Fehlern: 3");
  // Codes of newer instances.
  assert.equal(adminIssueText("future", { ...base, health: { ...base.health, problems: ["future"] } }, "en"), "Problem");
  assert.equal(adminStatusWidget(data({ backup: { enabled: false, lastAt: null, failed: false } }), "en", now).backup, "Scheduled backup off");
});

test("live numbers with the chart; without statistics a line instead", () => {
  const live = adminLiveWidget(data(), "en");
  assert.deepEqual(
    live.tiles.map((tile) => tile.label),
    ["Active now", "Requests/min", "Error rate (1 h)", "Sign-ins today"],
  );
  assert.deepEqual(live.tiles.map((tile) => tile.value), ["14", "86", "0.2%", "27"]);
  assert.equal(live.spark.length, 24);
  assert.equal(live.url, "flowplan://open?path=%2F%23admin%2Fmonitoring");
  // Gaps of the series become 0; nothing collected yet: no chart.
  const gaps = adminLiveWidget(data({ live: { ...base.live!, requests24h: [null, 5, null] } }), "de");
  assert.deepEqual(gaps.spark, [0, 5, 0]);
  assert.deepEqual(adminLiveWidget(data({ live: { ...base.live!, requests24h: [null, null] } }), "de").spark, []);
  const off = adminLiveWidget(data({ live: null }), "de");
  assert.equal(off.state, "off");
  assert.equal(off.message, "Statistik ausgeschaltet");
  assert.deepEqual(off.tiles, []);
  assert.equal(adminLiveWidget(data({ live: { ...base.live!, errorRate: 0.08 } }), "en").errorsHigh, true);
});

test("storage: size, disk and the fullest quota", () => {
  const storage = adminStorageWidget(data(), "de");
  assert.equal(storage.used, "13 GB");
  assert.equal(storage.disk, 0.62);
  const plain = (text: string) => text.replace(/\s/g, " ");
  assert.equal(plain(storage.diskLabel), "Festplatte 62 % belegt");
  assert.equal(plain(storage.quotaLabel), "Vollster Arbeitsbereich 92 %");
  assert.equal(storage.warn, true);
  assert.equal(storage.url, "flowplan://open?path=%2F%23admin%2Fstorage");
  const unknown = adminStorageWidget(data({ storage: { ...base.storage, disk: null, fullestQuota: null, nearlyFull: 0 } }), "en");
  assert.equal(unknown.disk, -1);
  assert.equal(unknown.quota, -1);
  assert.equal(unknown.quotaLabel, "No quotas");
  assert.equal(unknown.warn, false);
  assert.equal(formatBytes(512, "en"), "512 B");
  assert.equal(formatBytes(5.25 * 1024 ** 2, "en"), "5.3 MB");
  assert.match(formatWhen(now - 2 * 86_400_000, now, "en"), /Oct/);
});

test("no null in any state, in any language", () => {
  const states: AdminState[] = [null, { kind: "notAdmin" }, data(), data({ live: null, update: null }), data({ storage: { ...base.storage, disk: null, fullestQuota: null } })];
  for (const lang of ["de", "en", "fr"] as const)
    for (const state of states) {
      assert.deepEqual(nulls(adminStatusWidget(state, lang, now)), []);
      assert.deepEqual(nulls(adminLiveWidget(state, lang)), []);
      assert.deepEqual(nulls(adminStorageWidget(state, lang)), []);
    }
});

test("the stored state is checked when read; it belongs to the profile", () => {
  assert.ok(isAdminSummary(base));
  assert.ok(!isAdminSummary({ error: "Administrator-Gruppe erforderlich." }));
  assert.deepEqual(parseAdminState(JSON.stringify({ kind: "notAdmin" })), { kind: "notAdmin" });
  assert.equal(parseAdminState(JSON.stringify({ kind: "data", data: { nope: 1 } })), null);
  assert.equal(parseAdminState("garbage"), null);
  assert.equal(parseAdminState(null), null);
  assert.ok(PROFILE_KEYS.includes("adminSummary"));
  assert.equal(profileKey("main", "adminSummary"), "flowplan.profile.main.adminSummary");
  // Moving an old single address still works with the new key.
  const stored = new Map<string, string | null>([["flowplan.server", "https://a.example"], ["flowplan.summary", "{}"]]);
  loadProfiles((key) => stored.get(key) ?? null, (key, value) => void stored.set(key, value));
  assert.equal(stored.get("flowplan.profile.main.summary"), "{}");
  assert.equal(stored.has("flowplan.profile.main.adminSummary"), false);
});
