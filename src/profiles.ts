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

// color: the dot the person chose for the profile (PROFILE_COLORS); none:
// derived from the instance's accent when known (profileColor).
export type Profile = { id: string; name: string; server: string; color?: ProfileColor };
export type ProfileState = { profiles: Profile[]; active: string | null };

export const MAX_PROFILES = 20;

// A small palette for the profiles' colour dots (profile list, switcher,
// widgets with the colour "Profile"), a light and a dark tone each. The
// first is Flowplan's own accent.
export const PROFILE_COLORS = {
  indigo: { light: "#4146e6", dark: "#8f93ff" },
  blue: { light: "#1f6feb", dark: "#6ea8fe" },
  teal: { light: "#0f7f85", dark: "#4fd1c5" },
  green: { light: "#2f855a", dark: "#68d391" },
  amber: { light: "#a86b12", dark: "#f6c25b" },
  orange: { light: "#c05621", dark: "#f6ad55" },
  red: { light: "#c53030", dark: "#fc8181" },
  pink: { light: "#b83280", dark: "#f78fc9" },
  violet: { light: "#7b3fe4", dark: "#b794f4" },
  slate: { light: "#4a5568", dark: "#a0aec0" },
} as const;
export type ProfileColor = keyof typeof PROFILE_COLORS;
export const PROFILE_COLOR_NAMES = Object.keys(PROFILE_COLORS) as ProfileColor[];
export const isProfileColor = (value: unknown): value is ProfileColor => typeof value === "string" && Object.prototype.hasOwnProperty.call(PROFILE_COLORS, value);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// The palette's colour closest to an instance's accent ("#RRGGBB").
export function nearestColor(accent: unknown): ProfileColor | null {
  if (typeof accent !== "string" || !/^#[0-9a-f]{6}$/i.test(accent)) return null;
  const [r, g, b] = rgb(accent);
  let best: ProfileColor | null = null,
    distance = Infinity;
  for (const name of PROFILE_COLOR_NAMES) {
    const [r2, g2, b2] = rgb(PROFILE_COLORS[name].light);
    // Weighted for the eye ("redmean").
    const mean = (r + r2) / 2;
    const d = (2 + mean / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - mean) / 256) * (b - b2) ** 2;
    if (d < distance) {
      distance = d;
      best = name;
    }
  }
  return best;
}

// The colour of a profile's dot: the chosen one; otherwise the one nearest
// its instance's accent (once the widgets have seen it), otherwise one by
// position, so that neighbours differ.
export function profileColor(state: ProfileState, id: string, accent?: string | null): ProfileColor {
  const index = Math.max(0, state.profiles.findIndex((p) => p.id === id));
  const profile = state.profiles[index];
  if (profile?.color) return profile.color;
  return nearestColor(accent) || PROFILE_COLOR_NAMES[index % PROFILE_COLOR_NAMES.length];
}

// null: back to the derived colour.
export function setProfileColor(state: ProfileState, id: string, color: ProfileColor | null): ProfileState {
  if (!state.profiles.some((p) => p.id === id)) throw new ProfileError("unknown");
  return {
    ...state,
    profiles: state.profiles.map((p) => {
      if (p.id !== id) return p;
      const { color: _old, ...rest } = p;
      return color && isProfileColor(color) ? { ...rest, color } : rest;
    }),
  };
}
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
// push / livePush: the profile's registration with the push relay and its
// Live Activities' (push-relay.ts); widgetPush: its widgets' (iOS 26,
// widget-push.ts). deviceToken and widgetPush stay while another profile is
// active – that profile's widgets keep working (#widgets 2026); what only
// the active profile has (ACTIVE_ONLY_KEYS) goes with every switch.
// pushOff: the instance still has to hear that this phone, now on another
// profile, wants no pushes from it (App.tsx → deactivate; sent again until
// it answered).
export const PROFILE_KEYS = ["deviceToken", "summary", "adminSummary", "push", "livePush", "widgetPush", "pushOff"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];
export const ACTIVE_ONLY_KEYS: readonly ProfileKey[] = ["summary", "adminSummary", "push", "livePush"];
export function profileKey(id: string, key: ProfileKey) {
  if (!ID.test(id)) throw new ProfileError("invalid");
  return `flowplan.profile.${id}.${key}`;
}
// What the app remembers of a profile across switches (PROFILE_KEYS go with
// every switch), gone only with the profile: the person's "Animations" as
// the page reported it (motion.ts), whether offline use was offered here
// (offline-offer.ts) and, on Android, what the page last said about its copy.
// accent: the instance's accent as its widgets last saw it (the default of
// the profile's colour dot, profileColor).
export const LASTING_KEYS = ["motion", "offlineOffer", "offlineInfo", "accent"] as const;
export type LastingKey = (typeof LASTING_KEYS)[number];
export function lastingKey(id: string, key: LastingKey) {
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
    profiles.push({ id: entry.id, name: cleanName(entry.name, server), server, ...(isProfileColor(entry.color) ? { color: entry.color } : {}) });
    if (profiles.length >= MAX_PROFILES) break;
  }
  const active = profiles.find((p) => p.id === data.active) ?? profiles[0] ?? null;
  return { profiles, active: active?.id ?? null };
}

export const serializeProfiles = (state: ProfileState) =>
  JSON.stringify({ profiles: state.profiles.map(({ id, name, server, color }) => ({ id, name, server, ...(color ? { color } : {}) })), active: state.active });

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

// Gives a profile another address (one that never signed in and has the
// wrong one, #69): a new profile in its place, active – with a new id, so
// nothing the app kept for the old address goes along. An address that
// already has another profile is refused with that profile.
export function replaceProfile(
  state: ProfileState,
  id: string,
  input: { name?: string; server: string },
  newProfileId = newId(),
): { state: ProfileState; profile: Profile; previous: Profile } {
  const index = state.profiles.findIndex((p) => p.id === id);
  if (index < 0) throw new ProfileError("unknown");
  const server = originOf(input.server);
  if (!server || server !== input.server) throw new ProfileError("invalid");
  const existing = findByServer(state, server);
  if (existing && existing.id !== id) throw new ProfileError("duplicate", existing);
  let next = newProfileId;
  while (!ID.test(next) || state.profiles.some((p) => p.id === next)) next = newId();
  const profile = { id: next, name: cleanName(input.name, server), server };
  const profiles = state.profiles.map((p, i) => (i === index ? profile : p));
  return { state: { profiles, active: next }, profile, previous: state.profiles[index] };
}

// The name to offer when the address changes: a name of its own stays, the
// host (the name an empty field gives) goes with the address.
export const ownName = (profile: Profile) => (profile.name === hostOf(profile.server) ? "" : profile.name);

// The profiles that have been signed in on this phone at least once (their
// ids, kept apart from PROFILE_KEYS, which go on every switch). One that
// never was can get another address or go from the profile screen (#69).
export const SIGNED_IN_KEY = "flowplan.signedInProfiles";
export function parseSignedIn(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === "string" && ID.test(id)))].slice(0, MAX_PROFILES * 2) : [];
  } catch {
    return [];
  }
}
export function withSignedIn(list: string[], id: string, signedIn: boolean): string[] {
  if (!ID.test(id)) return list;
  const rest = list.filter((entry) => entry !== id);
  return signedIn ? [...rest, id].slice(-MAX_PROFILES * 2) : rest;
}
