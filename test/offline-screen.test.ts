import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// #539: a server that moved to another address. The screen asks whether the
// address changed and its second button opens the app's profile switcher
// (another profile, or "Add profile …" for the new address) – the same sheet
// as Flowplan's "Switch instance …", which a page that never loads cannot
// offer. A page whose message "could not be loaded completely" offers
// "Switch server" asks with openProfileSwitcher, which the window already
// hears.
test("#539: the offline screen asks about a changed address and switches server", () => {
  const words = {
    de: ["Adresse", "Server wechseln"],
    en: ["address", "Switch server"],
    fr: ["adresse", "Changer de serveur"],
    zh: ["地址", "切换服务器"],
  } as const;
  for (const [lang, [address, button]] of Object.entries(words)) {
    const s = strings[lang as keyof typeof strings];
    assert.equal(s.switchServer, button, lang);
    assert.ok(s.offlineMoved.includes(address), `${lang}: ${s.offlineMoved}`);
    // It names the button the screen shows.
    assert.ok(s.offlineMoved.includes(button), `${lang}: ${s.offlineMoved}`);
    assert.ok(!s.offlineErrorPageHint.includes(lang === "de" ? "Profil" : lang === "en" ? "profile" : lang === "fr" ? "profil" : "账户"), `${lang}: ${s.offlineErrorPageHint}`);
  }
  const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
  const screen = read("src/screens/Offline.tsx");
  assert.match(screen, /title=\{t\("switchServer"\)\}[^>]*onPress=\{onSwitchServer\}/);
  assert.match(screen, /t\("offlineMoved"\)/);
  const shell = read("src/screens/Shell.tsx");
  assert.match(shell, /<Offline [^>]*onSwitchServer=\{\(\) => onProfileSwitcher\("app"\)\}/);
  assert.match(shell, /if \(switcherRequest\(message, switcherToken\)\) onProfileSwitcher\("page"\)/);
});
