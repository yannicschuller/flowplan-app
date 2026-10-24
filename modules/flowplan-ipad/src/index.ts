// The iPad's windows, hardware keyboard and Handoff (Swift in ios/). Every
// function does nothing where the module is missing (Android, an older
// build).
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

// One key command: what the page calls the action, the title in the
// overlay that holding ⌘ shows, the key ("k", "/", "up", "f5" …) and the
// modifiers. hidden: works, but is not listed (a second combination).
export type KeyCommand = {
  action: string;
  title: string;
  input: string;
  modifiers: ("command" | "alternate" | "control" | "shift")[];
  hidden?: boolean;
};

export type WindowPage = { url: string; title?: string; restore?: boolean };

type NativeModule = {
  multipleScenes?(): boolean;
  windowsAvailable?(scene: string | null): Promise<boolean>;
  consumeContinuedPage?(): string | null;
  openWindow?(url: string, scene: string | null): void;
  setPage?(scene: string | null, page: WindowPage | null): void;
  setKeyCommands?(scene: string | null, commands: KeyCommand[]): void;
  addListener(event: "onKeyCommand", listener: (event: { scene: string; action: string }) => void): EventSubscription;
  addListener(event: "onContinuePage", listener: () => void): EventSubscription;
  addListener(event: "onWindowRefused", listener: (event: { scene: string; url: string }) => void): EventSubscription;
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("FlowplanIPad") : null;
const none = { remove() {} };

// Whether the app may open more windows at all (multiple scenes in its
// Info.plist; no idiom check: iPhone Duo has them too). Whether a window can
// open one right now: windowsAvailable.
export function supportsWindows(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return native?.multipleScenes?.() === true;
  } catch {
    return false;
  }
}

// Whether this window can open another one now: an iPad, or an iPhone with
// several windows whose window is wide (the inner display of iPhone Duo).
// Changes when the window does (asked again after every resize).
export async function windowsAvailable(scene: string | null): Promise<boolean> {
  if (Platform.OS !== "ios" || !native?.windowsAvailable) return false;
  try {
    return (await native.windowsAvailable(scene)) === true;
  } catch {
    return false;
  }
}

export function openWindow(url: string, scene: string | null) {
  try {
    native?.openWindow?.(url, scene);
  } catch {}
}

// The page of a window for Handoff (null: nothing to hand over).
export function setWindowPage(scene: string | null, page: WindowPage | null) {
  try {
    native?.setPage?.(scene, page);
  } catch {}
}

export function setKeyCommands(scene: string | null, commands: KeyCommand[]) {
  try {
    native?.setKeyCommands?.(scene, commands);
  } catch {}
}

// UIKit opened no window for the address (none possible right now): the
// window that asked shows it itself.
export function addWindowRefusedListener(listener: (scene: string, url: string) => void) {
  if (!native) return none;
  return native.addListener("onWindowRefused", ({ scene, url }) => listener(scene, url));
}

export function addKeyCommandListener(listener: (scene: string, action: string) => void) {
  if (!native) return none;
  return native.addListener("onKeyCommand", ({ scene, action }) => listener(scene, action));
}

// A page handed over from the Mac or another device (Handoff): the one
// waiting, and later ones as they come.
export function consumeContinuedPage(): string | null {
  try {
    return native?.consumeContinuedPage?.() ?? null;
  } catch {
    return null;
  }
}
export function addContinuePageListener(listener: (url: string) => void) {
  if (!native) return none;
  return native.addListener("onContinuePage", () => {
    const url = consumeContinuedPage();
    if (url) listener(url);
  });
}
