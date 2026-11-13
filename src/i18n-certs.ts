// The texts of the certificate dialogs and the pinned certificate in the
// app's settings (src/certs/review.ts, src/screens/CertificatePin.tsx), in
// the app's languages (German, English, French, Simplified Chinese; the
// language is the one src/i18n.ts chose). The iOS paths are Apple's own
// names of the settings in each language.
import { locale, type Locale } from "./i18n";

const de = {
  certUntrustedTitle: "Zertifikat nicht vertrauenswürdig",
  certUntrusted: "{host} zeigt ein Zertifikat, dem dieses Gerät nicht vertraut – etwa ein selbst signiertes oder eines deiner eigenen Zertifizierungsstelle.",
  certDetails: "Ausgestellt für: {subject}\nAusgestellt von: {issuer}\nGültig: {from} bis {to}\nSHA-256-Fingerabdruck:\n{fingerprint}",
  certNameMismatch: "Achtung: Das Zertifikat ist nicht für {host} ausgestellt.",
  certExpired: "Achtung: Das Zertifikat ist abgelaufen oder noch nicht gültig.",
  certTrustHint:
    "Vertraue ihm nur, wenn der Fingerabdruck mit dem deines Servers übereinstimmt. Flowplan vertraut dann genau diesem Zertifikat und nur für {host}. Alternativ installierst du das Zertifikat deiner Zertifizierungsstelle in den Android-Einstellungen (Sicherheit → Verschlüsselung und Anmeldedaten → Zertifikat installieren → CA-Zertifikat).",
  certTrust: "Diesem Zertifikat vertrauen",
  certChangedTitle: "Zertifikat hat sich geändert",
  certChanged:
    "{host} zeigt ein anderes Zertifikat als das, dem du vertraut hast. Das kann eine Erneuerung sein – oder jemand versucht, die Verbindung abzufangen. Flowplan lädt die Seite deshalb nicht.\n\nBisher:\n{old}\n\nJetzt:",
  certTrustNew: "Neuem Zertifikat vertrauen",
  certIosHint:
    "Damit Flowplan sich verbinden kann, installiere das Zertifikat deiner Zertifizierungsstelle (oder dieses Serverzertifikat) auf dem Gerät und vertraue ihm:\n1. Lade es (z. B. in Safari oder per AirDrop) und installiere es unter Einstellungen → Allgemein → VPN und Geräteverwaltung.\n2. Schalte unter Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen das volle Vertrauen dafür ein.\nVerbinde dich danach erneut.",
  certIosNoSubjectAltName: "iOS verlangt den Namen des Servers im Feld „Alternativer Name“ (subjectAltName) – dieses Zertifikat hat keinen.",
  certIosOtherName: "iOS verlangt {host} im Feld „Alternativer Name“ (subjectAltName) des Zertifikats.",
  certIosTooLong: "iOS lehnt Serverzertifikate ab, die länger als 825 Tage gültig sind.",
  certRefused: "Flowplan verbindet sich nicht mit {server}: Dem Zertifikat des Servers wird nicht vertraut.",
  certPinnedTitle: "Zertifikat angeheftet",
  certPinnedText: "Flowplan vertraut für {host} genau diesem Zertifikat (gültig bis {to}):",
  certPinRemove: "Angeheftetes Zertifikat entfernen",
  certPinRemoveConfirm: "Danach verbindet sich Flowplan mit {host} nur noch, wenn das Gerät dem Zertifikat vertraut – oder du ihm erneut vertraust.",
  certOk: "OK",
};
type Key = keyof typeof de;

const en: Record<Key, string> = {
  certUntrustedTitle: "Certificate not trusted",
  certUntrusted: "{host} presents a certificate this device does not trust – for example a self-signed one or one of your own certificate authority.",
  certDetails: "Issued to: {subject}\nIssued by: {issuer}\nValid: {from} to {to}\nSHA-256 fingerprint:\n{fingerprint}",
  certNameMismatch: "Caution: the certificate was not issued for {host}.",
  certExpired: "Caution: the certificate has expired or is not valid yet.",
  certTrustHint:
    "Only trust it if the fingerprint matches your server's. Flowplan then trusts exactly this certificate, and only for {host}. Alternatively, install your certificate authority's certificate in Android's settings (Security → Encryption & credentials → Install a certificate → CA certificate).",
  certTrust: "Trust this certificate",
  certChangedTitle: "Certificate changed",
  certChanged:
    "{host} presents a different certificate than the one you trusted. This can be a renewal – or someone trying to intercept the connection. That's why Flowplan does not load the page.\n\nBefore:\n{old}\n\nNow:",
  certTrustNew: "Trust the new certificate",
  certIosHint:
    "For Flowplan to connect, install your certificate authority's certificate (or this server certificate) on the device and trust it:\n1. Download it (for example in Safari or via AirDrop) and install it in Settings → General → VPN & Device Management.\n2. Turn on full trust for it in Settings → General → About → Certificate Trust Settings.\nThen connect again.",
  certIosNoSubjectAltName: "iOS requires the server's name in the certificate's Subject Alternative Name – this certificate has none.",
  certIosOtherName: "iOS requires {host} in the certificate's Subject Alternative Name.",
  certIosTooLong: "iOS refuses server certificates that are valid for more than 825 days.",
  certRefused: "Flowplan does not connect to {server}: the server's certificate is not trusted.",
  certPinnedTitle: "Certificate pinned",
  certPinnedText: "For {host}, Flowplan trusts exactly this certificate (valid until {to}):",
  certPinRemove: "Remove pinned certificate",
  certPinRemoveConfirm: "Flowplan will then only connect to {host} if the device trusts its certificate – or you trust it again.",
  certOk: "OK",
};

