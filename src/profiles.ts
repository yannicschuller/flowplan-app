// Profiles: several Flowplan instances in one app ("Work –
// flowplan.company.com", "Private – notes.example"), one of them active. What
// the app keeps for an instance – the device token for widgets and push, the
// last summary – lives under keys of its own profile
// (flowplan.profile.<id>.deviceToken), so a token of one instance is never
// sent to another. The web view keeps the sign-in per address (its cookie
// store is shared by the whole app), hence one profile per instance.
//
// The single address of older versions becomes the first profile, with its
// device token and summary. Pure functions – store.ts hands in the
// keychain / Keystore, the tests a Map.
import { originOf } from "./server";

export type Profile = { id: string; name: string; server: string };
export type ProfileState = { profiles: Profile[]; active: string | null };

export const MAX_PROFILES = 20;
const MAX_NAME = 60;
const ID = /^[a-z0-9]{1,32}$/;

export class ProfileError extends Error {
  code: "duplicate" | "tooMany" | "unknown" | "invalid";
  profile?: Profile;
  constructor(code: ProfileError["code"], profile?: Profile) {
    super(code);
    this.code = code;
    this.profile = profile;
  }
}

// The keys that belong to one profile; everything else (installation id, app
// lock, push asked) is the app's.
export const PROFILE_KEYS = ["deviceToken", "summary", "adminSummary"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];
export function profileKey(id: string, key: ProfileKey) {
  if (!ID.test(id)) throw new ProfileError("invalid");
  return `flowplan.profile.${id}.${key}`;
}
export const PROFILES_KEY = "flowplan.profiles";
// The keys of the single-address versions.
export const LEGACY_KEYS = { server: "flowplan.server", deviceToken: "flowplan.deviceToken", summary: "flowplan.summary" } as const;

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

// One line, no control characters, at most 60 characters; empty → the host.
export function cleanName(name: unknown, origin: string) {
  const value = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return value || hostOf(origin);
}

// What the keychain holds, checked again.
export function parseProfiles(raw: string | null): ProfileState | null {
  if (!raw) return null;
  let data: { profiles?: unknown; active?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.profiles)) return null;
  const profiles: Profile[] = [];
  for (const entry of data.profiles as Partial<Profile>[]) {
    if (!entry || typeof entry !== "object") continue;
    const server = originOf(entry.server);
    if (!server || server !== entry.server) continue;
    if (typeof entry.id !== "string" || !ID.test(entry.id) || profiles.some((p) => p.id === entry.id || p.server === server)) continue;
    profiles.push({ id: entry.id, name: cleanName(entry.name, server), server });
    if (profiles.length >= MAX_PROFILES) break;
  }
  const active = profiles.find((p) => p.id === data.active) ?? profiles[0] ?? null;
  return { profiles, active: active?.id ?? null };
}

export const serializeProfiles = (state: ProfileState) =>
  JSON.stringify({ profiles: state.profiles.map(({ id, name, server }) => ({ id, name, server })), active: state.active });

type Read = (key: string) => string | null;
type Write = (key: string, value: string | null) => void;

// The profiles, after moving a single address of an older version into the
// first profile (once; its old keys are removed).
export function loadProfiles(read: Read, write: Write): ProfileState {
  const saved = parseProfiles(read(PROFILES_KEY));
  if (saved) return saved;
  const server = originOf(read(LEGACY_KEYS.server));
  const state: ProfileState = server ? { profiles: [{ id: "main", name: cleanName("", server), server }], active: "main" } : { profiles: [], active: null };
  if (server)
    for (const key of ["deviceToken", "summary"] as const) {
      const value = read(LEGACY_KEYS[key]);
      if (value !== null) write(profileKey("main", key), value);
    }
  write(PROFILES_KEY, serializeProfiles(state));
  for (const key of Object.values(LEGACY_KEYS)) if (read(key) !== null) write(key, null);
  return state;
}

export const activeProfile = (state: ProfileState) => state.profiles.find((p) => p.id === state.active) ?? null;
export const findByServer = (state: ProfileState, origin: string) => state.profiles.find((p) => p.server === origin) ?? null;

export function newId(random: () => number = Math.random) {
  let id = "";
  while (id.length < 12) id += Math.floor(random() * 36).toString(36);
  return id;
}

// Adds an instance and makes it active. An address that already has a
// profile is refused with that profile (the caller switches to it).
export function addProfile(state: ProfileState, input: { name?: string; server: string }, id = newId()): { state: ProfileState; profile: Profile } {
  const server = originOf(input.server);
  if (!server || server !== input.server) throw new ProfileError("invalid");
  const existing = findByServer(state, server);
  if (existing) throw new ProfileError("duplicate", existing);
  if (state.profiles.length >= MAX_PROFILES) throw new ProfileError("tooMany");
  while (!ID.test(id) || state.profiles.some((p) => p.id === id)) id = newId();
  const profile = { id, name: cleanName(input.name, server), server };
  return { state: { profiles: [...state.profiles, profile], active: id }, profile };
}

export function renameProfile(state: ProfileState, id: string, name: string): ProfileState {
  if (!state.profiles.some((p) => p.id === id)) throw new ProfileError("unknown");
  return { ...state, profiles: state.profiles.map((p) => (p.id === id ? { ...p, name: cleanName(name, p.server) } : p)) };
}

// Removes a profile; the active one moves to its neighbour (or none).
export function removeProfile(state: ProfileState, id: string): ProfileState {
  const index = state.profiles.findIndex((p) => p.id === id);
  if (index < 0) throw new ProfileError("unknown");
  const profiles = state.profiles.filter((p) => p.id !== id);
  const active = state.active === id ? (profiles[index] ?? profiles[index - 1] ?? null)?.id ?? null : state.active;
  return { profiles, active };
}

export function switchProfile(state: ProfileState, id: string): ProfileState {
  if (!state.profiles.some((p) => p.id === id)) throw new ProfileError("unknown");
  return { ...state, active: id };
}

// "Work – flowplan.company.com" (just the host when the name is the host).
export function profileLabel(profile: Profile) {
  const host = hostOf(profile.server);
  return profile.name === host ? host : `${profile.name} – ${host}`;
}
