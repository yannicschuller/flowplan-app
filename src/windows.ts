// The app in several windows on the iPad (Split View, Slide Over, Stage
// Manager, "Open in new window"). All windows run in one JavaScript runtime,
// each as its own root component (the app's SceneDelegate starts it with
// { flowplanWindow: { scene, url } }, plugins/with-ipad.js).
//
// The first window is the main window: setup, app settings, push, widgets,
// Live Activities and links from outside belong to it (App.tsx → Root). The
// others show a page of the active profile's instance
// (screens/PageWindow.tsx). When the main window is closed, the next one
// takes over. Profiles and the app lock are shared by all windows
// (useSharedState).
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

export type WindowProps = { flowplanWindow?: { scene?: string; url?: string } };

export function windowRegistry() {
  const open: string[] = [];
  // The address each window shows last: the page a window keeps when it
  // becomes the main window.
  const urls = new Map<string, string>();
  const listeners = new Set<() => void>();
  // Told only when the main window changes (a window that opens next to
  // it changes nothing for the others).
  const changing = (change: () => void) => {
    const before = open[0];
    change();
    if (open[0] !== before) listeners.forEach((listener) => listener());
  };
  return {
    add(id: string) {
      if (!open.includes(id)) changing(() => open.push(id));
    },
    remove(id: string) {
      urls.delete(id);
      const at = open.indexOf(id);
      if (at >= 0) changing(() => open.splice(at, 1));
    },
    main: () => open[0] ?? null,
    count: () => open.length,
    setUrl: (id: string, url: string) => void urls.set(id, url),
    url: (id: string) => urls.get(id) ?? null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const windows = windowRegistry();
let counter = 0;

export type AppWindow = { id: string; scene: string | null; main: boolean; url: string | null };
export const WindowContext = createContext<AppWindow>({ id: "window-0", scene: null, main: true, url: null });
export const useAppWindowContext = () => useContext(WindowContext);

// This window: registered while it is mounted (at once, so the first
// render already knows whether it is the main window).
export function useAppWindow(props?: WindowProps["flowplanWindow"]): AppWindow {
  const [id] = useState(() => {
    const id = props?.scene ? `scene-${props.scene}` : `window-${++counter}`;
    windows.add(id);
    return id;
  });
  useEffect(() => {
    windows.add(id);
    return () => windows.remove(id);
  }, [id]);
  const main = useSyncExternalStore(windows.subscribe, () => windows.main() === id);
  return { id, scene: props?.scene || null, main, url: windows.url(id) ?? props?.url ?? null };
}

// State all windows share (profiles, the app lock); like useState otherwise.
const shared = new Map<string, unknown>();
const sharedListeners = new Set<() => void>();
type SetShared<T> = (next: T | ((previous: T) => T)) => void;
export function useSharedState<T>(key: string, initial: () => T): [T, SetShared<T>] {
  if (!shared.has(key)) shared.set(key, initial());
  const value = useSyncExternalStore(
    (listener) => {
      sharedListeners.add(listener);
      return () => void sharedListeners.delete(listener);
    },
    () => shared.get(key) as T,
  );
  const [set] = useState<SetShared<T>>(() => (next: T | ((previous: T) => T)) => {
    const previous = shared.get(key) as T;
    const value = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
    if (Object.is(value, previous)) return;
    shared.set(key, value);
    sharedListeners.forEach((listener) => listener());
  });
  return [value, set];
}
