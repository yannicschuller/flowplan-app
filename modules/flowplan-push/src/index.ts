// The device keys of the push relay (src/push-relay.ts): one X25519 key pair
// per profile (instance) of this installation. The private key never leaves
// the device and never reaches JavaScript – iOS keeps it in the keychain
// under the App Group's access group (readable by the Notification Service
// Extension, after the first unlock, this device only), Android encrypted
// with a key of the Android Keystore. JavaScript only gets the public key
// (base64url, 32 bytes) for the instance.
import { requireOptionalNativeModule } from "expo";

type NativeModule = {
  publicKey(profile: string, origin: string): Promise<string | null>;
  deleteKey(profile: string): boolean;
  keepOnly(profiles: string[]): void;
  environment(): string | null;
  isAvailable(): boolean;
};

const native = requireOptionalNativeModule<NativeModule>("FlowplanPush");

// False in builds without the module or (iOS) without the App Group.
export function pushKeysAvailable() {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

// The profile's public key, created on first use. A key made for another
// address of the profile is replaced. null: no keychain / Keystore.
export async function devicePublicKey(profile: string, origin: string): Promise<string | null> {
  try {
    const key = await native?.publicKey(profile, origin);
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}

export function deleteDeviceKey(profile: string) {
  try {
    return native?.deleteKey(profile) ?? true;
  } catch {
    return false;
  }
}

// Removes the keys of every profile not listed (left, removed profiles).
export function keepDeviceKeys(profiles: string[]) {
  try {
    native?.keepOnly(profiles);
  } catch {}
}

// iOS: the APNs environment this build was signed for ("production" or
// "development", from its provisioning profile); null when it has none
// (App Store and TestFlight builds: production) or on Android.
export function apsEnvironment(): string | null {
  try {
    return native?.environment() ?? null;
  } catch {
    return null;
  }
}
