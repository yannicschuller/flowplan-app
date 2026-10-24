// Document scanner and Spotlight of the Flowplan app (iOS, Swift in ios/).
// On Android and without the native module everything answers "not here".
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

// A scan: the PDF in the app's caches (file:// URI) and the text recognised
// on its pages.
export type ScanResult = { uri: string; name: string; pages: number; text: string; size: number };

// One entry of the phone's search; built by src/spotlight.ts.
export type SpotlightEntry = {
  id: string;
  path: string;
  title: string;
  description?: string;
  keywords?: string[];
  updatedAt?: number;
  due?: number;
};

type NativeModule = {
  consumeOpenedLink(): string | null;
  isScannerAvailable(): boolean;
  scanDocument(title: string, languages: string[]): Promise<ScanResult | null>;
  indexSpotlight(domain: string, json: string): Promise<number>;
  clearSpotlight(): Promise<void>;
  addListener(event: "onOpenLink", listener: (event: { url: string }) => void): EventSubscription;
};

const native = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("FlowplanCapture") : null;

export function scannerAvailable(): boolean {
  try {
    return !!native?.isScannerAvailable();
  } catch {
    return false;
  }
}

// null: cancelled. Throws when the scanner failed.
export async function scanDocument(title: string, languages: string[]): Promise<ScanResult | null> {
  if (!native) return null;
  return (await native.scanDocument(title, languages)) ?? null;
}

export async function indexSpotlight(domain: string, entries: SpotlightEntry[]): Promise<number | null> {
  if (!native) return null;
  try {
    return await native.indexSpotlight(domain, JSON.stringify(entries));
  } catch {
    return null;
  }
}

export async function clearSpotlight(): Promise<boolean> {
  if (!native) return false;
  try {
    await native.clearSpotlight();
    return true;
  } catch {
    return false;
  }
}

// A Spotlight result that opened the app: flowplan://open?path=…
export function consumeOpenedLink(): string | null {
  try {
    return native?.consumeOpenedLink() ?? null;
  } catch {
    return null;
  }
}
export function addOpenedLinkListener(listener: (url: string) => void) {
  if (!native) return { remove() {} };
  return native.addListener("onOpenLink", ({ url }) => listener(url));
}
