// The profile screen (screens/Setup.tsx) from inside the instance's page
// (#69): the sign-in pages' "Other server? Switch profile" calls
// window.FlowplanApp.openProfiles (bridge-script.ts) – older apps get there
// through the link flowplan://change-server, which every version opens.
// Cancel comes back to the page that asked; a profile that was never signed
// in can get another address or go. Pure functions, tested in
// test/profile-picker.test.ts.
import { activeProfile, type Profile, type ProfileState } from "./profiles";
import { safePath } from "./navigation";

const MAX_PATH = 2048;

// What the page asked for: the profile screen, and the page to come back to
// (only a path of the instance; the start page needs none – it is where the
// window goes anyway). Anything else is not a request.
export function profilesRequest(message: unknown): { path: string | null } | null {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "openProfiles") return null;
  const raw = (message as { path?: unknown }).path;
  const path = typeof raw === "string" && raw.length <= MAX_PATH ? safePath(raw) : null;
  return { path: path && path !== "/" ? path : null };
}

// The active profile when it has never been signed in on this phone: the
// profile screen offers to change its address or remove it.
export function unsignedProfile(state: ProfileState, everSignedIn: (id: string) => boolean): Profile | null {
  const profile = activeProfile(state);
  return profile && !everSignedIn(profile.id) ? profile : null;
}
