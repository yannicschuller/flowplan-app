// What goes to the on-device model (ios/FlowplanAIModule.swift) and what
// comes back from it – pure, so the tests run it without React Native
// (index.ts is the native wrapper).
//
// The page's contract (window.FlowplanApp.ai, the same as
// window.FlowplanDesktop.ai of the desktop app; lib/ai/device.ts in
// Flowplan): availability(), generate(req), stream(req, onChunk), cancel(id).

export type AiUnavailableReason = "unsupported-os" | "device-not-eligible" | "apple-intelligence-off" | "model-not-ready" | "unsupported-language" | "error";
export type AiAvailability = { available: boolean; reason?: AiUnavailableReason; languages?: string[] };
export type AiErrorCode = "unavailable" | "context-too-long" | "guardrail" | "cancelled" | "busy" | "error";

// The JSON Schema subset of guided generation, in the order the model is to
// write it: properties as a list (a JSON object loses its order on the way
// through Foundation's JSONSerialization).
export type AiSchemaNode =
  | { type: "object"; description?: string; properties: { name: string; description?: string; optional: boolean; schema: AiSchemaNode }[] }
  | { type: "array"; description?: string; items: AiSchemaNode; minItems?: number; maxItems?: number }
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number" | "integer" | "boolean"; description?: string };

export type AiRequest = {
  id: string;
  instructions?: string;
  prompt: string;
  schema?: AiSchemaNode;
  temperature?: number;
  maxTokens?: number;
};

export const AI_LIMITS = {
  id: 100,
  // The model's context is about 4000 tokens: more than this never fits.
  prompt: 40_000,
  instructions: 8_000,
  maxTokens: 4096,
  // Guided generation: nesting, properties and choices of the schema.
  schemaDepth: 6,
  schemaNodes: 200,
  enumValues: 64,
  text: 2_000,
} as const;

export const AI_ERROR_CODES: AiErrorCode[] = ["unavailable", "context-too-long", "guardrail", "cancelled", "busy", "error"];
const REASONS: AiUnavailableReason[] = ["unsupported-os", "device-not-eligible", "apple-intelligence-off", "model-not-ready", "unsupported-language", "error"];

const text = (value: unknown, max: number = AI_LIMITS.text) => (typeof value === "string" ? value.slice(0, max) : undefined);

// A JSON Schema of the subset (object/array/string/number/integer/boolean/
// enum) as an AiSchemaNode; null when it is none, too deep or too big.
export function aiSchema(raw: unknown): AiSchemaNode | null {
  let nodes = 0;
  const walk = (node: unknown, depth: number): AiSchemaNode | null => {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > AI_LIMITS.schemaDepth || ++nodes > AI_LIMITS.schemaNodes) return null;
    const n = node as Record<string, unknown>;
    const description = text(n.description, 500);
    const extra = description ? { description } : {};
    if (Array.isArray(n.enum)) {
      const values = n.enum.filter((v): v is string | number => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))).map(String);
      if (!values.length || values.length > AI_LIMITS.enumValues || values.length !== n.enum.length) return null;
      return { type: "string", ...extra, enum: values.map((v) => v.slice(0, 200)) };
    }
    switch (n.type) {
      case "object": {
        if (!n.properties || typeof n.properties !== "object" || Array.isArray(n.properties)) return null;
        const required = new Set(Array.isArray(n.required) ? n.required.filter((r) => typeof r === "string") : []);
        const properties: Extract<AiSchemaNode, { type: "object" }>["properties"] = [];
        for (const [name, child] of Object.entries(n.properties as Record<string, unknown>)) {
          if (!name || name.length > 100) return null;
          const schema = walk(child, depth + 1);
          if (!schema) return null;
          const childDescription = text((child as { description?: unknown }).description, 500);
          properties.push({ name, ...(childDescription ? { description: childDescription } : {}), optional: !required.has(name), schema });
        }
        return properties.length ? { type: "object", ...extra, properties } : null;
      }
      case "array": {
        const items = walk(n.items, depth + 1);
        if (!items) return null;
        const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000 ? (value as number) : undefined);
        const minItems = count(n.minItems),
          maxItems = count(n.maxItems);
        if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) return null;
        return { type: "array", ...extra, items, ...(minItems !== undefined ? { minItems } : {}), ...(maxItems !== undefined ? { maxItems } : {}) };
      }
      case "string":
      case "number":
      case "integer":
      case "boolean":
        return { type: n.type, ...extra };
      default:
        return null;
    }
  };
  return walk(raw, 0);
}

// The page's request, checked: an id of 1…100 characters, a prompt, the
// instructions, a schema of the subset (generate only), a temperature of
// 0…2 and 1…4096 response tokens. A string error code when it is unusable.
export function aiRequest(raw: unknown, withSchema: boolean): AiRequest | AiErrorCode {
  if (!raw || typeof raw !== "object") return "error";
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= AI_LIMITS.id ? r.id : null;
  if (!id || typeof r.prompt !== "string" || !r.prompt.trim()) return "error";
  if (r.prompt.length > AI_LIMITS.prompt || (typeof r.instructions === "string" && r.instructions.length > AI_LIMITS.instructions)) return "context-too-long";
  const request: AiRequest = { id, prompt: r.prompt };
  if (typeof r.instructions === "string" && r.instructions.trim()) request.instructions = r.instructions;
  if (typeof r.temperature === "number" && Number.isFinite(r.temperature)) request.temperature = Math.min(2, Math.max(0, r.temperature));
  if (typeof r.maxTokens === "number" && Number.isFinite(r.maxTokens)) request.maxTokens = Math.round(Math.min(AI_LIMITS.maxTokens, Math.max(1, r.maxTokens)));
  if (withSchema && r.schema !== undefined && r.schema !== null) {
    const schema = aiSchema(r.schema);
    if (!schema) return "error";
    request.schema = schema;
  }
  return request;
}

// For the native side: one JSON string.
export const aiPayload = (request: AiRequest) => JSON.stringify(request);

// The native availability ({ available, reason?, languages? }), checked.
export function aiAvailability(raw: unknown): AiAvailability {
  if (!raw || typeof raw !== "object") return { available: false, reason: "error" };
  const r = raw as Record<string, unknown>;
  const languages = Array.isArray(r.languages)
    ? [...new Set(r.languages.filter((l): l is string => typeof l === "string" && /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(l)))].slice(0, 100)
    : undefined;
  if (r.available === true) return { available: true, ...(languages ? { languages } : {}) };
  const reason = REASONS.includes(r.reason as AiUnavailableReason) ? (r.reason as AiUnavailableReason) : "error";
  return { available: false, reason, ...(languages ? { languages } : {}) };
}

// The native answer: { text } or { json } (guided generation, the
// generated content's JSON).
export function aiResult(raw: unknown, guided: boolean): { text: string } | { json: unknown } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (guided) {
    if (typeof r.json !== "string") throw Object.assign(new Error("No content"), { code: "error" });
    try {
      return { json: JSON.parse(r.json) };
    } catch {
      throw Object.assign(new Error("Invalid content"), { code: "error" });
    }
  }
  return { text: typeof r.text === "string" ? r.text : "" };
}

// The code of a native rejection: ERR_AI_CONTEXT_TOO_LONG → "context-too-long".
export function aiErrorCode(error: unknown): AiErrorCode {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (typeof code === "string") {
    const name = code.replace(/^ERR_AI_/, "").toLowerCase().replaceAll("_", "-");
    if ((AI_ERROR_CODES as string[]).includes(name)) return name as AiErrorCode;
  }
  return "error";
}
