// How much the app's own screens move (#260): the system's "Reduce motion"
// always, and the person's "Animations" in Flowplan (Normal / Reduced / Off,
// lib/motion-pref.ts there) as the page reports it – data-motion on <html>
// (src/bridge-script.ts), remembered per profile. The system's setting wins,
// as in the web app: with it, nothing moves.
//
//   normal  – the app as it was: sheets slide in, spinners turn.
//   reduced – short fades only: sheets fade, no spinners, no sliding.
//   off     – nothing animates: sheets appear, no spinners, no fades.
// Pure – src/native/motion.ts hands in the system and the store.
export const MOTIONS = ["normal", "reduced", "off"] as const;
export type Motion = (typeof MOTIONS)[number];

// A value the page reported; null for anything else (no answer, an
// unknown word) – the remembered choice then stays.
export function parseMotion(value: unknown): Motion | null {
  return value === "normal" || value === "reduced" || value === "off" ? value : null;
}

export function effectiveMotion(pref: Motion | null, systemReduce: boolean): Motion {
  return systemReduce ? "off" : (pref ?? "normal");
}

// React Native's Modal (the sheets: settings, capture, scan, voice note).
export function modalAnimation(motion: Motion): "slide" | "fade" | "none" {
  return motion === "normal" ? "slide" : motion === "reduced" ? "fade" : "none";
}

// A turning spinner is motion; without it the text says what happens.
export const showsSpinner = (motion: Motion) => motion === "normal";

// Fades of the app's own views (the "Connecting" cover leaving), in ms.
export function fadeDuration(motion: Motion): number {
  return motion === "normal" ? 200 : motion === "reduced" ? 120 : 0;
}

// Colour changes of the status bar follow the page with a short fade.
export const animatesStatusBar = (motion: Motion) => motion !== "off";
