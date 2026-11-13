// A certificate error of the window's page (screens/Shell.tsx → onError):
//
// - Android, the instance has a pinned certificate: the window's web views
//   are armed (PinnedWebViewClient.kt) and the page loads again – they now
//   accept that certificate. Already armed: the instance presents another
//   certificate than the pinned one – the page stays unloaded and the person
//   is asked (old and new fingerprint, review.ts).
// - Otherwise the failure is handled as before (stored copy or offline
//   screen) and the certificate dialog comes on top; once the person trusts
//   it, the window loads anew.
import { Platform } from "react-native";
import { armWebViews } from "../../modules/flowplan-native/src";
import { originOf } from "../server";
import { store } from "../store";
import { isCertificateError, pinFor, pinnableHost } from "./pins";
import { reviewCertificate } from "./review";

export type LoadErrorActions = {
  // Load the page again in the same web view.
  reload: () => void;
  // A fresh window (Shell.tsx → retry).
  retry: () => void;
  // What the window does with a failed load.
  failed: () => void;
};

// Whether the error was a certificate error of the instance, now handled.
export function certificateLoadError(event: { code?: number; description?: string; url?: string }, server: string, actions: LoadErrorActions): boolean {
  if (!isCertificateError(Platform.OS, event) || !pinnableHost(server)) return false;
  if (event.url && originOf(event.url) !== server) return false;
  const ask = () => {
    actions.failed();
    void reviewCertificate(server).then((review) => {
      if (review === "accepted") actions.retry();
    });
  };
  if (Platform.OS === "android" && pinFor(store.certificatePins(), server)) {
    void armWebViews().then((armed) => (armed > 0 ? actions.reload() : ask()));
    return true;
  }
  ask();
  return true;
}
