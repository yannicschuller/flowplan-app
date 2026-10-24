// Focus filters (iOS, plugins/intents/app/FlowplanFocusFilter.swift): the
// profile and workspace a Focus asks for. When a Focus starts, the app
// switches to its profile and opens its workspace; when it ends, the app
// goes back to the profile it had before – unless the person switched
// meanwhile. Each change of the filter is applied once (its time `at`), so
// a switch by hand during the Focus stays. Pure functions – native/intents.ts
// reads the filter and keeps the memory.
import type { ProfileState } from "./profiles";

export type FocusFilter =
  | { active: true; at: number; profile: string; workspace: string | null; hideNotifications: boolean }
  | { active: false; at: number };

// What the app did for the last change it applied.
export type FocusMemory = { at: number; profile: string | null; before: string | null };

export type FocusStep = { switchTo: string | null; path: string | null; memory: FocusMemory };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE = /^[a-z0-9]{1,32}$/;

export function parseFocusFilter(raw: string | null | undefined): FocusFilter | null {
  if (!raw) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || typeof data.at !== "number" || !Number.isFinite(data.at)) return null;
  if (data.active !== true) return { active: false, at: data.at };
  if (typeof data.profile !== "string" || !PROFILE.test(data.profile)) return null;
  const workspace = typeof data.workspace === "string" && UUID.test(data.workspace) ? data.workspace.toLowerCase() : null;
  return { active: true, at: data.at, profile: data.profile, workspace, hideNotifications: data.hideNotifications === true };
}

export function parseFocusMemory(raw: string | null | undefined): FocusMemory | null {
  try {
    const data = JSON.parse(raw || "null") as Partial<FocusMemory> | null;
    if (!data || typeof data.at !== "number") return null;
    const id = (value: unknown) => (typeof value === "string" && PROFILE.test(value) ? value : null);
    return { at: data.at, profile: id(data.profile), before: id(data.before) };
  } catch {
    return null;
  }
}

// What to do for the filter now; null when there is nothing new.
export function focusStep(filter: FocusFilter | null, state: ProfileState, memory: FocusMemory | null): FocusStep | null {
  if (!filter || (memory && memory.at >= filter.at)) return null;
  const known = (id: string | null | undefined): id is string => !!id && state.profiles.some((p) => p.id === id);
  if (filter.active) {
    if (!known(filter.profile)) return { switchTo: null, path: null, memory: { at: filter.at, profile: null, before: memory?.before ?? null } };
    const switchTo = filter.profile !== state.active ? filter.profile : null;
    // From one Focus to the next: back to where the first one started.
    const before = memory?.profile ? memory.before : switchTo ? state.active : null;
    return {
      switchTo,
      path: filter.workspace ? `/#workspace=${filter.workspace}` : null,
      memory: { at: filter.at, profile: filter.profile, before },
    };
  }
  const back = memory?.before && memory.profile && state.active === memory.profile && known(memory.before) ? memory.before : null;
  return { switchTo: back, path: null, memory: { at: filter.at, profile: null, before: null } };
}

// The push rule for the active profile's instance (POST
// /api/mobile/intents/focus): quiet other workspaces, or everything while
// the Focus belongs to another profile.
export function focusRule(filter: FocusFilter | null, active: string | null): { hide: boolean; workspaceId: string | null } {
  if (!filter || !filter.active || !filter.hideNotifications) return { hide: false, workspaceId: null };
  if (filter.profile !== active) return { hide: true, workspaceId: null };
  return filter.workspace ? { hide: true, workspaceId: filter.workspace } : { hide: false, workspaceId: null };
}
