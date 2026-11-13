// The certificate of an instance this device does not trust (pins.ts):
// asked about when a profile is added or connects – a native dialog with
// host, subject, issuer, validity and SHA-256 fingerprint.
//
// Android: "Trust this certificate" pins exactly that certificate for the
// profile's host; the app's requests and its web views accept it there from
// then on (modules/flowplan-native: CertificatePins.kt, PinnedWebViewClient.kt).
//
// iOS: the dialog explains how to install and fully trust the certificate
// (or its CA) in Settings – which WKWebView, URLSession and the app's
// extensions all honour – and the app pins nothing. Pinning would have to
// cover every request of the app, and on iOS it cannot: React Native's
// fetch (RCTHTTPRequestHandler) answers TLS challenges itself without a hook
// for them (only the session's configuration can be changed), and the
// widgets, the share extension and the notification actions use
// URLSession.shared in processes of their own. The page would load while the
// health check (connecting.ts), the setup's check, push registration,
// widgets and background refreshes failed – worse than a clear message.
//
// App Store review: the app never turns certificate checks off. It accepts a
// certificate the system does not trust only after the person saw its
// fingerprint and confirmed it, only that exact certificate and only for the
// host it was confirmed for (Android) – the same as a browser's "proceed"
// for one site, but remembered and checked against the fingerprint every
// time. On iOS it relies on the system's trust settings alone.
import { Alert, Platform } from "react-native";
import { inspectCertificate, setCertificatePins } from "../../modules/flowplan-native/src";
import { checkServer, ServerError, type HttpRequest } from "../server";
import { store } from "../store";
import { certificateDialog, type CertificateDialog } from "./dialog";
import { certificateVerdict, makePin, nativePins, pinnableHost, prunePins, withoutPin, withPin } from "./pins";
import { parseCertificate } from "./x509";

// The profiles' addresses changed (App.tsx): pins of profiles that are gone
// go, and the native side gets what is left. `keep`: an address being
// added right now (its pin was made before its profile).
export function syncCertificatePins(servers: string[], keep: string | null = null) {
  const pins = store.certificatePins();
  const next = prunePins(pins, servers, keep);
  if (next.length !== pins.length) store.setCertificatePins(next);
  setCertificatePins(nativePins(next));
}

export function removeCertificatePin(origin: string) {
  const next = withoutPin(store.certificatePins(), origin);
  store.setCertificatePins(next);
  setCertificatePins(nativePins(next));
}

// - "trusted": the system trusts the certificate – the failure was another one;
// - "pinned": it is the pinned one already;
// - "accepted": the person trusted it just now (pinned from now on);
// - "declined": not trusted (cancelled, or iOS, where the person was told
//   how to install it);
// - "none": no certificate to look at (plain HTTP, not reachable).
export type Review = "trusted" | "pinned" | "accepted" | "declined" | "none";

// One dialog per instance at a time (a failed load and a failed check can
// both ask).
const asking = new Map<string, Promise<Review>>();

export function reviewCertificate(origin: string): Promise<Review> {
  const running = asking.get(origin);
  if (running) return running;
  const review = runReview(origin).finally(() => asking.delete(origin));
  asking.set(origin, review);
  return review;
}

async function runReview(origin: string): Promise<Review> {
  if (!pinnableHost(origin)) return "none";
  const inspected = await inspectCertificate(origin);
  if (!inspected) return "none";
  let details;
  try {
    details = parseCertificate(inspected.chain[0]);
  } catch {
    return "none";
  }
  const pins = store.certificatePins();
  const verdict = certificateVerdict({ origin, details, systemTrusted: inspected.trusted, pins });
  if (verdict.kind === "trusted") return "trusted";
  if (verdict.kind === "pinned") {
    setCertificatePins(nativePins(pins));
    return "pinned";
  }
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const dialog = certificateDialog({ kind: verdict.kind, platform, origin, details, pin: verdict.kind === "changed" ? verdict.pin : null, now: Date.now() });
  if (!(await ask(dialog))) return "declined";
  // Only Android offers "trust" (dialog.trust is null on iOS).
  const pin = makePin(origin, details, Date.now());
  if (!pin || platform !== "android") return "declined";
  const next = withPin(store.certificatePins(), pin);
  store.setCertificatePins(next);
  setCertificatePins(nativePins(next));
  return "accepted";
}

function ask(dialog: CertificateDialog): Promise<boolean> {
  return new Promise((resolve) => {
    const buttons: { text: string; style?: "cancel" | "destructive" | "default"; onPress: () => void }[] = [
      { text: dialog.cancel, style: "cancel", onPress: () => resolve(false) },
    ];
    if (dialog.trust) buttons.push({ text: dialog.trust, style: "destructive", onPress: () => resolve(true) });
    Alert.alert(dialog.title, dialog.message, buttons, { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// The person declined a certificate (the setup says so instead of "nothing
// answers").
export class CertificateRefused extends Error {
  constructor(origin: string) {
    super(`certificate refused: ${origin}`);
  }
}

// The setup's check (src/server.ts → checkServer): when nothing answers over
// HTTPS, the certificate may be the reason – asked about, and checked again
// once it is pinned.
export async function checkServerTrusting(origin: string, request: HttpRequest) {
  try {
    return await checkServer(origin, request);
  } catch (error) {
    if (!(error instanceof ServerError) || error.code !== "unreachable") throw error;
    const review = await reviewCertificate(origin);
    if (review === "accepted" || review === "pinned") {
      // The address is about to get its profile: its pin stays.
      syncCertificatePins(store.profiles().profiles.map((profile) => profile.server), origin);
      return await checkServer(origin, request);
    }
    if (review === "declined") throw new CertificateRefused(origin);
    throw error;
  }
}
