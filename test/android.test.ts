import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../app.config";
import { setLocale } from "../src/i18n";
import { fileSize, hasContent, saveShare, shareable, shareDraft, shareFields, shareTargetPath } from "../src/android/share";
import { pageShortcutId, recentPages, shortcutList, shortcutOfLink } from "../src/android/shortcut-list";
import { materialThemes } from "../src/android/theme";
import { pathOfAppLink } from "../src/navigation";

const { shortcutsXml, STATIC_SHORTCUTS } = require("../plugins/with-android-extras") as {
  shortcutsXml: (pkg: string) => string;
  STATIC_SHORTCUTS: { id: string; link: string; icon: string; label: string }[];
};
const root = join(__dirname, "..");
const res = join(root, "modules/flowplan-android/android/src/main/res");
const PAGE = "0b6f1c1e-6a9e-4c8e-9a51-3f1d2b7c9e10";

test("a shared link, text and files become the capture screen's draft", () => {
  const pdf = { uri: "file:///cache/shared/0-a.pdf", name: "a.pdf", type: "application/pdf", size: 2048 };
  const photo = { uri: "file:///cache/shared/1-b.jpg", name: "b.jpg", type: "image/jpeg", size: 3 * 1024 * 1024 };
  const svg = { uri: "file:///cache/shared/2-c.svg", name: "c.svg", type: "image/svg+xml", size: 10 };
  const link = shareDraft({ subject: " The article ", text: "https://example.com/a", files: [], skipped: [] });
  assert.deepEqual(link, { title: "The article", text: "", url: "https://example.com/a", files: [], skipped: [] });
  const mixed = shareDraft({ subject: "", text: "Look at this https://example.com/b", files: [pdf, photo, svg], skipped: ["d.docx"] });
  assert.equal(mixed.text, "Look at this https://example.com/b");
  assert.equal(mixed.url, "");
  assert.deepEqual(mixed.files, [pdf, photo]);
  assert.deepEqual(mixed.skipped, ["d.docx", "c.svg"]);
  // At most ten files; the rest is named.
  const many = shareDraft({ subject: "", text: "", files: Array.from({ length: 12 }, (_, i) => ({ ...photo, name: `${i}.jpg` })), skipped: [] });
  assert.equal(many.files.length, 10);
  assert.deepEqual(many.skipped, ["10.jpg", "11.jpg"]);
  assert.equal(shareable("image/png"), true);
  assert.equal(shareable("image/svg+xml"), false);
  assert.equal(shareable("application/pdf"), true);
  assert.equal(shareable("text/html"), false);
  assert.equal(hasContent({ title: " ", text: "", url: "", files: [] }), false);
  assert.equal(hasContent({ title: "", text: "", url: "", files: [pdf] }), true);
  assert.equal(fileSize(2048), "2 KB");
  assert.equal(fileSize(3 * 1024 * 1024), "3.0 MB");
});

