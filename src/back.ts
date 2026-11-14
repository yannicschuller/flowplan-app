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

// What the swipe from the left edge does, as the page reports it
// (FlowplanApp.edgeSwipe; "Wischen vom linken Rand" in Flowplan's settings,
// lib/edge-swipe.ts there, #285): "drawer" – the page opens its sidebar
// from the very edge: on iOS the app's back swipe stays off, on Android a
// strip of the left edge is kept from the system's back gesture
// (edgeExclusion); "back" – the app's back swipe (iOS) or the system's back
// gesture (Android) as before. null: nothing reported (an instance from
// before the choice, or a new document that has not reported yet) – as
// before.
export type EdgeSwipeMode = "drawer" | "back";

export function parseEdgeSwipeMode(value: unknown): EdgeSwipeMode | null {
  return value === "drawer" || value === "back" ? value : null;
}

// What the page reported. On Android only a page that offers the choice
// there too says so ({ android: true }, Flowplan newer than 0.9.6): an older
// instance reports "drawer" by default, but its settings show the choice
// only on iOS – excluding the edge there would leave no way back to the
// system's back gesture. Such a report counts as nothing reported.
export function pageEdgeOf(platform: string, message: { mode: unknown; android?: unknown }): EdgeSwipeMode | null {
  if (platform === "android" && message.android !== true) return null;
  return parseEdgeSwipeMode(message.mode);
}

// Whether the app's own swipe from the left edge (modules/flowplan-native)
// is on: in the window in front, with a step back, online – and not when the
// page wants the edge for its sidebar. Back stays in the page's arrows.
export function edgeSwipeBack(state: { active: boolean; backable: boolean; offline: boolean; pageEdge: EdgeSwipeMode | null }): boolean {
  return state.active && state.backable && !state.offline && state.pageEdge !== "drawer";
}

// Android: whether a strip of the left edge is kept from the system's back
// gesture so the swipe reaches the page and opens its sidebar
// (modules/flowplan-android setLeftEdgeExclusion) – in the window in front,
// online, and only when the page asked for the edge. The right edge, the
// rest of the left one and the back button stay the system's back.
export function edgeExclusion(state: { active: boolean; offline: boolean; pageEdge: EdgeSwipeMode | null }): boolean {
  return state.active && !state.offline && state.pageEdge === "drawer";
}
