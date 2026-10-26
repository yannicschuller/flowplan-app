import ExpoModulesCore
import ObjectiveC
import UIKit
import WebKit

/// Apple's Writing Tools in the page's editor (iOS 18+ with Apple
/// Intelligence): the web view's configuration asks for the complete,
/// inline experience (proofread and rewrite right in the text), not only the
/// panel. react-native-webview builds that configuration itself
/// (RNCWebViewImpl setUpWkWebViewConfig); its result gets
/// writingToolsBehavior = .complete before the web view is made from it.
/// Without that class (another web view version) nothing changes and the
/// system's default applies.
enum FPWritingTools {
  private static var installed = false

  static func install() {
    guard #available(iOS 18.0, *) else { return }
    DispatchQueue.main.async {
      guard !installed else { return }
      installed = true
      let selector = NSSelectorFromString("setUpWkWebViewConfig")
      guard let type = NSClassFromString("RNCWebViewImpl"),
            let method = class_getInstanceMethod(type, selector) else { return }
      typealias SetUp = @convention(c) (AnyObject, Selector) -> WKWebViewConfiguration
      let original = unsafeBitCast(method_getImplementation(method), to: SetUp.self)
      let replacement: @convention(block) (AnyObject) -> WKWebViewConfiguration = { view in
        let configuration = original(view, selector)
        configuration.writingToolsBehavior = .complete
        return configuration
      }
      method_setImplementation(method, imp_implementationWithBlock(replacement))
    }
  }
}

/// Before the first web view: installed when the app starts.
public class FlowplanWritingToolsSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    FPWritingTools.install()
    return true
  }
}