test("the share is sent as capture.share; older instances get their web share target", async () => {
  assert.deepEqual(shareFields(PAGE, { title: " T ", text: "x", url: "" }), { action: "capture.share", targetId: PAGE, title: "T", text: "x" });
  assert.equal(shareTargetPath({ title: "T", text: "", url: "https://example.com/a" }), "/share-target?title=T&url=https%3A%2F%2Fexample.com%2Fa");
  const seen: { url: string; body: unknown; auth: string }[] = [];
  const fetcher = async (url: string, init: { headers: Record<string, string>; body?: string | FormData }) => {
    seen.push({ url, body: init.body, auth: init.headers.Authorization });
    return { status: 200, ok: true, json: async () => ({ ok: true, action: "capture.share", url: `/#page=${PAGE}` }) };
  };
  const result = await saveShare({ server: "https://flowplan.example", token: "fpd_x", lang: "de" }, PAGE, { title: "", text: "Note", url: "", files: [] }, fetcher);
  assert.equal(result.ok, true);
  assert.equal(seen[0].url, "https://flowplan.example/api/mobile/widgets/action?lang=de");
  assert.equal(seen[0].auth, "Bearer fpd_x");
  assert.deepEqual(JSON.parse(seen[0].body as string), { action: "capture.share", targetId: PAGE, text: "Note" });
  // With files: multipart, every file as a "file" part.
  await saveShare(
    { server: "https://flowplan.example", token: "fpd_x", lang: "de" },
    PAGE,
    { title: "", text: "", url: "", files: [{ uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg", size: 1 }, { uri: "file:///b.pdf", name: "b.pdf", type: "application/pdf", size: 1 }] },
    fetcher,
  );
  const form = seen[1].body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("action"), "capture.share");
  assert.equal(form.getAll("file").length, 2);
});

test("app shortcuts: the recently opened pages first, per profile; signed out only the profiles", () => {
  setLocale("en");
  const recent = recentPages({ items: [{ id: PAGE.toUpperCase(), title: "Roadmap", kind: "document" }, { id: "nope", title: "x" }, { id: "1b6f1c1e-6a9e-4c8e-9a51-3f1d2b7c9e10", title: "Leads", kind: "database" }] });
  assert.deepEqual(recent.map((page) => page.id), [PAGE, "1b6f1c1e-6a9e-4c8e-9a51-3f1d2b7c9e10"]);
  const list = shortcutList({ signedIn: true, profile: "p1", recent });
  assert.deepEqual(list.map((s) => s.id), [pageShortcutId("p1", PAGE), "page:p1:1b6f1c1e-6a9e-4c8e-9a51-3f1d2b7c9e10", "inbox", "tasks", "search", "voice", "server"]);
  assert.equal(list[0].label, "Roadmap");
  assert.equal(list[1].icon, "database");
  assert.equal(pathOfAppLink(list[0].url), `/#page=${PAGE}`);
  assert.deepEqual(shortcutList({ signedIn: false, profile: "p1", recent }).map((s) => s.id), ["server"]);
  // Pages without a title (protected) are left out, at most three.
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `${i}b6f1c1e-6a9e-4c8e-9a51-3f1d2b7c9e10`, title: i === 0 ? "" : `P${i}`, kind: "document" }));
  assert.deepEqual(shortcutList({ signedIn: true, profile: "p1", recent: many }).slice(0, 3).map((s) => s.label), ["P1", "P2", "P3"]);
  assert.equal(shortcutOfLink(list[0].url, "p1"), pageShortcutId("p1", PAGE));
  assert.equal(shortcutOfLink("flowplan://quick-capture", "p1"), "capture");
  assert.equal(shortcutOfLink("flowplan://open?path=%2F%23inbox", "p1"), "inbox");
  assert.equal(shortcutOfLink("flowplan://open?path=%2F%23settings", "p1"), null);
});

test("static shortcuts: the app's links, texts and icons in German, English and French", () => {
  const xml = shortcutsXml("app.flowplan.mobile");
  assert.match(xml, /android:targetClass="app\.flowplan\.mobile\.MainActivity"/);
  assert.deepEqual(STATIC_SHORTCUTS.map((s) => s.link), ["flowplan://capture?mode=note", "flowplan://quick-capture"]);
  for (const dir of ["values", "values-de", "values-fr"]) {
    const strings = readFileSync(join(res, dir, "strings.xml"), "utf8");
    for (const s of STATIC_SHORTCUTS) {
      assert.match(strings, new RegExp(`name="${s.label}"`), `${dir}: ${s.label}`);
      assert.match(strings, new RegExp(`name="${s.label}_long"`), `${dir}: ${s.label}_long`);
    }
    assert.match(strings, /name="flowplan_tile_capture"/);
  }
  for (const s of STATIC_SHORTCUTS) readFileSync(join(res, "drawable", `${s.icon}.xml`), "utf8");
  // Every icon the dynamic shortcuts name exists.
  const kotlin = readFileSync(join(root, "modules/flowplan-android/android/src/main/java/app/flowplan/androidshell/Shortcuts.kt"), "utf8");
  for (const [, icon] of kotlin.matchAll(/R\.drawable\.(\w+)/g)) readFileSync(join(res, "drawable", `${icon}.xml`), "utf8");
});

