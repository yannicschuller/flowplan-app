// What a window on the instance (screens/Shell.tsx) does on the iPad
// (modules/flowplan-ipad, decisions in ipad.ts):
//
// - the page's keyboard shortcuts as key commands of this window, listed in
//   the overlay that holding ⌘ shows, and run in this window's page;
// - Handoff: the page this window shows, while it is in front of the lock
//   and the app settings;
// - "Open in new window" (FlowplanApp.openWindow, links with target=_blank
//   to the instance): a window of its own next to this one.
//
// On the iPhone the shortcuts and Handoff work the same (with a keyboard,
// from the iPhone to the Mac); Android has none of it.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Linking } from "react-native";
import {
  addContinuePageListener,
  addKeyCommandListener,
  consumeContinuedPage,
  openWindow,
  setKeyCommands,
  setWindowPage,
  supportsWindows,
  type KeyCommand,
} from "../modules/flowplan-ipad/src";
import { handoffPage, handoffTarget, keyCommandsFrom, shortcutScript } from "./ipad";
import type { ProfileState } from "./profiles";
import { originOf } from "./server";
import { useAppWindowContext, windows } from "./windows";

export function useWindowFeatures({ run, server, active }: { run: (script: string) => void; server: string; active: boolean }) {
  const appWindow = useAppWindowContext();
  const multiple = useMemo(supportsWindows, []);
  const commands = useRef<KeyCommand[]>([]);
  const page = useRef<{ url: string; title: string } | null>(null);
  const state = useRef({ active, main: appWindow.main });
  state.current = { active, main: appWindow.main };

  const publishPage = useCallback(() => {
    const { active, main } = state.current;
    setWindowPage(appWindow.scene, active && page.current ? { ...page.current, restore: !main } : null);
  }, [appWindow.scene]);
  const publishCommands = useCallback(() => {
    setKeyCommands(appWindow.scene, state.current.active ? commands.current : []);
  }, [appWindow.scene]);

  useEffect(() => {
    publishPage();
    publishCommands();
  }, [active, appWindow.main, publishPage, publishCommands]);
  // Another instance: nothing of the previous one's page stays.
  useEffect(() => {
    page.current = null;
    commands.current = [];
    publishPage();
    publishCommands();
  }, [server, publishPage, publishCommands]);
  useEffect(
    () => () => {
      setWindowPage(appWindow.scene, null);
      setKeyCommands(appWindow.scene, []);
    },
    [appWindow.scene],
  );

  // A key command pressed in this window (or, without window ids, in the
  // main window).
  useEffect(() => {
    const subscription = addKeyCommandListener((scene, action) => {
      const mine = appWindow.scene ? scene === appWindow.scene : state.current.main;
      if (mine && state.current.active) run(shortcutScript(action));
    });
    return () => subscription.remove();
  }, [appWindow.scene, run]);

  return {
    windows: multiple,
    main: appWindow.main,
    // The page shown now (onNavigationStateChange).
    page: (url: string, title: string | undefined) => {
      windows.setUrl(appWindow.id, url);
      const next = handoffPage(url, server, title);
      if (next?.url === page.current?.url && next?.title === page.current?.title) return;
      page.current = next;
      publishPage();
    },
    shortcuts: (list: unknown) => {
      commands.current = keyCommandsFrom(list);
      publishCommands();
    },
    // True when a new window opens for the address.
    openWindow: (url: string) => {
      if (!multiple || originOf(url) !== server) return false;
      openWindow(url, appWindow.scene);
      return true;
    },
  };
}

// Handoff into the app (main window, App.tsx): pages from the Mac or
// another device – the one that started the app and those that follow.
// Pages of an instance without a profile open in the browser.
export function useHandoff(profiles: () => ProfileState, open: (target: { profileId: string; path: string }) => void) {
  const handler = useRef(open);
  handler.current = open;
  useEffect(() => {
    const take = (url: string) => {
      const target = handoffTarget(url, profiles());
      if (target) handler.current(target);
      else if (/^https:\/\//i.test(url)) void Linking.openURL(url).catch(() => {});
    };
    const waiting = consumeContinuedPage();
    if (waiting) take(waiting);
    const subscription = addContinuePageListener(take);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
