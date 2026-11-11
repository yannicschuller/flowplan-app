// Opening the instance's page (#203): until it is there, the window shows
// "Connecting to …" instead of an empty web view. Next to the web view the
// app asks the instance's health check, which ends after a few seconds on its
// own: on a network that cannot reach the instance (a guest or IoT Wi-Fi, no
// VPN) a connection often hangs instead of failing, and the web view would
// stay empty for a minute or more.
//
// - The page loads (or the web view fails, which has its own handling): done.
// - The instance answers the health check: the page is on its way; only if it
//   is still not there after LOAD_LIMIT_MS does the app give up.
// - It does not answer (an error at once, or nothing within PROBE_TIMEOUT_MS):
//   the stored copy, or the offline screen. On Android the app waits
//   ANDROID_GRACE_MS longer: there the page's service worker answers from its
//   copy when the network fails, and that page is better than the screen.
//
// Pure: the window (screens/Shell.tsx) feeds in the events and the time.

export const PROBE_TIMEOUT_MS = 6000;
export const ANDROID_GRACE_MS = 2000;
export const LOAD_LIMIT_MS = 30_000;

export type ConnectPlatform = "ios" | "android" | string;

export type Connect = {
  phase: "connecting" | "done" | "fallback";
  probe: "pending" | "answered" | "failed";
  startedAt: number;
  // When the health check failed (or timed out).
  failedAt: number | null;
};

export type ConnectEvent =
  // The page (or another page the window shows) has loaded, or the web view
  // reported its own failure and handles it.
  | { type: "settled" }
  | { type: "probe"; answered: boolean; at: number }
  | { type: "tick"; at: number };

export function startConnect(at: number): Connect {
  return { phase: "connecting", probe: "pending", startedAt: at, failedAt: null };
}

function failed(state: Connect, at: number, platform: ConnectPlatform): Connect {
  const next: Connect = { ...state, probe: "failed", failedAt: at };
  return platform === "android" ? next : { ...next, phase: "fallback" };
}

export function connectStep(state: Connect, event: ConnectEvent, platform: ConnectPlatform): Connect {
  if (state.phase !== "connecting") return state;
  if (event.type === "settled") return { ...state, phase: "done" };
  if (event.type === "probe") {
    // A late answer after the check already counted as failed changes nothing.
    if (state.probe !== "pending") return state;
    if (event.answered) return { ...state, probe: "answered" };
    state = failed(state, event.at, platform);
    return connectStep(state, { type: "tick", at: event.at }, platform);
  }
  // tick
  if (state.probe === "pending" && event.at >= state.startedAt + PROBE_TIMEOUT_MS) {
    state = failed(state, state.startedAt + PROBE_TIMEOUT_MS, platform);
    if (state.phase !== "connecting") return state;
  }
  if (state.probe === "failed" && state.failedAt !== null && event.at >= state.failedAt + ANDROID_GRACE_MS) return { ...state, phase: "fallback" };
  if (state.probe === "answered" && event.at >= state.startedAt + LOAD_LIMIT_MS) return { ...state, phase: "fallback" };
  return state;
}

// When the next tick is due (a time like `at`), or null when nothing waits.
export function nextTick(state: Connect): number | null {
  if (state.phase !== "connecting") return null;
  if (state.probe === "pending") return state.startedAt + PROBE_TIMEOUT_MS;
  if (state.probe === "failed") return (state.failedAt ?? state.startedAt) + ANDROID_GRACE_MS;
  return state.startedAt + LOAD_LIMIT_MS;
}

// The offline screen keeps trying in the background: soon at first, then
// less often (every half minute at most).
const RETRY_STEPS = [5000, 10_000, 20_000, 30_000];
export function retryDelay(attempt: number) {
  return RETRY_STEPS[Math.min(Math.max(0, attempt), RETRY_STEPS.length - 1)];
}
