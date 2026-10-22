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
