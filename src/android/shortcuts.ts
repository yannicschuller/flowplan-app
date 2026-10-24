// Android: the app shortcuts on the launcher icon (long press). Two are
// static and there before the first start (plugins/with-android-extras.js):
// "New note" and "Quick capture". The dynamic ones follow the person: the
// pages they opened last (the instance's page visits, pinned widget data in
// mode "recent"), then inbox, my tasks, search, voice memo and "Switch
// profile". Launchers show about four in all, the static ones first; the
// rest appear in the shortcut list and can be pinned to the home screen.
// iOS keeps its quick actions (native/actions.ts).
import { Platform } from "react-native";
import { reportShortcutUsed, setShortcuts as setNativeShortcuts } from "../../modules/flowplan-android/src";
import { store } from "../store";
import { localDay } from "../summary";
import { widgetData, type Connection } from "../widgets/api";
import { connection, timeZone } from "../native/suite";
import { RECENT_PAGES, recentPages, shortcutList, shortcutOfLink, type RecentPage } from "./shortcut-list";

export async function fetchRecentPages(target: Connection): Promise<RecentPage[] | null> {
  const result = await widgetData(target, [{ id: "recent", kind: "pinned", config: { mode: "recent", max: RECENT_PAGES } }], { today: localDay(), zone: timeZone() });
  if (!result.ok) return null;
  // Instances from before mode "recent" refuse it: no pages.
  const answer = result.value.get("recent");
  return answer?.ok ? recentPages(answer.data) : [];
}

// The last pages that were shown, so an offline start keeps them.
let lastRecent: { profile: string | null; pages: RecentPage[] } = { profile: null, pages: [] };

export async function syncShortcuts(signedIn: boolean) {
  if (Platform.OS !== "android") return;
  const profile = store.profiles().active;
  const target = signedIn ? connection() : null;
  if (lastRecent.profile !== profile) lastRecent = { profile, pages: [] };
  // The shortcuts change at once (signed in or out, another profile) …
  setNativeShortcuts(shortcutList({ signedIn, profile, recent: lastRecent.pages }), signedIn ? profile : null);
  if (!target) return;
  // … and again with the pages the instance knows.
  const pages = await fetchRecentPages(target).catch(() => null);
  if (!pages || store.profiles().active !== profile) return;
  if (JSON.stringify(pages) === JSON.stringify(lastRecent.pages)) return;
  lastRecent = { profile, pages };
  setNativeShortcuts(shortcutList({ signedIn, profile, recent: pages }), profile);
}

// A link of a shortcut was opened (from the shortcut or elsewhere): the
// launcher learns what is used.
export function shortcutLinkOpened(link: string) {
  if (Platform.OS !== "android") return;
  const id = shortcutOfLink(link, store.profiles().active);
  if (id) reportShortcutUsed(id);
}
