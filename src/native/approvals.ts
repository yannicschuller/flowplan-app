// The confirmation key behind "Approve" (src/approval-key.ts): the secret
// in the keychain / Keystore, readable only with Face ID, Touch ID or the
// fingerprint, and its verifier for the registration (App.tsx → register).
//
// iOS stores such an item without asking, so the key is made before the
// first registration of a profile; Android asks for the fingerprint already
// to store it – there it is made at the first "Approve" (which then opens
// the approval view once, while the new key reaches the instance).
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import { approvalEntries, isApprovalSecret, isVerifier, newApprovalSecret, verifierOf } from "../approval-key";
import { sha256Base64 } from "../sha256";

const plain: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const guarded = (prompt: string): SecureStore.SecureStoreOptions => ({
  requireAuthentication: true,
  // Never in a backup, gone with the device passcode.
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  authenticationPrompt: prompt,
});

const entries = (profileId: string) => {
  try {
    return approvalEntries(profileId);
  } catch {
    return null;
  }
};

// A new key wants the registration sent again (App.tsx).
let changed: (() => void) | null = null;
export function onApprovalKeyChanged(listener: (() => void) | null) {
  changed = listener;
}

// The instance did not know the key: the registration goes again.
export const registerAgain = () => changed?.();

const biometrics = () => {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
};

// The profile's verifier for the registration, or null.
export function approvalVerifier(profileId: string | null): string | null {
  const e = profileId ? entries(profileId) : null;
  if (!e) return null;
  try {
    const value = SecureStore.getItem(e.verifier, plain);
    return isVerifier(value) ? value : null;
  } catch {
    return null;
  }
}

// Makes the key (asking for the biometrics on Android); its verifier, or null.
export async function createApprovalKey(profileId: string, prompt: string): Promise<string | null> {
  const e = entries(profileId);
  if (!e || !biometrics()) return null;
  try {
    const secret = newApprovalSecret(getRandomBytes);
    await SecureStore.setItemAsync(e.secret, secret, guarded(prompt));
    const verifier = await verifierOf(secret, sha256Base64);
    SecureStore.setItem(e.verifier, verifier, plain);
    changed?.();
    return verifier;
  } catch {
    return null;
  }
}

// Before a registration: the verifier, made silently where that is possible (iOS).
export async function prepareApprovalKey(profileId: string | null, prompt: string): Promise<string | null> {
  if (!profileId) return null;
  const existing = approvalVerifier(profileId);
  if (existing || Platform.OS !== "ios") return existing;
  return await createApprovalKey(profileId, prompt);
}

// The secret – the phone asks for the biometrics. null: no key (gone with
// changed biometrics; the verifier goes too, a new key follows); throws
// when the person cancels or the biometrics fail.
export async function readApprovalSecret(profileId: string, prompt: string): Promise<string | null> {
  const e = entries(profileId);
  if (!e) return null;
  const secret = await SecureStore.getItemAsync(e.secret, guarded(prompt));
  if (isApprovalSecret(secret)) return secret;
  forgetApprovalKey(profileId);
  return null;
}

// A profile that is gone (or whose key no longer opens) takes its key along.
export function forgetApprovalKey(profileId: string) {
  const e = entries(profileId);
  if (!e) return;
  void SecureStore.deleteItemAsync(e.secret, { keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY }).catch(() => {});
  void SecureStore.deleteItemAsync(e.verifier, plain).catch(() => {});
}
