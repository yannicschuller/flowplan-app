// The page's calls to the offline copy (src/offline/loader.ts →
// window.FlowplanApp.offline), answered by the profile's copy. Only the
// instance's own page gets here (Shell.tsx checks the origin of every
// message); the copy checks keys and answers again (src/offline/policy.ts).
import { answerScript } from "./loader";
import type { OfflineCopy } from "./store";

export type OfflineMessage = {
  type: "offline";
  id: number;
  op: string;
  cache?: string | null;
  key?: string;
  entry?: unknown;
};

export function parseOfflineMessage(message: unknown): OfflineMessage | null {
  const value = message as Partial<OfflineMessage> | null;
  if (!value || value.type !== "offline" || !Number.isSafeInteger(value.id) || typeof value.op !== "string") return null;
  return value as OfflineMessage;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function answerOffline(copy: OfflineCopy, message: OfflineMessage): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    switch (message.op) {
      case "state": {
        const state = await copy.state();
        return { ok: true, value: { enabled: state.enabled, page: state.page, bytes: state.bytes } };
      }
      case "names":
        return { ok: true, value: await copy.names() };
      case "keys":
        return { ok: true, value: await copy.keys(text(message.cache)) };
      case "match":
        return { ok: true, value: await copy.match(message.cache === null ? null : text(message.cache), text(message.key)) };
      case "has":
        return { ok: true, value: await copy.has(message.cache === null ? null : text(message.cache), text(message.key)) };
      case "put": {
        const result = await copy.put(text(message.cache), text(message.key), message.entry);
        // A refusal is an answer, not a failure: the page counts it as missing.
        return { ok: true, value: result === true };
      }
      case "delete":
        return { ok: true, value: await copy.delete(text(message.cache), text(message.key)) };
      case "remove":
        return { ok: true, value: await copy.remove(text(message.cache)) };
      case "estimate":
        return { ok: true, value: await copy.estimate() };
      default:
        return { ok: false, error: "unknown" };
    }
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function offlineAnswer(copy: OfflineCopy, message: OfflineMessage) {
  return answerScript(message.id, await answerOffline(copy, message));
}
