// Idempotency keys for the instance's state-changing endpoints (Flowplan:
// lib/idempotency.ts). One key per tap, share, scan or shortcut run, sent as
// `Idempotency-Key` and sent again unchanged when the same action is
// retried: the instance applies it once, a retry gets the stored answer
// (`Idempotent-Replayed: true`). Pure, so the tests run it in Node.
import type * as ExpoCrypto from "expo-crypto";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

// A UUID v4: the platform's when it has one (Node, newer Hermes), else
// expo-crypto's.
export function newIdempotencyKey(): string {
  const platform = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof platform?.randomUUID === "function") return platform.randomUUID();
  return (require("expo-crypto") as typeof ExpoCrypto).randomUUID();
}

// Worth sending again with the same key: no answer at all (status 0), the
// gateway while the instance restarts, or the instance still working on the
// first attempt.
export function retryable(status: number, body: Record<string, unknown> | null) {
  return status === 0 || status === 502 || status === 503 || status === 504 || (status === 409 && body?.code === "idempotency_in_progress");
}

// The key of something the person may send again by hand (Save after a
// failure): the same while what is sent stays the same, a new one otherwise.
export type DraftKey = { fingerprint: string; key: string };
export function draftKey(previous: DraftKey | null, fingerprint: string): DraftKey {
  return previous && previous.fingerprint === fingerprint ? previous : { fingerprint, key: newIdempotencyKey() };
}
