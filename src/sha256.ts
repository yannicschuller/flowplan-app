// SHA-256 for the sign-in challenge, push and offline keys: the native digest
// of expo-crypto when it works, else the plain JavaScript one (src/sha256-js.ts)
// – same result (#109).
import * as Crypto from "expo-crypto";
import { sha256Base64Js, sha256HexJs } from "./sha256-js";

// The native digest when it works, else the plain one – same result.
export async function sha256Hex(value: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  } catch {
    return sha256HexJs(value);
  }
}
export async function sha256Base64(value: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 });
  } catch {
    return sha256Base64Js(value);
  }
}
