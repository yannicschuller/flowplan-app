// Apple's on-device language model (Foundation Models, iOS 26+ with Apple
// Intelligence) for the page's light AI actions (ios/FlowplanAIModule.swift).
// iOS only; without the native module there is no window.FlowplanApp.ai at
// all, with it on an older system or device it answers "unavailable".
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { aiAvailability, aiErrorCode, aiPayload, aiResult, type AiAvailability, type AiRequest } from "./ai";

export * from "./ai";

type Subscription = { remove(): void };
type NativeModule = {
  // { available, reason?, languages? }
  availability(): Promise<unknown>;
  // JSON of aiPayload; answers { text } or { json } (a JSON string). Rejects
  // with ERR_AI_<CODE> (ai.ts aiErrorCode).
  generate(json: string): Promise<unknown>;
  // The same, the text so far as "onChunk" events ({ id, text }) on the way.
  stream(json: string): Promise<unknown>;
  cancel(id: string): void;
  addListener(event: "onChunk", listener: (event: { id?: unknown; text?: unknown }) => void): Subscription;
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("FlowplanAI") : null;

// Whether the app has the module (the page then gets window.FlowplanApp.ai).
export const deviceAiLinked = () => !!native;

export async function deviceAiAvailability(): Promise<AiAvailability> {
  if (!native) return { available: false, reason: "unsupported-os" };
  try {
    return aiAvailability(await native.availability());
  } catch {
    return { available: false, reason: "error" };
  }
}

export class DeviceAiError extends Error {
  constructor(
    public code: ReturnType<typeof aiErrorCode>,
    message: string,
  ) {
    super(message);
  }
}

const failure = (error: unknown) => new DeviceAiError(aiErrorCode(error), error instanceof Error ? error.message : String(error));

export async function deviceAiGenerate(request: AiRequest) {
  if (!native) throw new DeviceAiError("unavailable", "unavailable");
  try {
    return aiResult(await native.generate(aiPayload(request)), !!request.schema);
  } catch (error) {
    throw error instanceof DeviceAiError ? error : failure(error);
  }
}

export async function deviceAiStream(request: AiRequest, onChunk: (text: string) => void): Promise<{ text: string }> {
  if (!native) throw new DeviceAiError("unavailable", "unavailable");
  const subscription = native.addListener("onChunk", (event) => {
    if (event.id === request.id && typeof event.text === "string") onChunk(event.text);
  });
  try {
    return aiResult(await native.stream(aiPayload({ ...request, schema: undefined })), false) as { text: string };
  } catch (error) {
    throw failure(error);
  } finally {
    subscription.remove();
  }
}

export function deviceAiCancel(id: string) {
  try {
    native?.cancel(id);
  } catch {}
}
