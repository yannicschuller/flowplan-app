// The app shortcuts on Android's launcher icon (android/shortcuts.ts): which
// ones, in which order, and which shortcut a link belongs to. Pure – tested in
// test/android.test.ts.
import type { Shortcut } from "../../modules/flowplan-android/src";
import { t } from "../i18n";
import { appLink } from "../navigation";

export type RecentPage = { id: string; title: string; kind: string };
export const RECENT_PAGES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Page shortcuts carry the profile: a pinned one of another profile waits
// (disabled) until that profile is active again.
export const pageShortcutId = (profile: string, pageId: string) => `page:${profile}:${pageId}`;

export function shortcutList(input: { signedIn: boolean; profile: string | null; recent: RecentPage[] }): Shortcut[] {
  const item = (id: string, label: string, url: string, icon: Shortcut["icon"], longLabel = label): Shortcut => ({ id, label, longLabel, url, icon });
  const pages =
    input.signedIn && input.profile
      ? input.recent
          .filter((page) => UUID.test(page.id) && page.title.trim())
          .slice(0, RECENT_PAGES)
          .map((page) =>
            item(pageShortcutId(input.profile!, page.id), page.title.trim(), appLink(`/#page=${page.id}`), page.kind === "database" ? "database" : "page"),
          )
      : [];
  return [
    ...pages,
    ...(input.signedIn
      ? [
          item("inbox", t("actionInbox"), appLink("/#inbox"), "inbox"),
          item("tasks", t("actionTasks"), appLink("/#tasks"), "tasks"),
          item("search", t("actionSearch"), appLink("/#search"), "search"),
          item("voice", t("actionVoice"), "flowplan://capture?mode=voice&record=1", "voice"),
        ]
      : []),
    item("server", t("switchProfile"), "flowplan://change-server", "profile"),
  ];
}

// The pages from the instance's answer (pinned data, mode "recent").
export function recentPages(data: Record<string, unknown> | null | undefined): RecentPage[] {
  const items = Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]) : [];
  return items
    .map((page) => ({ id: String(page.id ?? "").toLowerCase(), title: typeof page.title === "string" ? page.title : "", kind: String(page.kind ?? "document") }))
    .filter((page) => UUID.test(page.id));
}

// The shortcut a link belongs to (static ones: "note", "capture").
export function shortcutOfLink(link: string, profile: string | null): string | null {
  const page = /^flowplan:\/\/open\?path=%2F%23page%3D([0-9a-f-]{36})$/i.exec(link)?.[1];
  if (page) return profile ? pageShortcutId(profile, page.toLowerCase()) : null;
  const ids: Record<string, string> = {
    "flowplan://capture?mode=note": "note",
    "flowplan://quick-capture": "capture",
    "flowplan://capture?mode=voice&record=1": "voice",
    [appLink("/#inbox")]: "inbox",
    [appLink("/#tasks")]: "tasks",
    [appLink("/#search")]: "search",
  };
  return ids[link] ?? null;
}
