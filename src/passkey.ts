// "Passkey hinzufügen" in Flowplan's settings (Konto → Passkeys). The web view
// offers WebAuthn only for domains built into the app, never for a
// self-hosted instance, so the passkey is made in the system's sign-in sheet –
// the same sheet as signing in with one (sign-in.ts):
//
// 1. Newer instances get a one-time link from /api/auth/passkey-app-link
//    (five minutes, once, only for this step) and call
//    FlowplanApp.addPasskey(url) (bridge-script.ts).
// 2. The app checks that the link is its instance's /passkey-add, adds its
//    callback (return=flowplan://passkey?state=<random>) and opens it in
//    ASWebAuthenticationSession (iOS, not ephemeral: the passkey goes to the
//    iCloud Keychain) or a Custom Tab (Android; Google Password Manager or
//    the chosen provider).
// 3. The page makes the passkey and goes back to flowplan://passkey?state=…
//    &status=added|cancelled|failed. iOS hands the address back directly;
//    on Android it arrives as an app link (App.tsx), and when the person
//    comes back without one (the tab closed), it counts as cancelled.
// 4. The app tells the page with the event "flowplan:passkey"; the page
//    reloads its list of passkeys.
//
// Callbacks the app did not wait for (another state, a link from outside)
// are ignored.

export const PASSKEY_CALLBACK = "flowplan://passkey";
const LIFETIME_MS = 10 * 60_000;
export type PasskeyStatus = "added" | "cancelled" | "failed";

// The link from the page (FlowplanApp.addPasskey) with the app's callback,
// or null for anything but /passkey-add?token=… of this instance.
export function passkeySheetUrl(link: unknown, server: string | null, state: string): string | null {
  if (typeof link !== "string" || !server || link.length > 500) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const token = url.searchParams.get("token") || "";
  if (url.origin !== new URL(server).origin || url.pathname !== "/passkey-add" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  if ([...url.searchParams.keys()].some((key) => key !== "token") || url.hash || url.username || url.password) return null;
  const sheet = new URL("/passkey-add", url.origin);
  sheet.searchParams.set("token", token);
  sheet.searchParams.set("return", `${PASSKEY_CALLBACK}?state=${state}`);
  return sheet.href;
}

// The one passkey sheet the app waits for.
export class PendingPasskey {
  private state: string | null = null;
  private at = 0;

  start(state: string, now = Date.now()) {
    this.state = state;
    this.at = now;
  }

  waiting(now = Date.now()) {
    return !!this.state && now - this.at < LIFETIME_MS;
  }

  // flowplan://passkey?state=…&status=… → its status, once; null for a
  // callback the app did not wait for.
  accept(link: string, now = Date.now()): PasskeyStatus | null {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return null;
    }
    if (url.protocol !== "flowplan:" || url.hostname !== "passkey") return null;
    if (!this.waiting(now) || url.searchParams.get("state") !== this.state) return null;
    this.clear();
    const status = url.searchParams.get("status");
    return status === "added" || status === "cancelled" ? status : "failed";
  }

  // Ends the wait without a callback (closed sheet): true if it was waiting.
  end() {
    const was = !!this.state;
    this.clear();
    return was;
  }

  clear() {
    this.state = null;
    this.at = 0;
  }
}

// Opens the sheet. iOS: ASWebAuthenticationSession, which hands the callback
// back (or "cancel" when the person closes it). Android: a Custom Tab, the
// callback comes later as an app link (link: null); if no Custom Tab opens,
// the default browser.
export type PasskeyOpeners = {
  platform: string;
  authSession: (url: string, redirect: string) => Promise<{ type: string; url?: string }>;
  customTab: (url: string) => Promise<unknown>;
  browser: (url: string) => Promise<unknown>;
};
export type PasskeyOpen = { opened: true; link: string | null; closed: boolean } | { opened: false; error: string };
export async function openPasskeySheet(url: string, open: PasskeyOpeners): Promise<PasskeyOpen> {
  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
  if (open.platform === "ios") {
    try {
      const result = await open.authSession(url, PASSKEY_CALLBACK);
      return { opened: true, link: result.type === "success" && result.url ? result.url : null, closed: true };
    } catch (e) {
      return { opened: false, error: reason(e) };
    }
  }
  try {
    await open.customTab(url);
    return { opened: true, link: null, closed: false };
  } catch (first) {
    try {
      await open.browser(url);
      return { opened: true, link: null, closed: false };
    } catch (second) {
      return { opened: false, error: `${reason(first)}; ${reason(second)}` };
    }
  }
}

// What the page hears (the event "flowplan:passkey", lib/app-passkey.ts in
// Flowplan).
export function passkeyAnswerScript(status: PasskeyStatus) {
  const detail = { status: status === "added" || status === "cancelled" ? status : "failed" };
  return `window.dispatchEvent(new CustomEvent("flowplan:passkey", { detail: ${JSON.stringify(detail)} })); true;`;
}

// A random state for the callback (base64url of 24 bytes).
export function passkeyState(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
