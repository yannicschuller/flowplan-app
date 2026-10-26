// On-device AI for the page (Apple's Foundation Models, iOS 26+ with Apple
// Intelligence): the page calls window.FlowplanApp.ai (bridge-script.ts,
// only on the instance's own pages), the app checks every call here,
// modules/flowplan-ai runs the model and aiScript hands answers and the
// streamed text back as the event "flowplan:ai". Nothing of the text
// leaves the device. Pure functions; screens/Shell.tsx wires them up.
import { AI_LIMITS, aiRequest, type AiErrorCode, type AiRequest } from "../modules/flowplan-ai/src/ai";
import { safeJson } from "./ink-bridge";

export type AiOp = "availability" | "generate" | "stream" | "cancel";
export type AiCall = { op: "availability" | "cancel"; id: string } | { op: "generate" | "stream"; id: string; request: AiRequest } | { op: "failed"; id: string; code: AiErrorCode };
export type AiDetail =
  | { id: string; kind: "done"; result: unknown }
  | { id: string; kind: "chunk"; text: string }
  | { id: string; kind: "error"; code: AiErrorCode; message: string };

const OPS: AiOp[] = ["availability", "generate", "stream", "cancel"];

// The page's message { type: "ai", op, id, request? }, checked: null when
// there is no one to answer (no usable id or op), else what to do – or the
// error to answer with.
export function aiCall(message: { op?: unknown; id?: unknown; request?: unknown }): AiCall | null {
  const id = typeof message.id === "string" && message.id.length > 0 && message.id.length <= AI_LIMITS.id + 4 ? message.id : null;
  if (!id || !OPS.includes(message.op as AiOp)) return null;
  const op = message.op as AiOp;
  if (op === "availability" || op === "cancel") return { op, id };
  const request = aiRequest(message.request && typeof message.request === "object" ? { ...(message.request as object), id } : null, op === "generate");
  return typeof request === "string" ? { op: "failed", id, code: request } : { op, id, request };
}

// A short English message per code (the page shows its own texts).
const MESSAGES: Record<AiErrorCode, string> = {
  unavailable: "The on-device model is not available.",
  "context-too-long": "The text is too long for the on-device model.",
  guardrail: "The on-device model declined this request.",
  cancelled: "Cancelled.",
  busy: "The on-device model is busy.",
  error: "The on-device model failed.",
};
export const aiFailure = (id: string, code: AiErrorCode): AiDetail => ({ id, kind: "error", code, message: MESSAGES[code] });

export function aiScript(detail: AiDetail) {
  let clean: AiDetail;
  if (detail.kind === "chunk") clean = { id: String(detail.id), kind: "chunk", text: String(detail.text) };
  else if (detail.kind === "error") clean = aiFailure(String(detail.id), detail.code in MESSAGES ? detail.code : "error");
  else clean = { id: String(detail.id), kind: "done", result: detail.result };
  return `window.dispatchEvent(new CustomEvent("flowplan:ai", { detail: ${safeJson(clean)} })); true;`;
}
