// The offline copies on this device (iOS; src/offline/store.ts), one per
// profile, in the files of modules/flowplan-native.
import { sha256Hex } from "../sha256";
import { offlineFileSystem } from "../../modules/flowplan-native/src";
import { OfflineCopy, wipeProfile } from "./store";

const copies = new Map<string, OfflineCopy>();
const sha256 = (key: string) => sha256Hex(key);

// Whether this app keeps copies itself (iOS builds with the files).
export const offlineCopiesAvailable = () => !!offlineFileSystem();

export function offlineCopy(profile: string): OfflineCopy | null {
  const files = offlineFileSystem();
  if (!files) return null;
  let copy = copies.get(profile);
  if (!copy) {
    try {
      copy = new OfflineCopy(profile, files, sha256);
    } catch {
      return null;
    }
    copies.set(profile, copy);
  }
  return copy;
}

// The profile was removed (or signed out of in the app): its copy goes.
export async function wipeOfflineCopy(profile: string) {
  const files = offlineFileSystem();
  const copy = copies.get(profile);
  copies.delete(profile);
  try {
    if (copy) await copy.wipe();
    else if (files) await wipeProfile(files, profile);
  } catch {}
}

// Copies of profiles that no longer exist (removed while a write ran).
export async function wipeOrphanCopies(profiles: string[]) {
  const files = offlineFileSystem();
  if (!files) return;
  try {
    for (const name of await files.list(""))
      if (!profiles.includes(name)) await wipeOfflineCopy(name);
  } catch {}
}
