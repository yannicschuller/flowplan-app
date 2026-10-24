// What the iPad's windows, hardware keyboard and Handoff decide, as plain
// functions (the native side: modules/flowplan-ipad, the wiring:
// window-features.ts).
//
// - Keyboard: the page lists its shortcuts (lib/app-shortcuts.ts in
//   Flowplan, through FlowplanApp.shortcuts); they become key commands that
//   holding ⌘ lists, and pressing one runs the action in the page.
// - Handoff: a window advertises the page of the instance it shows; a page
//   handed over from the Mac or another device opens only on an instance
//   the app has a profile for.
import type { KeyCommand } from "../modules/flowplan-ipad/src";
import { safePath } from "./navigation";
import { findByServer, type ProfileState } from "./profiles";
import { originOf } from "./server";

const MAX_COMMANDS = 40;
const MAX_TITLE = 80;
const MODIFIERS = new Set(["command", "alternate", "control", "shift"]);
// Keys that are no character, as the page and the native side name them.
const NAMED_INPUTS = new Set(["up", "down", "left", "right", "escape", "pageUp", "pageDown", "home", "end", "delete", ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`)]);

// The page's list, checked: known shapes only, at most 40, each with ⌘, ⌃ or
// ⌥ (a key command without one would take the key away from typing).
export function keyCommandsFrom(raw: unknown): KeyCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: KeyCommand[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= MAX_COMMANDS) break;
    if (!entry || typeof entry !== "object") continue;
    const { action, title, input, modifiers, hidden } = entry as Record<string, unknown>;
    if (typeof action !== "string" || !/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(action)) continue;
    if (typeof title !== "string" || !title.trim()) continue;
    if (typeof input !== "string" || !(input.length === 1 || NAMED_INPUTS.has(input))) continue;
    if (!Array.isArray(modifiers) || !modifiers.every((m) => typeof m === "string" && MODIFIERS.has(m))) continue;
    const mods = [...new Set(modifiers as KeyCommand["modifiers"])].sort();
    if (!mods.some((m) => m !== "shift")) continue;
    const key = `${mods.join("+")}+${input.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ action, title: title.trim().slice(0, MAX_TITLE), input: input.length === 1 ? input.toLowerCase() : input, modifiers: mods, ...(hidden === true ? { hidden: true } : {}) });
  }
  return out;
}

// Runs a shortcut's action in the page (window.FlowplanShortcuts, lib/app-
// shortcuts.ts in Flowplan); nothing on instances without it.
export function shortcutScript(action: string) {
  return `(() => {
  const shortcuts = window.FlowplanShortcuts;
  if (shortcuts && typeof shortcuts.run === "function") {
    try { shortcuts.run(${JSON.stringify(action)}); } catch (e) {}
  }
})();
true;`;
}

// The path of an address on the instance ("/#page=…"), or null.
export function pathOn(url: string | null | undefined, server: string | null) {
  if (!url || !server || originOf(url) !== server) return null;
  const parsed = new URL(url);
  return safePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
}

// What a window hands over: pages of the instance, not its endpoints.
export function handoffPage(url: string, server: string | null, title: string | undefined) {
  const path = pathOn(url, server);
  if (!path || path.startsWith("/api/")) return null;
  return { url, title: (title || "").trim().slice(0, 200) || "Flowplan" };
}

// Where a page handed over from another device opens: the profile of its
// instance and the path there; null for an instance without a profile.
export function handoffTarget(url: string, profiles: ProfileState): { profileId: string; path: string } | null {
  const origin = originOf(url);
  const profile = origin ? findByServer(profiles, origin) : null;
  const path = profile ? pathOn(url, profile.server) : null;
  return profile && path && !path.startsWith("/api/") ? { profileId: profile.id, path } : null;
}