const fr: Record<Key, string> = {
  certUntrustedTitle: "Certificat non fiable",
  certUntrusted: "{host} présente un certificat auquel cet appareil ne fait pas confiance – par exemple un certificat auto-signé ou émis par ta propre autorité de certification.",
  certDetails: "Délivré à : {subject}\nDélivré par : {issuer}\nValide : du {from} au {to}\nEmpreinte SHA-256 :\n{fingerprint}",
  certNameMismatch: "Attention : le certificat n’a pas été délivré pour {host}.",
  certExpired: "Attention : le certificat a expiré ou n’est pas encore valide.",
  certTrustHint:
    "Ne lui fais confiance que si l’empreinte correspond à celle de ton serveur. Flowplan fera alors confiance à exactement ce certificat, et uniquement pour {host}. Tu peux aussi installer le certificat de ton autorité de certification dans les paramètres d’Android (Sécurité → Chiffrement et identifiants → Installer un certificat → Certificat CA).",
  certTrust: "Faire confiance à ce certificat",
  certChangedTitle: "Le certificat a changé",
  certChanged:
    "{host} présente un autre certificat que celui auquel tu as fait confiance. Il peut s’agir d’un renouvellement – ou de quelqu’un qui tente d’intercepter la connexion. C’est pourquoi Flowplan ne charge pas la page.\n\nAvant :\n{old}\n\nMaintenant :",
  certTrustNew: "Faire confiance au nouveau certificat",
  certIosHint:
    "Pour que Flowplan puisse se connecter, installe le certificat de ton autorité de certification (ou ce certificat de serveur) sur l’appareil et fais-lui confiance :\n1. Télécharge-le (par exemple dans Safari ou via AirDrop) et installe-le dans Réglages → Général → VPN et gestion de l’appareil.\n2. Active la confiance totale pour lui dans Réglages → Général → Informations → Réglages de confiance des certificats.\nReconnecte-toi ensuite.",
  certIosNoSubjectAltName: "iOS exige le nom du serveur dans le champ « Autre nom de l’objet » (subjectAltName) – ce certificat n’en a pas.",
  certIosOtherName: "iOS exige {host} dans le champ « Autre nom de l’objet » (subjectAltName) du certificat.",
  certIosTooLong: "iOS refuse les certificats de serveur valides plus de 825 jours.",
  certRefused: "Flowplan ne se connecte pas à {server} : le certificat du serveur n’est pas fiable.",
  certPinnedTitle: "Certificat épinglé",
  certPinnedText: "Pour {host}, Flowplan fait confiance à exactement ce certificat (valide jusqu’au {to}) :",
  certPinRemove: "Retirer le certificat épinglé",
  certPinRemoveConfirm: "Flowplan ne se connectera alors à {host} que si l’appareil fait confiance à son certificat – ou si tu lui fais à nouveau confiance.",
  certOk: "OK",
};

const zh: Record<Key, string> = {
  certUntrustedTitle: "证书不受信任",
  certUntrusted: "{host} 出示的证书不受此设备信任，例如自签名证书或由你自己的证书颁发机构签发的证书。",
  certDetails: "颁发给：{subject}\n颁发者：{issuer}\n有效期：{from} 至 {to}\nSHA-256 指纹：\n{fingerprint}",
  certNameMismatch: "注意：该证书不是为 {host} 签发的。",
  certExpired: "注意：该证书已过期或尚未生效。",
  certTrustHint:
    "只有当指纹与你的服务器的指纹一致时才信任它。之后 Flowplan 只会信任这一个证书，并且仅用于 {host}。你也可以在 Android 设置中安装你的证书颁发机构的证书（安全 → 加密与凭据 → 安装证书 → CA 证书）。",
  certTrust: "信任此证书",
  certChangedTitle: "证书已更改",
  certChanged: "{host} 出示的证书与你信任的证书不同。这可能是证书续期，也可能是有人试图拦截连接。因此 Flowplan 不会加载该页面。\n\n之前：\n{old}\n\n现在：",
  certTrustNew: "信任新证书",
  certIosHint:
    "要让 Flowplan 能够连接，请在设备上安装你的证书颁发机构的证书（或此服务器证书）并信任它：\n1. 下载它（例如在 Safari 中或通过隔空投送），然后在“设置 → 通用 → VPN与设备管理”中安装。\n2. 在“设置 → 通用 → 关于本机 → 证书信任设置”中为它启用完全信任。\n然后重新连接。",
  certIosNoSubjectAltName: "iOS 要求服务器名称出现在证书的“主题备用名称”（subjectAltName）中，而此证书没有。",
  certIosOtherName: "iOS 要求 {host} 出现在证书的“主题备用名称”（subjectAltName）中。",
  certIosTooLong: "iOS 会拒绝有效期超过 825 天的服务器证书。",
  certRefused: "Flowplan 不会连接到 {server}：服务器的证书不受信任。",
  certPinnedTitle: "已固定证书",
  certPinnedText: "对于 {host}，Flowplan 只信任这一个证书（有效期至 {to}）：",
  certPinRemove: "移除已固定的证书",
  certPinRemoveConfirm: "之后，只有当设备信任 {host} 的证书，或你再次信任它时，Flowplan 才会连接到它。",
  certOk: "好",
};

export const certStrings = { de, en, fr, zh } as const;
export type CertKey = Key;

export function tc(key: Key, params: Record<string, string | number> = {}, lang: Locale = locale()) {
  const text = certStrings[lang]?.[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}
