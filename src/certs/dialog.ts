// What the certificate dialog says (src/certs/review.ts shows it as a native
// alert): host, subject, issuer, validity and the SHA-256 fingerprint, with
// "Trust this certificate" / "Cancel" on Android and how to install and
// trust the certificate on iOS. Pure: the texts for a certificate, a
// platform and a language.
import { t, type Locale } from "../i18n";
import { tc } from "../i18n-certs";
import { formatDay, formatFingerprint, iosProblems, namesCover, pinnableHost, type CertificatePin } from "./pins";
import type { CertificateDetails } from "./x509";

export type CertificateDialog = {
  title: string;
  message: string;
  // The button that pins the certificate; null where the app cannot pin
  // (iOS: only "OK").
  trust: string | null;
  cancel: string;
};

export function detailsText(details: Pick<CertificateDetails, "subject" | "issuer" | "notBefore" | "notAfter" | "sha256">, lang?: Locale) {
  return tc(
    "certDetails",
    {
      subject: details.subject || "–",
      issuer: details.issuer || "–",
      from: formatDay(details.notBefore),
      to: formatDay(details.notAfter),
      fingerprint: formatFingerprint(details.sha256),
    },
    lang,
  );
}

export function certificateDialog(input: {
  kind: "ask" | "changed";
  platform: "ios" | "android";
  origin: string;
  details: CertificateDetails;
  pin?: CertificatePin | null;
  now: number;
  lang?: Locale;
}): CertificateDialog {
  const { details, lang } = input;
  const host = pinnableHost(input.origin) ?? input.origin;
  const parts: string[] = [];
  if (input.kind === "changed" && input.pin) parts.push(tc("certChanged", { host, old: formatFingerprint(input.pin.sha256) }, lang));
  else parts.push(tc("certUntrusted", { host }, lang));
  parts.push(detailsText(details, lang));
  const warnings: string[] = [];
  if (!namesCover(details, host)) warnings.push(tc("certNameMismatch", { host }, lang));
  if ((Number.isFinite(details.notAfter) && details.notAfter < input.now) || (Number.isFinite(details.notBefore) && details.notBefore > input.now))
    warnings.push(tc("certExpired", {}, lang));
  if (warnings.length) parts.push(warnings.join("\n"));
  if (input.platform === "ios") {
    parts.push(tc("certIosHint", {}, lang));
    const problems = iosProblems(details, host, input.now).filter((problem) => problem !== "expired");
    const texts = problems.map((problem) =>
      tc(({ noSubjectAltName: "certIosNoSubjectAltName", otherName: "certIosOtherName", tooLong: "certIosTooLong" } as const)[problem], { host }, lang),
    );
    if (texts.length) parts.push(texts.join("\n"));
    return { title: tc(input.kind === "changed" ? "certChangedTitle" : "certUntrustedTitle", {}, lang), message: parts.join("\n\n"), trust: null, cancel: tc("certOk", {}, lang) };
  }
  if (input.kind === "ask") parts.push(tc("certTrustHint", { host }, lang));
  return {
    title: tc(input.kind === "changed" ? "certChangedTitle" : "certUntrustedTitle", {}, lang),
    message: parts.join("\n\n"),
    trust: tc(input.kind === "changed" ? "certTrustNew" : "certTrust", {}, lang),
    // "Abbrechen" – the app's own word (src/i18n.ts).
    cancel: t("cancel", {}, lang),
  };
}

