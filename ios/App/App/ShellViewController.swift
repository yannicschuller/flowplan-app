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
/// not draw under the status bar or the home indicator) and paints the status
/// bar and home indicator areas in the colours the page has at its top and
/// bottom edge, sampled from the rendered page – so header and footer run
/// into the system bars like in a native app, with a readable status bar.
/// Pages that scroll as a whole (sign-in) keep their colours while scrolling:
/// each from the page resting at that end (the bottom one from the page's
/// background until it has been there), and content fades out at the edges
/// instead of being cut.
final class ShellViewController: UIViewController, WKScriptMessageHandler {
    let bridgeController = FlowplanBridgeViewController()
    private let bottomArea = UIView()
    private let topFade = FadeView(downwards: true)
    private let bottomFade = FadeView(downwards: false)
    /// What the page reported: does it scroll as a whole, and where is it.
    private var pageScrolls = false
    private var pageAtTop = true
    private var pageAtBottom = true
    private var pageBackground: UIColor?
    /// The bottom colour was sampled at the end of the page.
    private var bottomSettled = false
    private var statusBarStyle: UIStatusBarStyle = .default
    private var themeObservation: NSKeyValueObservation?
    private var urlObservation: NSKeyValueObservation?
    private var sampling = false
    private var sampleAgain = false

    /// Tells the app when the page may look different at its edges
    /// (navigation, scrolling, dialogs, theme), at most a few times a second,
    /// and keeps iOS from zooming into form fields.
    private static let edgeScript = """
    (() => {
      if (window.top !== window || window.__flowplanEdges) return;
      window.__flowplanEdges = true;
      // No zooming into a form field on focus, like a native app: iOS zooms
      // into fields with text below 16px (and ignores maximum-scale here).
      const style = document.createElement("style");
      style.textContent = "input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{font-size:max(16px,1em)!important}";
      document.head.append(style);
      let timer = 0;
      const opaque = (el) => {
        const color = el && getComputedStyle(el).backgroundColor;
        return color && color !== "transparent" && !color.replace(/ /g, "").endsWith(",0)") ? color : "";
      };
      const report = () => {
        const page = document.scrollingElement || document.documentElement;
        const scrolls = page.scrollHeight > innerHeight + 2;
        try {
          webkit.messageHandlers.flowplanEdges.postMessage({
            scrolls,
            atTop: page.scrollTop <= 1,
            atBottom: page.scrollTop + innerHeight >= page.scrollHeight - 2,
            background: opaque(document.body) || opaque(document.documentElement),
          });
        } catch {}
      };
      const changed = () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = 0;
          report();
        }, 120);
      };
      for (const type of ["scroll", "resize", "hashchange", "popstate", "transitionend", "animationend", "click", "touchend", "keyup", "load", "pageshow"])
        addEventListener(type, changed, { capture: true, passive: true });
      const watch = () => {
        new MutationObserver(changed).observe(document.documentElement, { attributes: true });
        if (document.body) new MutationObserver(changed).observe(document.body, { attributes: true, childList: true });
      };
      document.body ? watch() : addEventListener("DOMContentLoaded", watch);
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", changed);
      changed();
    })();
    """

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Brand.background
        bottomArea.backgroundColor = Brand.background
        addChild(bridgeController)
        let page = bridgeController.view!
        page.translatesAutoresizingMaskIntoConstraints = false
        bottomArea.translatesAutoresizingMaskIntoConstraints = false
        // Nothing of the page shows outside its frame (under the status bar).
        page.clipsToBounds = true
        view.addSubview(page)
        view.addSubview(bottomArea)
        for fade in [topFade, bottomFade] {
            fade.translatesAutoresizingMaskIntoConstraints = false
            fade.isUserInteractionEnabled = false
            fade.alpha = 0
            view.addSubview(fade)
        }
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            page.topAnchor.constraint(equalTo: safe.topAnchor),
            page.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            page.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            page.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            bottomArea.topAnchor.constraint(equalTo: safe.bottomAnchor),
            bottomArea.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bottomArea.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomArea.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            topFade.topAnchor.constraint(equalTo: page.topAnchor),
            topFade.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            topFade.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            topFade.heightAnchor.constraint(equalToConstant: 14),
            bottomFade.bottomAnchor.constraint(equalTo: page.bottomAnchor),
            bottomFade.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomFade.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomFade.heightAnchor.constraint(equalToConstant: 14),
        ])
        bridgeController.didMove(toParent: self)

        guard let webView = bridgeController.webView else { return }
        let controller = webView.configuration.userContentController
        controller.add(WeakMessageHandler(self), name: "flowplanEdges")
        controller.addUserScript(WKUserScript(source: Self.edgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        themeObservation = webView.observe(\.themeColor, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.sampleEdges() }
        }
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] _, _ in
            self?.bottomSettled = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self?.sampleEdges() }
        }
        bridgeController.shell.onPageLoaded = { [weak self] in self?.sampleEdges() }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if let state = message.body as? [String: Any] {
            pageScrolls = state["scrolls"] as? Bool ?? false
            pageAtTop = state["atTop"] as? Bool ?? true
            pageAtBottom = state["atBottom"] as? Bool ?? true
            pageBackground = (state["background"] as? String).flatMap(Self.color(css:))
        }
        sampleEdges()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        sampleEdges()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.sampleEdges() }
    }

    /// A thin row of pixels at the top and at the bottom of the page.
    private func sampleEdges() {
        guard let webView = bridgeController.webView, webView.window != nil, webView.bounds.height > 4 else { return }
        if sampling {
            sampleAgain = true
            return
        }
        sampling = true
        var colors: [UIColor?] = [nil, nil]
        let group = DispatchGroup()
        for (index, y) in [1, webView.bounds.height - 3].enumerated() {
            let configuration = WKSnapshotConfiguration()
            configuration.rect = CGRect(x: 0, y: y, width: webView.bounds.width, height: 2)
            configuration.snapshotWidth = 64
            group.enter()
            webView.takeSnapshot(with: configuration) { image, _ in
                colors[index] = image.flatMap(Self.dominantColor)
                group.leave()
            }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            self.sampling = false
            // Where the page draws nothing, the web view's own background shows.
            let fallback = webView.backgroundColor ?? Brand.background
            var top = colors[0] ?? fallback
            var bottom = colors[1] ?? fallback
            if self.pageScrolls {
                // Content passing the edges does not recolour the bars.
                if !self.pageAtTop, let current = self.view.backgroundColor { top = current }
                if !self.pageAtBottom {
                    bottom = self.bottomSettled ? (self.bottomArea.backgroundColor ?? bottom) : (self.pageBackground ?? bottom)
                } else {
                    self.bottomSettled = true
                }
            }
            self.apply(top: top, bottom: bottom)
            if self.sampleAgain {
                self.sampleAgain = false
                self.sampleEdges()
            }
        }
    }

    private func apply(top: UIColor, bottom: UIColor) {
        topFade.color = top
        bottomFade.color = bottom
        UIView.animate(withDuration: 0.15) {
            self.view.backgroundColor = top
            self.bottomArea.backgroundColor = bottom
            self.topFade.alpha = self.pageScrolls && !self.pageAtTop ? 1 : 0
            self.bottomFade.alpha = self.pageScrolls && !self.pageAtBottom ? 1 : 0
        }
        let style: UIStatusBarStyle = Self.isDark(top) ? .lightContent : .darkContent
        if style != statusBarStyle {
            statusBarStyle = style
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }

    /// "rgb(r, g, b)" or "rgba(r, g, b, a)" from getComputedStyle.
    private static func color(css: String) -> UIColor? {
        let parts = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        guard parts.count >= 3 else { return nil }
        if parts.count >= 4, parts[3] < 0.99 { return nil }
        return UIColor(red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255, alpha: 1)
    }

    private static func isDark(_ color: UIColor) -> Bool {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5
    }

    /// The colour most of the row has (icons and text on a bar do not count;
    /// transparent pixels are where the page draws nothing).
    private static func dominantColor(_ image: UIImage) -> UIColor? {
        guard let cgImage = image.cgImage else { return nil }
        let width = cgImage.width
        // The image is scaled to one row: every pixel is a column's average.
        var pixels = [UInt8](repeating: 0, count: width * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: 1, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: 1))
            return true
        }
        guard drawn, width > 0 else { return nil }
        var buckets: [Int: (count: Int, red: Int, green: Int, blue: Int)] = [:]
        for x in 0..<width where pixels[x * 4 + 3] > 200 {
            let red = Int(pixels[x * 4]), green = Int(pixels[x * 4 + 1]), blue = Int(pixels[x * 4 + 2])
            let key = (red >> 3) << 10 | (green >> 3) << 5 | (blue >> 3)
            let bucket = buckets[key] ?? (0, 0, 0, 0)
            buckets[key] = (bucket.count + 1, bucket.red + red, bucket.green + green, bucket.blue + blue)
        }
        guard let best = buckets.values.max(by: { $0.count < $1.count }) else { return nil }
        let count = CGFloat(best.count) * 255
        return UIColor(red: CGFloat(best.red) / count, green: CGFloat(best.green) / count, blue: CGFloat(best.blue) / count, alpha: 1)
    }
}

