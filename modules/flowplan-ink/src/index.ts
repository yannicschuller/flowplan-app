// Handwriting recognition on the device for the page's ink (notebooks, PDF
// annotations, drawings): the strokes are drawn into an image and read by
// Vision (ios/FlowplanInkModule.swift). iOS only; on Android and without
// the native module it is not available.
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { inkPayload, inkResult, type InkRequest, type InkResult } from "./ink";

export type { InkLine, InkPoint, InkRequest, InkResult, InkStroke } from "./ink";

type NativeModule = {
  isAvailable(): boolean;
  // JSON of inkPayload; answers { lines: [{ text, box }] }. Rejects with
  // ERR_INK_CANCELLED when a newer request for the same id replaced it.
  recognize(json: string): Promise<unknown>;
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("FlowplanInk") : null;

export function inkRecognitionAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

// Throws "unavailable" without the native module, otherwise what the
// recogniser failed with.
export async function recognizeInk(request: InkRequest): Promise<InkResult> {
  if (!native) throw new Error("unavailable");
  return inkResult(await native.recognize(inkPayload(request)));
}
