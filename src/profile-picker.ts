// The profile screen (screens/Setup.tsx) from inside the instance's page
// (#69): the sign-in pages' "Other server? Switch profile" calls
// window.FlowplanApp.openProfiles (bridge-script.ts) – older apps get there
// through the link flowplan://change-server, which every version opens.
// Cancel comes back to the page that asked; a profile that was never signed
// in can get another address or go. Below: the profile switcher, the quick
// sheet. Pure functions, tested in test/profile-picker.test.ts and
// test/profile-switcher.test.ts.
import type { KeyCommand } from "../modules/flowplan-ipad/src";
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

// The profile switcher (screens/ProfileSwitcher.tsx): the app's own sheet of
// its profiles – Flowplan's "Instanz wechseln …" in the workspace menu and a
// long press on the own account row (window.FlowplanApp.openProfileSwitcher),
// the icon's quick action "Switch profile" and ⇧⌘P on a hardware keyboard.
// The page asks with nothing and hears nothing back: it never learns the
// names or addresses of the person's other instances.
//
// The page's request counts only with the token of the bridge the app put
// into its top frame (bridge-script.ts): every frame can post messages to
// the app (Android's interface, WebKit's message handlers), only the top
// frame's bridge knows the token.
export function switcherRequest(message: unknown, token: string): boolean {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "openProfileSwitcher") return false;
  return token.length >= 16 && (message as { token?: unknown }).token === token;
}

// When a page's request opens the sheet: one sheet at a time, only while the
// window is in front (no setup, app settings or app lock over it), and not
// again right after one was closed – a page cannot keep it open. The app's
// own ways (quick action, ⇧⌘P) skip the pause.
// Android's shortcut "Switch profile" opens it with this link (older apps
// open their profile screen with flowplan://change-server).
export const SWITCHER_LINK = "flowplan://switch-profile";
export const SWITCHER_PAUSE_MS = 800;
export function mayOpenSwitcher(state: { open: boolean; front: boolean; closedAt: number; now: number; fromPage: boolean }): boolean {
  if (state.open) return false;
  if (!state.fromPage) return true;
  return state.front && !(state.now - state.closedAt < SWITCHER_PAUSE_MS && state.now >= state.closedAt);
}

// What a tap in the sheet does: another profile switches (App.tsx switchTo:
// push and widgets leave the old instance, the web view keeps its sign-in,
// the new one registers); the active one, or one gone meanwhile, only closes.
export function switcherChoice(state: ProfileState, id: string): { switchTo: string } | null {
  return id !== state.active && state.profiles.some((profile) => profile.id === id) ? { switchTo: id } : null;
}

// ⇧⌘P on a hardware keyboard (iPad, iPhone): the app's own key command next
// to the page's shortcuts (ipad.ts keyCommandsFrom). A page shortcut on the
// same keys, or with the same action name, gives way.
export const SWITCHER_ACTION = "appProfileSwitcher";
export function withSwitcherCommand(commands: KeyCommand[], title: string): KeyCommand[] {
  const own: KeyCommand = { action: SWITCHER_ACTION, title, input: "p", modifiers: ["command", "shift"] };
  const sameKeys = (command: KeyCommand) => command.input === own.input && [...command.modifiers].sort().join("+") === own.modifiers.join("+");
  return [...commands.filter((command) => command.action !== SWITCHER_ACTION && !sameKeys(command)).slice(0, MAX_KEY_COMMANDS - 1), own];
}
const MAX_KEY_COMMANDS = 40;
