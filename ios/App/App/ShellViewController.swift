import Capacitor
import UIKit
import WebKit

/// Colours of the Flowplan web app, for everything around the page.
enum Brand {
    static let background = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x16 / 255, green: 0x15 / 255, blue: 0x1B / 255, alpha: 1)
            : UIColor(red: 0xFC / 255, green: 0xFB / 255, blue: 0xF8 / 255, alpha: 1)
    }
}

/// The window's root: keeps the page inside the safe area (the web app does
/// not draw under the status bar or the home indicator) and paints the
/// edges in the page's theme colour, with a status bar that stays readable.
final class ShellViewController: UIViewController {
    let bridgeController = FlowplanBridgeViewController()
    private var themeObservation: NSKeyValueObservation?
    private var statusBarStyle: UIStatusBarStyle = .default

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Brand.background
        addChild(bridgeController)
        let page = bridgeController.view!
        page.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(page)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            page.topAnchor.constraint(equalTo: safe.topAnchor),
            page.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            page.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            page.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
        ])
        bridgeController.didMove(toParent: self)
        themeObservation = bridgeController.webView?.observe(\.themeColor, options: [.initial, .new]) { [weak self] webView, _ in
            DispatchQueue.main.async { self?.applyTheme(webView.themeColor) }
        }
    }

    private func applyTheme(_ color: UIColor?) {
        let background = color ?? Brand.background
        view.backgroundColor = background
        let resolved = background.resolvedColor(with: traitCollection)
        var white: CGFloat = 0
        var alpha: CGFloat = 0
        resolved.getWhite(&white, alpha: &alpha)
        statusBarStyle = white < 0.5 ? .lightContent : .darkContent
        setNeedsStatusBarAppearanceUpdate()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        applyTheme(bridgeController.webView?.themeColor)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }
}

/// Capacitor's controller with the shell plugin, the app's user agent and a
/// look at page loads (offline page, sign-in).
final class FlowplanBridgeViewController: CAPBridgeViewController {
    let shell = FlowplanShellPlugin()
    private var navigationProxy: NavigationDelegateProxy?

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        // The instance shows the app's sign-in (passkeys and SSO through the
        // system browser) when it sees this.
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let name = configuration.applicationNameForUserAgent ?? ""
        configuration.applicationNameForUserAgent = "\(name) FlowplanMobile/\(version)".trimmingCharacters(in: .whitespaces)
        return configuration
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(shell)
        guard let webView = webView else { return }
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = Brand.background
        webView.scrollView.backgroundColor = Brand.background
        if #available(iOS 16.4, *) {
            // Safari's Web Inspector for debug builds.
            webView.isInspectable = CapacitorBridge.isDevEnvironment
        }
        // Capacitor stays the navigation delegate; the proxy only listens.
        if let delegate = webView.navigationDelegate {
            let proxy = NavigationDelegateProxy(target: delegate)
            proxy.didFinish = { [weak self] webView in self?.shell.pageLoaded(webView) }
            proxy.didFail = { [weak self] webView, error in self?.shell.pageFailed(webView, error: error) }
            navigationProxy = proxy
            webView.navigationDelegate = proxy
        }
    }
}

/// Forwards everything to Capacitor's navigation delegate and reports
/// finished and failed loads.
final class NavigationDelegateProxy: NSObject, WKNavigationDelegate {
    private weak var target: WKNavigationDelegate?
    var didFinish: ((WKWebView) -> Void)?
    var didFail: ((WKWebView, Error) -> Void)?

    init(target: WKNavigationDelegate) {
        self.target = target
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (target?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        target
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        target?.webView?(webView, didFinish: navigation)
        didFinish?(webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        target?.webView?(webView, didFail: navigation, withError: error)
        didFail?(webView, error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        didFail?(webView, error)
    }
}