test("the share target takes text, photos and PDFs, one or several", () => {
  const filters = config.android?.intentFilters ?? [];
  const types = (action: string) => filters.filter((f) => f.action === action).flatMap((f) => (f.data as { mimeType: string }[]).map((d) => d.mimeType));
  assert.deepEqual(types("SEND").sort(), ["application/pdf", "image/*", "text/plain"]);
  assert.deepEqual(types("SEND_MULTIPLE").sort(), ["application/pdf", "image/*"]);
  assert.ok((config.plugins ?? []).includes("./plugins/with-android-extras"));
});

test("Material You: the system's tones for the widgets' roles, Flowplan's colours otherwise", () => {
  const fallback = {
    light: { background: "#fcfbf8", text: "#1d1b22", muted: "#6b6876", brand: "#4146e6", late: "#c23b3b", line: "#ebe8f2", warn: "#b7791f", ok: "#2f855a" },
    dark: { background: "#16151b", text: "#f2f0f7", muted: "#a19dad", brand: "#8f93ff", late: "#ff7a7a", line: "#2a2832", warn: "#f6c25b", ok: "#68d391" },
  };
  assert.equal(materialThemes(null, fallback), fallback);
  const palette = {
    accent1_200: "#B4C5FF",
    accent1_600: "#4A5BBF",
    accent2_50: "#F1F0FA",
    accent2_100: "#E1E2F2",
    accent2_800: "#2E3042",
    neutral1_50: "#F2F0F4",
    neutral1_900: "#1B1B1F",
    neutral2_200: "#C6C5D0",
    neutral2_700: "#45464F",
  };
  const themes = materialThemes(palette, fallback);
  assert.deepEqual(themes.light, { ...fallback.light, background: "#f1f0fa", text: "#1b1b1f", muted: "#45464f", brand: "#4a5bbf", line: "#e1e2f2" });
  assert.deepEqual(themes.dark, { ...fallback.dark, background: "#1b1b1f", text: "#f2f0f4", muted: "#c6c5d0", brand: "#b4c5ff", line: "#2e3042" });
  // A missing or broken tone: Flowplan's colours, not a mix.
  assert.equal(materialThemes({ ...palette, neutral1_900: "black" }, fallback), fallback);
  // The module reads exactly the tones the roles use.
  const kotlin = readFileSync(join(root, "modules/flowplan-android/android/src/main/java/app/flowplan/androidshell/MaterialColors.kt"), "utf8");
  assert.deepEqual([...kotlin.matchAll(/"(\w+_\d+)" to/g)].map((m) => m[1]).sort(), Object.keys(palette).sort());
});

test("update check: the website's answer, when to ask, what is offered", async () => {
  const { due, offer, parseCheckState, parseUpdateInfo } = await import("../src/android/update-check");
  const info = parseUpdateInfo({ version: "1.2.0", versionCode: 1020000, url: "https://flowplan.org/download/android.apk" });
  assert.deepEqual(info, { version: "1.2.0", versionCode: 1020000, url: "https://flowplan.org/download/android.apk" });
  assert.equal(parseUpdateInfo({ version: "1.2", versionCode: 1, url: "https://x.y" }), null);
  assert.equal(parseUpdateInfo({ version: "1.2.0", versionCode: 1020000, url: "http://flowplan.org/a.apk" }), null);
  assert.equal(parseUpdateInfo(null), null);
  const day = 24 * 60 * 60 * 1000;
  assert.deepEqual(parseCheckState("nonsense"), { at: 0 });
  assert.equal(due({ at: 0 }, day), true);
  assert.equal(due({ at: day }, day + 1000), false);
  // Newer only, and "later" holds for a week for that version.
  assert.equal(offer(info!, 1020000, { at: 0 }, day), false);
  assert.equal(offer(info!, 1010000, { at: 0 }, day), true);
  assert.equal(offer(info!, 1010000, { at: 0, skipped: "1.2.0", skippedAt: day }, 3 * day), false);
  assert.equal(offer(info!, 1010000, { at: 0, skipped: "1.2.0", skippedAt: day }, 9 * day), true);
  assert.equal(offer(info!, 1010000, { at: 0, skipped: "1.1.0", skippedAt: day }, 2 * day), true);
});
