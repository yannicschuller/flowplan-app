// What "back" does in the window on the instance – the swipe from the left
// edge on iOS (modules/flowplan-native), the back button and gesture on
// Android. The web view's history is not it: Flowplan is one page with hash
// routes, so the history holds replaced filters and sign-in redirects but
// nothing of open dialogs. Instances that know (window.FlowplanNavigation,
// lib/app-back.ts in Flowplan) take back themselves and report whether there
// is a step back; older ones get the history.
export type BackState = {
  // On the offline page there is no back in the page.
  offline: boolean;
  // A page of the instance is shown (not the identity provider's).
  onServer: boolean;
  // What the page last reported (backState); null: nothing yet, e.g. an
  // older instance or the sign-in page.
  pageCanGoBack: boolean | null;
  // The web view's own history.
  historyCanGoBack: boolean;
};

// page: ask the page; history: the web view goes back; system: back is not
// the app's (Android leaves the app, iOS offers no gesture).
export type BackAction = "page" | "history" | "system";

export function backAction(state: BackState): BackAction {
  if (state.offline) return "system";
  if (state.onServer && state.pageCanGoBack !== null) return state.pageCanGoBack ? "page" : "system";
  return state.historyCanGoBack ? "history" : "system";
}

// The page's answer to backScript: done, or what comes instead.
export function afterAnswer(handled: boolean | null, historyCanGoBack: boolean): "done" | "history" | "system" {
  if (handled === true) return "done";
  if (handled === null && historyCanGoBack) return "history";
  return "system";
}

// The predictive back gesture on Android (modules/flowplan-android): its
// progress goes to the page (backProgressScript, FlowplanNavigation.
// backProgress in Flowplan's lib/app-back.ts), which shows what back will
// close; "commit" is the back itself.
export type BackPhase = "start" | "progress" | "cancel" | "commit";
export type BackProgress = { phase: BackPhase; progress: number; edge: "left" | "right" };
const PHASES: readonly BackPhase[] = ["start", "progress", "cancel", "commit"];

// The native event, checked: a known phase, progress 0–1, a known edge.
export function parseBackProgress(event: unknown): BackProgress | null {
  if (!event || typeof event !== "object") return null;
  const { phase, progress, edge } = event as Record<string, unknown>;
  if (typeof phase !== "string" || !PHASES.includes(phase as BackPhase)) return null;
  const value = typeof progress === "number" && Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return { phase: phase as BackPhase, progress: Math.round(value * 1000) / 1000, edge: edge === "right" ? "right" : "left" };
}

// Whether the page gets the gesture: only when back is the page's own step.
export function previewsBack(state: BackState): boolean {
  return backAction(state) === "page";
}
