// What goes to the native recogniser and what comes back from it – pure, so
// the tests run it without React Native (index.ts is the native wrapper).
//
// Coordinates are points of the page's ink canvas, origin top left.

export type InkPoint = [number, number];
export type InkStroke = { points: InkPoint[] };
export type InkRequest = { id: string; width: number; height: number; strokes: InkStroke[] };
// box: [x, y, width, height] in the request's points.
export type InkLine = { text: string; box: [number, number, number, number] };
export type InkResult = { text: string; lines: InkLine[] };

// For ios/FlowplanInkModule.swift (FPInkRequest.parse): one JSON string
// instead of hundreds of thousands of bridged numbers; each stroke flat as
// [x0, y0, x1, y1, …].
export function inkPayload(request: InkRequest) {
  return JSON.stringify({
    id: request.id,
    width: request.width,
    height: request.height,
    strokes: request.strokes.map((stroke) => stroke.points.flat()),
  });
}

const round = (value: number) => Math.round(value * 10) / 10;

// The native answer ({ lines: [{ text, box }] }, Vision's order), checked,
// in reading order: rows top to bottom – lines whose middle lies within the
// first line of a row belong to it – and left to right within a row.
export function inkResult(raw: unknown): InkResult {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { lines?: unknown }).lines) ? (raw as { lines: unknown[] }).lines : [];
  const lines: InkLine[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const { text, box } = entry as { text?: unknown; box?: unknown };
    if (typeof text !== "string" || !text.trim() || !Array.isArray(box) || box.length !== 4) continue;
    if (!box.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    const [x, y, w, h] = box as number[];
    lines.push({ text: text.trim(), box: [round(x), round(y), round(Math.max(0, w)), round(Math.max(0, h))] });
  }
  const ordered = orderLines(lines);
  return { text: ordered.map((line) => line.text).join("\n"), lines: ordered };
}

export function orderLines(lines: InkLine[]): InkLine[] {
  const sorted = [...lines].sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const rows: { top: number; bottom: number; lines: InkLine[] }[] = [];
  for (const line of sorted) {
    const middle = line.box[1] + line.box[3] / 2;
    const row = rows[rows.length - 1];
    if (row && middle >= row.top && middle <= row.bottom) row.lines.push(line);
    else rows.push({ top: line.box[1], bottom: line.box[1] + line.box[3], lines: [line] });
  }
  return rows.flatMap((row) => row.lines.sort((a, b) => a.box[0] - b.box[0]));
}