/// A short fade from the bar colour into the page, so content scrolling
/// towards a bar softens instead of being cut off.
private final class FadeView: UIView {
    private let downwards: Bool
    var color: UIColor = Brand.background {
        didSet { update() }
    }

    override class var layerClass: AnyClass { CAGradientLayer.self }

    init(downwards: Bool) {
        self.downwards = downwards
        super.init(frame: .zero)
        update()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func update() {
        guard let gradient = layer as? CAGradientLayer else { return }
        let solid = color.resolvedColor(with: traitCollection)
        let colors = [solid.cgColor, solid.withAlphaComponent(0).cgColor]
        gradient.colors = downwards ? colors : colors.reversed()
    }
}

/// WKUserContentController keeps its handlers strongly.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
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
        // No "previous / next / done" bar above the keyboard: native apps have none.
        webView.hideInputAccessoryBar()
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

extension WKWebView {
    /// Gives the web view's content view a subclass without an input
    /// accessory view (the way Ionic's keyboard plugin does it).
    func hideInputAccessoryBar() {
        guard let content = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }),
              let base = object_getClass(content) else { return }
        let name = "\(NSStringFromClass(base))_FlowplanNoAccessory"
        var subclass: AnyClass? = NSClassFromString(name)
        if subclass == nil, let created = objc_allocateClassPair(base, name, 0) {
            let selector = #selector(getter: UIResponder.inputAccessoryView)
            let none: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
            if let method = class_getInstanceMethod(UIResponder.self, selector) {
                class_addMethod(created, selector, imp_implementationWithBlock(none), method_getTypeEncoding(method))
            }
            objc_registerClassPair(created)
            subclass = created
        }
        if let subclass = subclass { object_setClass(content, subclass) }
    }
}
