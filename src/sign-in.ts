// Signing in with passkeys and SSO through the system's sign-in sheet – the
// hand-off of the desktop app (lib/desktop-sign-in.ts on the server):
//
// 1. The instance's sign-in page links "Mit Passkey anmelden" / "Mit SSO
//    anmelden" to /api/auth/desktop when it sees FlowplanMobile/ in the user
//    agent. The app catches that navigation (navigation.ts).
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
