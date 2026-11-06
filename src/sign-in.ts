// Signing in with passkeys and SSO through the system's sign-in sheet – the
// hand-off of the desktop app (lib/desktop-sign-in.ts on the server):
//
// 1. The instance's sign-in page links "Mit Passkey anmelden" / "Mit SSO
//    anmelden" to /api/auth/desktop when it sees FlowplanMobile/ in the user
//    agent. Newer instances call FlowplanApp.signIn (bridge-script.ts)
//    instead; for older ones the app catches that navigation (navigation.ts),
//    and stops it should it load anyway (missedSignIn).
// 2. It keeps a random verifier and opens /api/auth/desktop?challenge=<its
//    SHA-256> in ASWebAuthenticationSession (iOS) or a Custom Tab (Android).
// 3. After signing in and confirming, the page hands flowplan://sign-in with a
//    one-time code back; the app redeems it with its verifier from the
//    instance's page, so the session cookie lands in the app's web view.
//
// Codes for another instance or for a sign-in this app did not start are
// refused: nobody can sign the app in from outside.

const LIFETIME_MS = 10 * 60_000;

export const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export class PendingSignIns {
  private pending = new Map<string, { verifier: string; at: number }>();
  // Redeemed challenges: on Android the same link can arrive twice (the sign-in
  // sheet's result and the app link).
  private used = new Set<string>();

  add(challenge: string, verifier: string, now = Date.now()) {
    for (const [key, value] of this.pending) if (now - value.at >= LIFETIME_MS) this.pending.delete(key);
    this.pending.set(challenge, { verifier, at: now });
  }

  // The verifier for this challenge, once.
  take(challenge: string, now = Date.now()) {
    const entry = this.pending.get(challenge);
    this.pending.delete(challenge);
    if (entry) this.used.add(challenge);
    return entry && now - entry.at < LIFETIME_MS ? entry.verifier : null;
  }

  wasUsed(challenge: string) {
    return this.used.has(challenge);
  }

  clear() {
    this.pending.clear();
    this.used.clear();
  }
}

export function signInUrl(server: string, challenge: string, via: string | null) {
  const url = new URL("/api/auth/desktop", server);
  url.searchParams.set("challenge", challenge);
  if (via === "sso") url.searchParams.set("via", "sso");
  return url.href;
}

// Opens the sign-in (step 2). iOS: ASWebAuthenticationSession, which hands the
// result back directly. Android: a Custom Tab; the result arrives as the
// flowplan://sign-in app link (App.tsx). expo-web-browser's auth-session
// stand-in for Android was not used: it refuses to start while it believes an
// earlier tab is still open, and the error went unnoticed (#109). If no Custom
// Tab opens, the default browser; if nothing opens, the caller says so.
export type SignInOpeners = {
  platform: string;
  authSession: (url: string, redirect: string) => Promise<{ type: string; url?: string }>;
  customTab: (url: string) => Promise<unknown>;
  browser: (url: string) => Promise<unknown>;
};
export type OpenOutcome = { opened: true; link: string | null } | { opened: false; error: string };
export async function openSignIn(url: string, open: SignInOpeners): Promise<OpenOutcome> {
  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
  if (open.platform === "ios") {
    try {
      const result = await open.authSession(url, "flowplan://sign-in");
      return { opened: true, link: result.type === "success" && result.url ? result.url : null };
    } catch (e) {
      return { opened: false, error: reason(e) };
    }
  }
  try {
    await open.customTab(url);
    return { opened: true, link: null };
  } catch (first) {
    try {
      await open.browser(url);
      return { opened: true, link: null };
    } catch (second) {
      return { opened: false, error: `${reason(first)}; ${reason(second)}` };
    }
  }
}

// The whole start of a sign-in (steps 2 and 3 up to the sheet): the challenge
// and the sheet. Nothing escapes as a rejected promise any more – in 1.0.5 an
// error before the sheet (the challenge) went nowhere, and the tap did
// nothing (#109); now every failure comes back with the step it failed in.
export type SignInStart = { opened: true; link: string | null } | { opened: false; stage: "challenge" | "open"; error: string };
export async function beginSignIn(
  server: string,
  via: string | null,
  deps: { verifier: () => string; sha256Base64: (value: string) => Promise<string>; pending: PendingSignIns; open: SignInOpeners },
): Promise<SignInStart> {
  let challenge: string;
  try {
    const verifier = deps.verifier();
    challenge = (await deps.sha256Base64(verifier)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error(`unexpected challenge (${challenge.length} characters)`);
    deps.pending.add(challenge, verifier);
  } catch (e) {
    return { opened: false, stage: "challenge", error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const outcome = await openSignIn(signInUrl(server, challenge, via), deps.open);
    return outcome.opened ? outcome : { opened: false, stage: "open", error: outcome.error };
  } catch (e) {
    return { opened: false, stage: "open", error: e instanceof Error ? e.message : String(e) };
  }
}

// One sign-in per tap: the page's bridge call, the caught navigation and the
// load the app stops (missedSignIn) can all report the same tap.
export class SignInStarts {
  private last = -Infinity;
  begin(now = Date.now()) {
    if (now - this.last < 1500) return false;
    this.last = now;
    return true;
  }
}

// "Mit SSO anmelden" / "Mit Passkey anmelden" through the bridge
// (FlowplanApp.signIn, lib/native-app.ts in Flowplan): only "sso" means
// anything; everything else is the instance's own sign-in.
export const signInVia = (message: { via?: unknown }) => (message.via === "sso" ? "sso" : null);

// What the page hears about the start (the event "flowplan:sign-in"): it
// shows a failure under the buttons and reports it to the instance's log.
export type SignInAnswer = { status: "opened" } | { status: "failed"; stage: string; error: string };
export function signInAnswerScript(answer: SignInAnswer) {
  const detail = answer.status === "opened" ? answer : { status: "failed", stage: answer.stage, error: String(answer.error).slice(0, 300) };
  return `window.dispatchEvent(new CustomEvent("flowplan:sign-in", { detail: ${JSON.stringify(detail)} })); true;`;
}

export type SignInResult = { code: string; verifier: string } | { error: "foreign" } | null;

// flowplan://sign-in?server=…&challenge=…&code=… → what to redeem.
export function acceptSignIn(link: string, server: string | null, pending: PendingSignIns, now = Date.now()): SignInResult {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "flowplan:" || url.hostname !== "sign-in") return null;
  const value = (name: string) => url.searchParams.get(name) || "";
  if (pending.wasUsed(value("challenge"))) return null;
  if (!server || value("server") !== server) return { error: "foreign" };
  const verifier = pending.take(value("challenge"), now);
  if (!verifier || !value("code")) return { error: "foreign" };
  return { code: value("code"), verifier };
}

// Runs in the instance's page, so the session cookie lands in the web view.
export function redeemScript(code: string, verifier: string, failed: string, again: string) {
  return `(async () => {
  const response = await fetch("/api/auth/desktop-redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(${JSON.stringify({ code, verifier })}),
  });
  if (response.ok) return location.replace("/");
  const answer = await response.json().catch(() => ({}));
  alert(${JSON.stringify(`${failed}\n\n`)} + (answer.error || ${JSON.stringify(again)}));
})();
true;`;
}
