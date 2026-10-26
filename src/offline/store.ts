// The offline copy of one profile's instance on the device (iOS): the
// caches the page fills through the bridge (lib/offline-store.ts in
// Flowplan; Cache Storage in a browser), kept as files in the app's
// container – modules/flowplan-native's FlowplanOfflineFiles writes them
// with "complete until first user authentication" protection, excluded from
// backups. Per profile one folder; removing the profile removes it.
//
//   <profile>/<cache>/index.json   key → status, headers, size, file
//   <profile>/<cache>/<sha256(key)>.b   the body
//
// The index is written after the body, so a body without an entry (an
// interrupted write) is removed the next time the cache is read, and an
// entry without its body is forgotten. Every write goes through
// src/offline/policy.ts.
import { DATA_CACHE, MARKER_KEY, SETTINGS_CACHE, base64Bytes, cacheKind, checkEntry, cleanKey, estimate, lookupAllowed, MAX_PROFILE, DISK_RESERVE, type Entry, type Refusal } from "./policy";

export interface OfflineFiles {
  // Paths are relative to the copies' folder; null: no such file.
  read(path: string): Promise<string | null>;
  write(path: string, base64: string): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  // A file or a folder with everything in it; missing is fine.
  remove(path: string): Promise<void>;
  // Names in a folder (none when it is missing).
  list(path: string): Promise<string[]>;
  // Free bytes on the device.
  available(): Promise<number>;
}

type Meta = { status: number; statusText: string; headers: [string, string][]; size: number; file: string; at: number };
type CacheState = {
  name: string;
  entries: Map<string, Meta>;
  dirty: boolean;
  writing: Promise<void> | null;
  removed: boolean;
  // Writes of one cache one after another.
  queue: Promise<unknown>;
};

const PROFILE = /^[a-z0-9]{1,32}$/;
const INDEX = "index.json";

export type StoredEntry = Entry;
export type CopyState = {
  enabled: boolean;
  // The marker the page wrote (components/offline.ts OfflineMarker).
  marker: Record<string, unknown> | null;
  // The app's page is stored: the copy can be opened without a connection.
  page: boolean;
  bytes: number;
};

export class OfflineCopy {
  private caches = new Map<string, Promise<CacheState>>();

  constructor(
    readonly profile: string,
    private files: OfflineFiles,
    private hash: (key: string) => Promise<string>,
    private now: () => number = Date.now,
  ) {
    if (!PROFILE.test(profile)) throw new Error("invalid profile");
  }

  private dir(name: string) {
    return `${this.profile}/${name}`;
  }

  private cache(name: string): Promise<CacheState> {
    let state = this.caches.get(name);
    if (!state) {
      state = this.load(name);
      this.caches.set(name, state);
    }
    return state;
  }

  private async load(name: string): Promise<CacheState> {
    const state: CacheState = { name, entries: new Map(), dirty: false, writing: null, removed: false, queue: Promise.resolve() };
    const listed = new Set(await this.files.list(this.dir(name)).catch(() => [] as string[]));
    let raw: { entries?: Record<string, Meta> } | null = null;
    try {
      raw = JSON.parse((await this.files.readText(`${this.dir(name)}/${INDEX}`)) || "null");
    } catch {}
    const kept = new Set<string>();
    for (const [key, meta] of Object.entries(raw?.entries || {})) {
      if (!meta || typeof meta.file !== "string" || !listed.has(meta.file) || cleanKey(key) !== key) continue;
      state.entries.set(key, meta);
      kept.add(meta.file);
    }
    // Bodies of interrupted writes.
    for (const file of listed) if (file !== INDEX && !kept.has(file)) await this.files.remove(`${this.dir(name)}/${file}`).catch(() => {});
    return state;
  }

  private flush(state: CacheState): Promise<void> {
    state.dirty = true;
    if (!state.writing)
      state.writing = (async () => {
        while (state.dirty && !state.removed) {
          state.dirty = false;
          await this.files.writeText(`${this.dir(state.name)}/${INDEX}`, JSON.stringify({ v: 1, entries: Object.fromEntries(state.entries) }));
        }
      })().finally(() => {
        state.writing = null;
      });
    return state.writing;
  }

  async names(): Promise<string[]> {
    const listed = await this.files.list(this.profile).catch(() => [] as string[]);
    return listed.filter((name) => cacheKind(name)).sort();
  }

  async keys(cache: string): Promise<string[]> {
    if (!cacheKind(cache)) return [];
    return [...(await this.cache(cache)).entries.keys()];
  }

