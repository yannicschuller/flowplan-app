// Document scanner of the Flowplan app – iOS (VisionKit and Vision, Swift in
// ios/) and Android (ML Kit in Google Play services, Kotlin in android/) –
// and Spotlight (iOS only). Without the native module everything answers
// "not here".
import { Platform } from "react-native";
import { requireOptionalNativeModule, type EventSubscription } from "expo";

// A scan: the PDF in the app's caches (file:// URI) and the text recognised
// on its pages – the same shape from both platforms.
export type ScanResult = { uri: string; name: string; pages: number; text: string; size: number };
// A file picked instead (Android without Google Play services), copied to
// the app's caches.
export type PickedFile = { uri: string; name: string; type: string; size: number };

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
  // Android only.
  pickDocument(): Promise<PickedFile | null>;
  indexSpotlight(domain: string, json: string): Promise<number>;
  clearSpotlight(): Promise<void>;
  addListener(event: "onOpenLink", listener: (event: { url: string }) => void): EventSubscription;
};

const native = Platform.OS === "ios" || Platform.OS === "android" ? requireOptionalNativeModule<NativeModule>("FlowplanCapture") : null;
// Spotlight and its links exist only on iOS.
const apple = Platform.OS === "ios" ? native : null;

// Whether this build has the scanner at all (Android: even without Google
// Play services, which scannerAvailable() checks).
export function scannerModule(): boolean {
  return !!native;
}

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

// Android: Android's file picker for a PDF or a photo; null when cancelled.
export async function pickDocument(): Promise<PickedFile | null> {
  if (Platform.OS !== "android" || !native) return null;
  return (await native.pickDocument()) ?? null;
}

export async function indexSpotlight(domain: string, entries: SpotlightEntry[]): Promise<number | null> {
  if (!apple) return null;
  try {
    return await apple.indexSpotlight(domain, JSON.stringify(entries));
  } catch {
    return null;
  }
}

export async function clearSpotlight(): Promise<boolean> {
  if (!apple) return false;
  try {
    await apple.clearSpotlight();
    return true;
  } catch {
    return false;
  }
}

// A Spotlight result that opened the app: flowplan://open?path=…
export function consumeOpenedLink(): string | null {
  try {
    return apple?.consumeOpenedLink() ?? null;
  } catch {
    return null;
  }
}
export function addOpenedLinkListener(listener: (url: string) => void) {
  if (!apple) return { remove() {} };
  return apple.addListener("onOpenLink", ({ url }) => listener(url));
}
