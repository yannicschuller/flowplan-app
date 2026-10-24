import ExpoModulesCore

/// Pages handed over from the Mac app (flowplan-desktop) or another iPad or
/// iPhone (Handoff, activity type "app.flowplan.page"): kept until the app
/// takes them (FlowplanIPadModule.consumeContinuedPage), so a page that
/// starts the app is not lost before its JavaScript runs. The app opens it
/// only on an instance it knows (src/ipad.ts).
public class FlowplanHandoffSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([any UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == FlowplanHandoff.pageType else { return false }
    guard let url = userActivity.webpageURL?.absoluteString ?? (userActivity.userInfo?["url"] as? String) else { return false }
    FlowplanHandoff.receive(url)
    return true
  }
}

enum FlowplanHandoff {
  static let pageType = "app.flowplan.page"
  static let continued = Notification.Name("FlowplanContinuePage")

  private static let lock = NSLock()
  private static var pending: (url: String, at: Date)?

  static func receive(_ url: String) {
    lock.lock()
    pending = (url, Date())
    lock.unlock()
    NotificationCenter.default.post(name: continued, object: nil)
  }

  /// The page waiting to be opened; a fresh one only (two minutes).
  static func takePending() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let waiting = pending else { return nil }
    pending = nil
    return Date().timeIntervalSince(waiting.at) < 120 ? waiting.url : nil
  }
}
