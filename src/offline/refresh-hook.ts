// The background task (src/native/background.ts) asks the open window to
// bring its offline copy up to date – iOS may not let the web view run in
// the background; then the next foreground does it.
let hook: (() => void) | null = null;
export function setOfflineRefreshHook(next: (() => void) | null) {
  hook = next;
}
export function requestOfflineRefresh() {
  try {
    hook?.();
  } catch {}
}