  async match(cache: string | null, key: string): Promise<Entry | null> {
    if (cache === null) {
      if (!lookupAllowed(key)) return null;
      // The current files first: the data and settings caches, then the
      // builds (newest names last – any holds the same bytes).
      for (const name of await this.names()) {
        const hit = await this.match(name, key);
        if (hit) return hit;
      }
      return null;
    }
    if (!cacheKind(cache) || cleanKey(key) !== key) return null;
    const state = await this.cache(cache);
    const meta = state.entries.get(key);
    if (!meta) return null;
    const body = await this.files.read(`${this.dir(cache)}/${meta.file}`).catch(() => null);
    if (body === null) {
      state.entries.delete(key);
      void this.flush(state).catch(() => {});
      return null;
    }
    return { status: meta.status, statusText: meta.statusText, headers: meta.headers, body };
  }

  // Whether a key is stored, without reading its body.
  async has(cache: string | null, key: string): Promise<boolean> {
    if (cache === null) {
      if (!lookupAllowed(key)) return false;
      for (const name of await this.names()) if (await this.has(name, key)) return true;
      return false;
    }
    if (!cacheKind(cache) || cleanKey(key) !== key) return false;
    return (await this.cache(cache)).entries.has(key);
  }

  async usage(): Promise<number> {
    let total = 0;
    for (const name of await this.names()) for (const meta of (await this.cache(name)).entries.values()) total += meta.size;
    return total;
  }

  async estimate() {
    return estimate(await this.usage(), await this.files.available().catch(() => 0));
  }

  // true when kept; otherwise why not.
  async put(cache: string, key: string, input: unknown): Promise<true | Refusal | "full"> {
    const checked = checkEntry(cache, key, input);
    if ("refused" in checked) return checked.refused;
    const { entry } = checked;
    const size = base64Bytes(entry.body);
    const state = await this.cache(cache);
    const run = state.queue.then(async () => {
      const previous = state.entries.get(key)?.size || 0;
      const usage = await this.usage();
      if (usage - previous + size > MAX_PROFILE) return "full" as const;
      if ((await this.files.available().catch(() => 0)) - size < DISK_RESERVE) return "full" as const;
      const file = `${await this.hash(key)}.b`;
      if (state.removed) {
        // Removed meanwhile: a fresh cache takes it.
        return this.put(cache, key, input);
      }
      await this.files.write(`${this.dir(cache)}/${file}`, entry.body);
      state.entries.set(key, { status: entry.status, statusText: entry.statusText, headers: entry.headers, size, file, at: this.now() });
      await this.flush(state);
      return true as const;
    });
    state.queue = run.catch(() => {});
    return run;
  }

  async delete(cache: string, key: string): Promise<boolean> {
    if (!cacheKind(cache) || cleanKey(key) !== key) return false;
    const state = await this.cache(cache);
    const run = state.queue.then(async () => {
      const meta = state.entries.get(key);
      if (!meta) return false;
      state.entries.delete(key);
      await this.flush(state);
      await this.files.remove(`${this.dir(cache)}/${meta.file}`).catch(() => {});
      return true;
    });
    state.queue = run.catch(() => {});
    return run;
  }

  async remove(cache: string): Promise<boolean> {
    if (!cacheKind(cache)) return false;
    const existed = (await this.names()).includes(cache);
    const state = this.caches.get(cache);
    this.caches.delete(cache);
    if (state) {
      const loaded = await state;
      loaded.removed = true;
      await loaded.writing?.catch(() => {});
    }
    await this.files.remove(this.dir(cache));
    return existed;
  }

  // Everything of this profile (the profile was removed or signed out).
  async wipe() {
    for (const state of this.caches.values()) (await state).removed = true;
    this.caches.clear();
    await this.files.remove(this.profile);
  }

  async state(): Promise<CopyState> {
    const markerEntry = await this.match(SETTINGS_CACHE, MARKER_KEY);
    let marker: Record<string, unknown> | null = null;
    try {
      marker = markerEntry ? (JSON.parse(atob(markerEntry.body)) as Record<string, unknown>) : null;
    } catch {}
    const page = (await this.keys(DATA_CACHE)).includes("/");
    return { enabled: !!marker, marker, page: !!marker && page, bytes: await this.usage() };
  }
}

// Removes a profile's copy without opening it (profile removed).
export async function wipeProfile(files: OfflineFiles, profile: string) {
  if (PROFILE.test(profile)) await files.remove(profile);
}
