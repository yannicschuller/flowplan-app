// Android: what the configurable widgets' buttons did (native/suite.ts keeps
// it in a file of the app). A tap draws the item done at once (pending); the
// instance's yes keeps it drawn done until its next answer (confirmed), its
// no brings the item back with a hint (failed) and is kept as the last error
// for the app's settings. iOS does the same in the widget extension
// (WidgetShared.swift, FPActions).
import { FAILED_MS, PENDING_MS, habitItemId, readItemId, taskItemId, TIMER_START, TIMER_STOP, type ActionMarks } from "./present";
import type { ActionName } from "./api";

export type ActionError = { action: string; status: number; message: string; at: number };
export type ActionState = {
  pending: Record<string, number>;
  confirmed: Record<string, number>;
  failed: Record<string, number>;
  lastError?: ActionError;
};

export const emptyActions = (): ActionState => ({ pending: {}, confirmed: {}, failed: {} });

const times = (value: unknown) => {
  const out: Record<string, number> = {};
  if (value && typeof value === "object")
    for (const [id, at] of Object.entries(value as Record<string, unknown>)) if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
  return out;
};
export function parseActions(text: string | null): ActionState {
  try {
    const raw = JSON.parse(text || "{}") as Record<string, unknown>;
    const state: ActionState = { pending: times(raw.pending), confirmed: times(raw.confirmed), failed: times(raw.failed) };
    const error = raw.lastError as Record<string, unknown> | undefined;
    if (error && typeof error.action === "string" && typeof error.at === "number")
      state.lastError = { action: error.action, status: typeof error.status === "number" ? error.status : 0, message: typeof error.message === "string" ? error.message : "", at: error.at };
    return state;
  } catch {
    return emptyActions();
  }
}

const within = (all: Record<string, number>, ms: number, now: number) => Object.fromEntries(Object.entries(all).filter(([, at]) => now - at < ms));
const without = (all: Record<string, number>, id: string) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id));

// The item a tap is about (the ids present.ts draws by).
export function tapItem(action: ActionName, fields: Record<string, unknown>): string {
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : "");
  switch (action) {
    case "task.complete":
      return taskItemId({
        source: text("source") || "doc",
        pageId: text("pageId"),
        rowId: text("rowId") || undefined,
        index: typeof fields.index === "number" ? fields.index : undefined,
      });
    case "habit.check":
      return habitItemId(text("pageId"), text("fieldId"));
    case "mention.read":
      return readItemId(text("notificationId"));
    case "mention.readAll":
      return readItemId();
    case "timer.start":
      return TIMER_START;
    case "timer.stop":
      return TIMER_STOP;
    default:
      return action;
  }
}

export function tapped(state: ActionState, id: string, now: number): ActionState {
  return {
    ...state,
    pending: { ...within(state.pending, PENDING_MS, now), [id]: now },
    confirmed: within(state.confirmed, PENDING_MS, now),
    failed: without(within(state.failed, FAILED_MS, now), id),
  };
}

export function answered(
  state: ActionState,
  id: string,
  now: number,
  outcome: { ok: true } | { ok: false; action: string; status: number; message: string },
): ActionState {
  const at = state.pending[id] ?? now;
  const pending = without(within(state.pending, PENDING_MS, now), id);
  if (outcome.ok) return { ...state, pending, confirmed: { ...within(state.confirmed, PENDING_MS, now), [id]: at } };
  return {
    ...state,
    pending,
    failed: { ...within(state.failed, FAILED_MS, now), [id]: now },
    lastError: { action: outcome.action, status: outcome.status, message: outcome.message, at: now },
  };
}

// A fresh answer arrived: what was confirmed before it is shown as it is.
export function settled(state: ActionState, before: number): ActionState {
  return { ...state, confirmed: Object.fromEntries(Object.entries(state.confirmed).filter(([, at]) => at >= before)) };
}

export function actionMarks(state: ActionState): ActionMarks {
  return { pending: { ...state.confirmed, ...state.pending }, failed: state.failed };
}
