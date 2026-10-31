// Who keeps the page clear of the system bars (status bar, notch, home
// indicator / navigation bar): the app, with bars of its own above and below
// the web view in the page's colours ("app"), or the page itself, drawing
// edge to edge with env(safe-area-inset-*) (viewport-fit=cover, "page").
//
// iOS: the page whenever it draws edge to edge – WKWebView always reports
// the safe areas.
//
// Android: newer Android System WebViews (Chromium 136 and later) report the
// system bars as env(safe-area-inset-*) too – even with the app's bars
// around the web view, because React Native passes the window insets on
// unchanged. The page then kept clear of bars the app had already made room
// for: empty space at the top and bottom (#61 in Flowplan). So the page
// measures what its web view reports (bridge-script.ts) and gets the safe
// areas only when the web view reports the system bars where the app's
// insets say they are; otherwise the app keeps its bars and the page sets
// its own insets to zero (app/globals.css in Flowplan: the attribute
// data-app-safe-areas="page" on <html> lets them through).
export type SafeAreaMode = "app" | "page";
export type Insets = { top: number; right: number; bottom: number; left: number };

const EDGES = ["top", "right", "bottom", "left"] as const;
// CSS pixels and density-independent pixels differ by rounding only.
const TOLERANCE = 4;

// The insets the page measured, or null for anything else.
export function parseInsets(value: unknown): Insets | null {
  if (!value || typeof value !== "object") return null;
  const insets = {} as Insets;
  for (const edge of EDGES) {
    const n = (value as Record<string, unknown>)[edge];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 10000) return null;
    insets[edge] = n;
  }
  return insets;
}

export function safeAreaMode(input: {
  platform: string;
  // The page draws edge to edge (viewport-fit=cover).
  cover: boolean;
  // What the web view reports as env(safe-area-inset-*) (Android; null
  // while the page loads).
  measured: Insets | null;
  // The app's insets (react-native-safe-area-context).
  native: Insets;
  keyboard: boolean;
  previous: SafeAreaMode;
}): SafeAreaMode {
  if (!input.cover) return "app";
  if (input.platform === "ios") return "page";
  if (input.platform !== "android") return "app";
  // The keyboard changes the insets the web view reports; what holds before
  // it opened holds while it is open (the app makes room for it either way).
  if (input.keyboard) return input.previous;
  // Not measured yet (the page is still loading): as before.
  const measured = input.measured;
  if (!measured) return input.previous;
  const native = input.native;
  const edges = EDGES.filter((edge) => native[edge] > 0);
  // No system bars to keep clear of: the app's bars are empty anyway.
  if (!edges.length) return "app";
  if (input.previous === "page") {
    // While the window turns, the web view may report its new insets a
    // little after the app: the page keeps them while it gets every one.
    return edges.every((edge) => measured[edge] > 0) ? "page" : "app";
  }
  return edges.every((edge) => measured[edge] >= native[edge] - TOLERANCE) ? "page" : "app";
}
