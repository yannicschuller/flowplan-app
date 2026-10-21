// How this installation is called in the instance's "Signed-in devices"
// (App.tsx hands in expo-device's values): the name the person gave the
// device, otherwise the model ("iPhone 15 Pro", "Pixel 8"). iOS 16+ gives
// apps only the generic name ("iPhone"), hence the model; the generic kind is
// the last resort.
export function deviceName(candidates: readonly (string | null | undefined)[], generic: "iPhone" | "iPad" | "Android") {
  const name = candidates.map((value) => (value || "").trim()).find((value) => value && !/^(iphone|ipad|android)$/i.test(value));
  return name || generic;
}
