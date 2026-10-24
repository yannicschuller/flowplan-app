// Handwriting recognition for the page's ink (notebooks, PDF annotations,
// drawings): the page asks through window.FlowplanApp.recognizeInk (only
// there where the device can recognise, bridge-script.ts), the app checks
// the request (inkRequest), modules/flowplan-ink reads it with Vision and
// inkScript hands the answer back as the event "flowplan:ink-recognized".
// Pure functions; screens/Shell.tsx wires them up.
import type { InkLine, InkRequest, InkStroke } from "../modules/flowplan-ink/src/ink";

export const INK_LIMITS = { strokes: 5000, points: 200_000, size: 20_000, id: 100 };
// Requests in flight at once (different ids); more are answered "failed".
export const INK_PENDING = 16;

export type InkError = "unavailable" | "failed";
export type InkDetail = { id: string; text: string; lines: InkLine[]; error?: InkError };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The id an answer can go to: what the page sent, if it is a usable one.
export function inkId(message: { id?: unknown }): string | null {
  const id = message.id;
  return typeof id === "string" && id.length > 0 && id.length <= INK_LIMITS.id ? id : null;
}

// The page's request, checked: an id of at most 100 characters, the canvas
// 1…20000 pt on each side, at most 5000 strokes and 200000 points (more are
// left out), points as two finite numbers, kept on the canvas. null when
// the request is unusable.
export function inkRequest(message: { id?: unknown; width?: unknown; height?: unknown; strokes?: unknown }): InkRequest | null {
  const id = inkId(message);
  if (!id || !finite(message.width) || !finite(message.height) || !Array.isArray(message.strokes)) return null;
  const width = clamp(message.width, 1, INK_LIMITS.size);
  const height = clamp(message.height, 1, INK_LIMITS.size);
  const strokes: InkStroke[] = [];
  let points = 0;
  for (const stroke of message.strokes as unknown[]) {
    if (strokes.length >= INK_LIMITS.strokes || points >= INK_LIMITS.points) break;
    const list = stroke && typeof stroke === "object" ? (stroke as { points?: unknown }).points : null;
    if (!Array.isArray(list)) continue;
    const kept: [number, number][] = [];
    for (const point of list as unknown[]) {
      if (points >= INK_LIMITS.points) break;
      if (!Array.isArray(point) || point.length < 2 || !finite(point[0]) || !finite(point[1])) continue;
      kept.push([clamp(point[0], 0, width), clamp(point[1], 0, height)]);
      points++;
    }
    if (kept.length) strokes.push({ points: kept });
  }
  return { id, width, height, strokes };
}

export function inkFailure(id: string, error: InkError): InkDetail {
  return { id, text: "", lines: [], error };
}

// JSON as data in the script; "<", ">", "&" and the line separators U+2028 /
// U+2029 escaped as well, so nothing the recognised text holds can end a
// string or a script.
export function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function inkScript(detail: InkDetail) {
  const clean: InkDetail = { id: String(detail.id), text: String(detail.text), lines: detail.lines.map((line) => ({ text: String(line.text), box: line.box })) };
  if (detail.error) clean.error = detail.error === "unavailable" ? "unavailable" : "failed";
  return `window.dispatchEvent(new CustomEvent("flowplan:ink-recognized", { detail: ${safeJson(clean)} })); true;`;
}

// One recognition per id: a newer request for the same id replaces the
// older one (its answer is dropped; the native side cancels it too).
export class InkRuns {
  private latest = new Map<string, number>();
  private next = 0;

  constructor(private readonly limit = INK_PENDING) {}

  // A ticket for this request, or null when too many ids are waiting.
  start(id: string): number | null {
    if (!this.latest.has(id) && this.latest.size >= this.limit) return null;
    const ticket = ++this.next;
    this.latest.set(id, ticket);
    return ticket;
  }

  // Whether this answer is still the one the page waits for.
  finish(id: string, ticket: number): boolean {
    if (this.latest.get(id) !== ticket) return false;
    this.latest.delete(id);
    return true;
  }

  get pending() {
    return this.latest.size;
  }
}
