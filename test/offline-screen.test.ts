import { test } from "node:test";
import assert from "node:assert/strict";
import { strings } from "../src/i18n";

// #203: without an offline copy the "can't reach" screen says where offline
// use is switched on – with the section's name as Flowplan shows it.
test("the offline screen names Flowplan's offline settings in every language", () => {
  const section = { de: "Offline & Geräte", en: "Offline & devices", fr: "Hors ligne et appareils", zh: "离线与设备" } as const;
  for (const [lang, name] of Object.entries(section)) {
    const s = strings[lang as keyof typeof strings];
    assert.ok(s.offlineNoCopy.includes(name), `${lang}: ${s.offlineNoCopy}`);
    assert.ok(s.offlineCopyFailed.length > 20, lang);
    assert.notEqual(s.offlineNoCopy, s.offlineHint, lang);
  }
});
