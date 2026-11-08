// The confirmation key for "Approve" on a workflow approval's notification
// (docs/specs/workflows.md §11.8 in Flowplan). Per profile a random secret
// lives in the keychain / Keystore behind Face ID, Touch ID or the
// fingerprint (native/approvals.ts: expo-secure-store with
// requireAuthentication – iOS biometryCurrentSet, Android BIOMETRIC_STRONG,
// this device only). The instance gets only its verifier,
// base64url(SHA-256(secret)), with the registration from the page (the
// session, never the device token alone). Tapping "Approve" reads the
// secret – the phone asks for the biometrics – and sends it along; without
// that, a stolen device token approves nothing.
//
// Pure functions – native/approvals.ts hands in the keychain, the random
// bytes and the digest; the tests a Map.
import { base64Url } from "./sign-in";
import { profileKey } from "./profiles";

const SECRET = /^[A-Za-z0-9_-]{43}$/;

// The keychain entries of a profile: the secret (behind the biometrics) and
// its verifier (readable, sent with every registration).
export function approvalEntries(profileId: string) {
  profileKey(profileId, "deviceToken"); // checks the profile id
  return { secret: `flowplan.profile.${profileId}.approvalSecret`, verifier: `flowplan.profile.${profileId}.approvalVerifier` };
}

export const isApprovalSecret = (value: unknown): value is string => typeof value === "string" && SECRET.test(value);
export const isVerifier = (value: unknown): value is string => typeof value === "string" && SECRET.test(value);

// 32 random bytes, base64url without padding (43 characters).
export function newApprovalSecret(random: (bytes: number) => Uint8Array) {
  const secret = base64Url(random(32));
  if (!isApprovalSecret(secret)) throw new Error("no randomness");
  return secret;
}

// base64 (as expo-crypto gives it) → base64url without padding, as the
// instance compares it (Node's digest("base64url")).
export const toBase64Url = (base64: string) => base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// The verifier of a secret: SHA-256 of its text, base64url.
export async function verifierOf(secret: string, sha256Base64: (value: string) => Promise<string>) {
  return toBase64Url(await sha256Base64(secret));
}

// The approve request's body: the notification, its approval, the secret.
export function approveBody(tap: { notificationId: string; approvalId: string }, secret: string) {
  return { action: "approve" as const, notificationId: tap.notificationId, approvalId: tap.approvalId, confirmation: secret };
}

// What the app does after asking the instance: done (a notice that it was
// approved), or open the approval view – the session decides there. A
// device without the key set up (403 "not set up") also registers again.
export type ApprovalOutcome = { kind: "approved" } | { kind: "open"; message: string; register: boolean };
export function approvalOutcome(status: number, body: { error?: unknown; decision?: unknown } | null): ApprovalOutcome {
  if (status === 200 && body?.decision === "approved") return { kind: "approved" };
  return { kind: "open", message: typeof body?.error === "string" ? body.error : "", register: status === 403 || status === 401 };
}
