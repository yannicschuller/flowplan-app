// The motion of the app's own screens now (src/motion.ts): the system's
// "Reduce motion" (AccessibilityInfo, and its change) and the active
// profile's "Animations" in Flowplan as its page reported it, kept per
// profile so the next start (the "Connecting" cover, the sheets) follows it
// before the page is there.
import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { effectiveMotion, parseMotion, type Motion } from "../motion";
import { store } from "../store";
import { setEdgeSwipeMotion } from "../../modules/flowplan-native/src";

let systemReduce = false;
let pref: Motion | null = null;
let profile: string | null = null;
let started = false;
const listeners = new Set<() => void>();

export const currentMotion = (): Motion => effectiveMotion(pref, systemReduce);

let last: Motion | null = null;
function changed() {
  const now = currentMotion();
  if (now === last) return;
  last = now;
  // The iOS edge swipe's chevron (modules/flowplan-native).
  setEdgeSwipeMotion(now);
  for (const listener of listeners) listener();
}

function start() {
  if (started) return;
  started = true;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => {
      systemReduce = on === true;
      changed();
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
    systemReduce = on === true;
    changed();
  });
}

// The active profile (App.tsx): its remembered choice applies.
export function setMotionProfile(id: string | null) {
  start();
  profile = id;
  pref = id ? store.motion(id) : null;
  changed();
}

// The page of a profile reported the person's choice (bridge-script.ts).
export function reportMotion(id: string | null, value: unknown) {
  const motion = parseMotion(value);
  if (!id || !motion) return;
  if (store.motion(id) !== motion) store.setMotion(id, motion);
  if (id === profile && pref !== motion) {
    pref = motion;
    changed();
  }
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMotion(): Motion {
  return useSyncExternalStore(subscribe, currentMotion, currentMotion);
}
