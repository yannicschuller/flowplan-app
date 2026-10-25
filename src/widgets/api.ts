// The instance's widget API (Flowplan: app/api/mobile/widgets/[action]),
// with this installation's device token like the summary. A 401 means the
// device token died with its session: signed out (the widgets show "Open
// Flowplan to sign in", their settings stay).
import { configKey, MAX_WIDGETS_PER_REQUEST, type ServerKind } from "./suite";
import { IDEMPOTENCY_HEADER, newIdempotencyKey, retryable } from "../idempotency";

export type WidgetRequest = { id: string; kind: ServerKind; config: Record<string, unknown> };
export type WidgetResult =
  | { id: string; kind: string; ok: true; data: Record<string, unknown> }
  | { id: string; kind: string; ok: false; status: number; error: string };
export type Connection = { server: string; token: string; lang: string };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; signedOut: true } | { ok: false; status: number; error: string };

type Fetch = (url: string, init: { method?: string; headers: Record<string, string>; body?: string | FormData; signal?: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

const timeout = (ms: number) => {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
};

// `idempotencyKey`: the action's key (src/idempotency.ts). With one, a
// request without an answer (or one the instance still works on) goes once
// more with the same key – applied at most once.
export async function call<T>(
  connection: Connection,
  path: string,
  init: { method?: string; body?: string | FormData; idempotencyKey?: string },
  fetcher: Fetch,
): Promise<ApiResult<T>> {
  const { idempotencyKey, ...request } = init;
  const headers: Record<string, string> = { Authorization: `Bearer ${connection.token}`, Accept: "application/json" };
  if (typeof request.body === "string") headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${connection.server}${path}${separator}lang=${encodeURIComponent(connection.lang)}`;
  let result: ApiResult<T> = { ok: false, status: 0, error: "" };
  for (let attempt = 0; attempt < (idempotencyKey ? 2 : 1); attempt++) {
    let body: Record<string, unknown> | null = null;
    try {
      const response = await fetcher(url, { ...request, headers, signal: timeout(20_000) });
      if (response.status === 401) return { ok: false, signedOut: true };
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (response.ok && body) return { ok: true, value: body as T };
      result = { ok: false, status: response.status || 0, error: typeof body?.error === "string" ? body.error : "" };
    } catch {
      result = { ok: false, status: 0, error: "" };
    }
    if (!retryable("status" in result ? result.status : 401, body) || attempt > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return result;
}

const defaultFetch: Fetch = (url, init) => fetch(url, init);

// Option lists for the configuration screen.
export function widgetOptions(connection: Connection, kind: ServerKind, pageId?: string, fetcher: Fetch = defaultFetch) {
  const query = new URLSearchParams({ kind });
  if (pageId) query.set("pageId", pageId);
  return call<Record<string, unknown>>(connection, `/api/mobile/widgets/options?${query}`, {}, fetcher);
}

// Everything that is shown, in one request (the instance takes 16 widgets at
// a time; more are split). Widgets with the same settings are asked once.
export async function widgetData(
  connection: Connection,
  widgets: WidgetRequest[],
  day: { today: string; zone: string },
  fetcher: Fetch = defaultFetch,
): Promise<ApiResult<Map<string, WidgetResult>>> {
  const unique = new Map<string, WidgetRequest>();
  for (const widget of widgets) {
    const key = configKey(widget.kind, widget.config);
    if (!unique.has(key)) unique.set(key, { ...widget, id: key });
  }
  const all = [...unique.values()];
  const results = new Map<string, WidgetResult>();
  for (let start = 0; start < all.length; start += MAX_WIDGETS_PER_REQUEST) {
    const batch = all.slice(start, start + MAX_WIDGETS_PER_REQUEST);
    const answer = await call<{ widgets?: WidgetResult[] }>(
      connection,
      "/api/mobile/widgets/data",
      { method: "POST", body: JSON.stringify({ today: day.today, zone: day.zone, lang: connection.lang, widgets: batch }) },
      fetcher,
    );
    if (!answer.ok) return answer;
    for (const result of answer.value.widgets ?? []) if (result && typeof result.id === "string") results.set(result.id, result);
  }
  // Back to the widgets that asked: each gets the answer for its settings.
  const out = new Map<string, WidgetResult>();
  for (const widget of widgets) {
    const result = results.get(configKey(widget.kind, widget.config));
    if (result) out.set(widget.id, { ...result, id: widget.id });
  }
  return { ok: true, value: out };
}

export type ActionName =
  | "capture.note"
  | "capture.task"
  | "task.complete"
  | "habit.check"
  | "journal.track"
  | "timer.start"
  | "timer.stop"
  | "focus.start"
  | "focus.stop"
  | "mention.read"
  | "mention.readAll"
  | "meeting.note";

// One Idempotency-Key per tap (pass the tap's key to send it again later).
export function widgetAction<T = Record<string, unknown>>(
  connection: Connection,
  action: ActionName,
  body: Record<string, unknown> = {},
  fetcher: Fetch = defaultFetch,
  idempotencyKey: string = newIdempotencyKey(),
) {
  return call<T & { ok: true; action: string }>(connection, "/api/mobile/widgets/action", { method: "POST", body: JSON.stringify({ ...body, action }), idempotencyKey }, fetcher);
}

// A photo or voice memo (multipart, capture.upload).
export function uploadCapture(
  connection: Connection,
  input: { targetId: string; type: "photo" | "voice"; title?: string; file: { uri: string; name: string; type: string } },
  fetcher: Fetch = defaultFetch,
  idempotencyKey: string = newIdempotencyKey(),
) {
  const form = new FormData();
  form.append("action", "capture.upload");
  form.append("targetId", input.targetId);
  form.append("type", input.type);
  form.append("transcribe", input.type === "voice" ? "1" : "0");
  if (input.title) form.append("title", input.title);
  // React Native's FormData takes { uri, name, type } for a file.
  form.append("file", input.file as unknown as Blob);
  return call<{ url?: string; transcribed?: boolean | null; text?: string }>(connection, "/api/mobile/widgets/action", { method: "POST", body: form, idempotencyKey }, fetcher);
}
