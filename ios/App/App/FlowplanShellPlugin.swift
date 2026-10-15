import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit
import WebKit

/// The shell around a Flowplan instance: remembers its address, keeps the
/// window on it (links to other sites open in the system browser), shows the
/// offline page and signs in with passkeys and SSO through the system
/// browser – the same hand-off as the desktop app (lib/desktop-sign-in.ts on
/// the server):
///
/// 1. The instance's sign-in page links "Mit Passkey anmelden" / "Mit SSO
///    anmelden" to /api/auth/desktop when it sees FlowplanMobile/ in the user
///    agent. The app catches that navigation.
/// 2. It keeps a random verifier and opens /api/auth/desktop?challenge=<its
///    SHA-256> in an ASWebAuthenticationSession (Safari, with passkeys).
/// 3. After signing in and confirming, the page hands flowplan://sign-in with
///    a one-time code back; the app redeems it with its verifier from the
///    instance's page, so the session cookie lands in the app's web view.
///
/// The JavaScript methods are only for the app's own pages (setup, offline):
/// calls from the instance's pages are refused.
@objc(FlowplanShellPlugin)
public class FlowplanShellPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "FlowplanShellPlugin"
    public let jsName = "FlowplanShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    static let scheme = "flowplan"
    private static let serverKey = "flowplan.server"
    private static let pendingLifetime: TimeInterval = 10 * 60

    private var authSession: ASWebAuthenticationSession?
    private var pending: [String: (verifier: String, at: Date)] = [:]
    private var redeemWhenLoaded: (code: String, verifier: String)?
    private var signingInUntil: Date?
    private var queuedLinks: [URL] = []
    /// The page finished loading (the shell then looks at its colours).
    var onPageLoaded: (() -> Void)?

    // MARK: - Address

    var server: String? {
        get { UserDefaults.standard.string(forKey: Self.serverKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.serverKey) }
    }

    /// Managed installations (MDM "Managed App Configuration") suggest an
    /// address with the key "server"; the first start still asks.
    private var suggestedServer: String? {
        let managed = UserDefaults.standard.dictionary(forKey: "com.apple.configuration.managed")
        return managed?["server"] as? String
    }

    static func origin(of url: URL?) -> String? {
        guard let url = url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              var host = components.host?.lowercased(), !host.isEmpty else { return nil }
        if host.contains(":") { host = "[\(host)]" }
        let defaultPort = scheme == "https" ? 443 : 80
        if let port = components.port, port != defaultPort { return "\(scheme)://\(host):\(port)" }
        return "\(scheme)://\(host)"
    }

    private var localScheme: String { bridge?.config.localURL.scheme ?? "capacitor" }

    private func localPage(_ name: String, query: [URLQueryItem] = []) -> URL? {
        guard let base = bridge?.config.localURL else { return nil }
        var components = URLComponents(url: base.appendingPathComponent(name), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        return components?.url
    }

    /// Only the app's own pages may change the address.
    private func fromOwnPage(_ call: CAPPluginCall) -> Bool {
        if bridge?.webView?.url?.scheme == localScheme { return true }
        call.reject("Only available on the app's own pages")
        return false
    }

    // MARK: - JavaScript (own pages only)

    @objc func getServer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.fromOwnPage(call) else { return }
            call.resolve(["server": self.server ?? "", "suggested": self.suggestedServer ?? ""])
        }
    }

    /// The page has checked the address (www/server.js); here it only has to
    /// be an origin.
    @objc func setServer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.fromOwnPage(call) else { return }
            guard let value = call.getString("server"), let url = URL(string: value),
                  let origin = Self.origin(of: url), origin == value else {
                call.reject("Invalid address")
                return
            }
            self.server = origin
            self.pending.removeAll()
            call.resolve()
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.fromOwnPage(call) else { return }
            self.openServer()
            call.resolve()
        }
    }

    // MARK: - Window

    func openServer() {
        guard let webView = bridge?.webView else { return }
        if let server = server, let url = URL(string: server) {
            webView.load(URLRequest(url: url))
        } else if let setup = localPage("index.html") {
            webView.load(URLRequest(url: setup))
        }
    }

    /// The setup page, e.g. from the quick action "Change server".
    func showSetup() {
        guard let setup = localPage("index.html", query: [URLQueryItem(name: "setup", value: "1")]) else { return }
        authSession?.cancel()
        bridge?.webView?.load(URLRequest(url: setup))
    }

    // swiftlint:disable:next cyclomatic_complexity
    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return nil }
        if scheme == localScheme { return nil }
        if ["about", "data", "blob"].contains(scheme) { return false }
        let newWindow = navigationAction.targetFrame == nil
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        let web = scheme == "http" || scheme == "https"

        if let server = server, Self.origin(of: url) == server {
            if url.path == "/api/auth/desktop" && mainFrame {
                let via = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first { $0.name == "via" }?.value
                startSignIn(via: via)
                return true
            }
            if mainFrame {
                // Sign-in through the window (e-mail, older instances' SSO)
                // may pass the identity provider's pages.
                signingInUntil = url.path.hasPrefix("/api/auth/") ? Date().addingTimeInterval(600) : nil
            }
            if newWindow {
                bridge?.webView?.load(navigationAction.request)
                return true
            }
            return false
        }
        // Embedded content (videos, maps) stays in the page.
        if !mainFrame && !newWindow { return web ? false : true }
        if web, !newWindow, let until = signingInUntil, until > Date() { return false }
        // Other sites, e-mail and phone links: the system.
        if scheme == "flowplan" {
            _ = handle(url)
        } else {
            UIApplication.shared.open(url)
        }
        return true
    }

    func pageLoaded(_ webView: WKWebView) {
        onPageLoaded?()
        guard let redeem = redeemWhenLoaded, let server = server, Self.origin(of: webView.url) == server else { return }
        redeemWhenLoaded = nil
        runRedeem(code: redeem.code, verifier: redeem.verifier, in: webView)
    }

    /// Without a connection: the offline page. Cancelled loads (a newer
    /// navigation, a link the app handled) are not failures.
    func pageFailed(_ webView: WKWebView, error: Error) {
        let error = error as NSError
        guard error.domain == NSURLErrorDomain, error.code != NSURLErrorCancelled else { return }
        let failing = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        guard let server = server, failing == nil || Self.origin(of: failing) == server else { return }
        guard let offline = localPage("offline.html", query: [
            URLQueryItem(name: "server", value: server),
            URLQueryItem(name: "error", value: error.localizedDescription),
        ]) else { return }
        webView.load(URLRequest(url: offline))
    }

    // MARK: - Sign-in through the system browser

    private func startSignIn(via: String?) {
        guard let server = server, var components = URLComponents(string: server) else { return }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return }
        let verifier = Data(bytes).base64URLEncoded
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded
        pending = pending.filter { Date().timeIntervalSince($0.value.at) < Self.pendingLifetime }
        pending[challenge] = (verifier, Date())
        components.path = "/api/auth/desktop"
        components.queryItems = [URLQueryItem(name: "challenge", value: challenge)]
            + (via == "sso" ? [URLQueryItem(name: "via", value: "sso")] : [])
        guard let url = components.url else { return }

        authSession?.cancel()
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: Self.scheme) { [weak self] callback, _ in
            DispatchQueue.main.async {
                self?.authSession = nil
                // Cancelled by the user: nothing to do.
                if let callback = callback { _ = self?.handle(callback) }
            }
        }
        session.presentationContextProvider = self
        // Passkeys and an existing browser sign-in are welcome.
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        session.start()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }

    /// flowplan:// links: sign-in codes and "change server". Links that
    /// arrive before the web view exists wait for it.
    @discardableResult
    func handle(_ link: URL) -> Bool {
        guard link.scheme?.lowercased() == Self.scheme else { return false }
        guard bridge?.webView != nil else {
            queuedLinks.append(link)
            return true
        }
        switch link.host?.lowercased() {
        case "change-server":
            showSetup()
        case "sign-in":
            let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let value = { (name: String) in items.first { $0.name == name }?.value ?? "" }
            // Codes for another instance or a sign-in this app did not start
            // are ignored: nobody can sign the app in from outside.
            guard let server = server, value("server") == server,
                  let request = pending.removeValue(forKey: value("challenge")),
                  !value("code").isEmpty else {
                alert(Texts.signInImpossible, Texts.signInForeign)
                return true
            }
            redeem(code: value("code"), verifier: request.verifier)
        default:
            return false
        }
        return true
    }

    func handleQueuedLinks() {
        let links = queuedLinks
        queuedLinks.removeAll()
        for link in links { handle(link) }
    }

    override public func load() {
        DispatchQueue.main.async { self.handleQueuedLinks() }
    }

    private func redeem(code: String, verifier: String) {
        guard let webView = bridge?.webView, let server = server else { return }
        if Self.origin(of: webView.url) == server {
            runRedeem(code: code, verifier: verifier, in: webView)
        } else {
            redeemWhenLoaded = (code, verifier)
            openServer()
        }
    }

    /// Redeemed from the instance's page, so the cookie lands in the web view.
    /// (evaluateJavaScript, not callAsyncJavaScript: the latter's Swift form
    /// links a WebKit overlay that older iOS versions do not have.)
    private func runRedeem(code: String, verifier: String, in webView: WKWebView) {
        let json = { (value: Any) -> String in
            let data = (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])) ?? Data()
            return String(data: data, encoding: .utf8) ?? "null"
        }
        let script = """
        (async () => {
          const response = await fetch("/api/auth/desktop-redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(\(json(["code": code, "verifier": verifier]))),
          });
          if (response.ok) return location.replace("/");
          const answer = await response.json().catch(() => ({}));
          alert(\(json(Texts.signInFailed + "\n\n")) + (answer.error || \(json(Texts.signInAgain))));
        })();
        undefined;
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func alert(_ title: String, _ message: String) {
        guard let controller = bridge?.viewController else { return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        (controller.presentedViewController ?? controller).present(alert, animated: true)
    }
}

/// The few native texts, in the languages of Flowplan.
enum Texts {
    private static let language: String = {
        for preferred in Locale.preferredLanguages {
            let code = String(preferred.prefix(2))
            if ["de", "en", "fr"].contains(code) { return code }
        }
        return "en"
    }()

    private static func pick(_ de: String, _ en: String, _ fr: String) -> String {
        switch language {
        case "de": return de
        case "fr": return fr
        default: return en
        }
    }

    static var signInImpossible: String { pick("Anmeldung nicht möglich", "Sign-in not possible", "Connexion impossible") }
    static var signInForeign: String {
        pick(
            "Diese Anmeldung wurde nicht in dieser App gestartet oder gehört zu einer anderen Instanz. Starte sie bitte noch einmal über „Mit Passkey anmelden“ oder „Mit SSO anmelden“.",
            "This sign-in was not started in this app or belongs to another instance. Please start it again with “Sign in with a passkey” or “Sign in with SSO”.",
            "Cette connexion n’a pas été lancée dans cette app ou appartient à une autre instance. Relance-la avec « Se connecter avec une clé d’accès » ou « Se connecter avec SSO »."
        )
    }
    static var signInFailed: String { pick("Anmeldung fehlgeschlagen", "Sign-in failed", "Échec de la connexion") }
    static var signInAgain: String { pick("Bitte erneut anmelden.", "Please sign in again.", "Merci de te reconnecter.") }
}

extension Data {
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
