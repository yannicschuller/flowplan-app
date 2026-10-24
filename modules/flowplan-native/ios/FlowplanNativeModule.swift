import ExpoModulesCore
import UIKit
import WebKit
import WidgetKit

/// What the Flowplan app needs from iOS beyond Expo's modules:
/// - the address a managed installation suggests (MDM "Managed App
///   Configuration", key "server");
/// - Apple Pencil double-tap and squeeze, with the action chosen in the
///   iPad's settings (Settings → Apple Pencil), for the whiteboard and the
///   image markup of the page;
/// - the swipe from the left edge for "back" (the web view's own gesture
///   walks its history, which is not what back means in Flowplan): a chevron
///   follows the finger, and the app asks the page what back is.
/// - the session of the configurable widgets (WidgetShared.swift): the
///   widget extension reads instance, device token, profile and language
///   from the App Group's keychain and asks the instance itself;
/// - links that App Shortcuts and Siri hand to the app ("Voice memo",
///   "Start focus"), and donations of those shortcuts.
/// Sharing and the timer notification are Android's (iOS has the Live
/// Activity from expo-widgets instead).
public class FlowplanNativeModule: Module {
  private var pencil: PencilObserver?
  private var edgeSwipe: EdgeSwipeObserver?
  private var linkObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("FlowplanNative")

    Events("onShare", "onPencil", "onEdgeSwipe", "onAppLink")

    OnCreate {
      // App Intents that open the app (FlowplanAppIntents.swift) leave
      // their link here; a running app gets it at once.
      self.linkObserver = NotificationCenter.default.addObserver(forName: Notification.Name("FlowplanAppLink"), object: nil, queue: .main) { [weak self] _ in
        if let link = Self.takePendingLink() {
          self?.sendEvent("onAppLink", ["url": link])
        }
      }
    }

    // Instance, device token (nil: signed out – the widgets ask to sign in
    // and keep their settings), profile and language for the widgets.
    // Another profile: the previous one's answers go.
    Function("setWidgetSession") { (session: [String: Any]?) in
      let previous = FPKeychain.load()
      guard let session,
            let server = session["server"] as? String,
            let profile = session["profile"] as? String else {
        if let previous { FPStore.clear(profile: previous.profile) }
        FPKeychain.save(nil)
        Self.reloadWidgets()
        return
      }
      let next = FPSession(server: server, token: session["token"] as? String, profile: profile, lang: (session["lang"] as? String) ?? "en")
      if previous == next { return }
      if let previous, previous.profile != next.profile || previous.server != next.server || next.token == nil {
        FPStore.clear(profile: previous.profile)
      }
      FPKeychain.save(next)
      if next.token != nil { FPStore.signedIn(next) }
      Self.reloadWidgets()
    }

    // After a change in the page or the app: widgets and controls ask again.
    Function("reloadWidgets") {
      Self.reloadWidgets()
    }

    // The last action of a widget's button that went wrong (the app's
    // settings show it); nil when none did.
    Function("widgetActionError") { () -> [String: Any]? in
      guard let error = FPActions.lastError() else { return nil }
      let entry: [String: Any] = ["action": error.action, "status": error.status, "message": error.message, "at": error.at.timeIntervalSince1970 * 1000]
      return entry
    }

    Function("consumePendingLink") { () -> String? in
      Self.takePendingLink()
    }

    // Siri suggestions: "note", "voice", "timer", "focus", "today".
    Function("donateShortcut") { (name: String) in
      guard let type = NSClassFromString("FlowplanIntentDonor") as? NSObject.Type else { return }
      _ = type.init().perform(NSSelectorFromString("donate:"), with: name)
    }

    Function("getManagedServer") { () -> String? in
      let managed = UserDefaults.standard.dictionary(forKey: "com.apple.configuration.managed")
      let value = (managed?["server"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
      return value?.isEmpty == false ? value : nil
    }

    Function("consumeSharedText") { () -> [String: String]? in
      nil
    }

    Function("showTimer") { (_: [String: Any]) in
    }

    Function("hideTimer") {
    }

    // Listens to the Apple Pencil once the app's window is there.
    Function("startPencil") {
      Task { @MainActor [weak self] in
        guard let self = self, self.pencil == nil else { return }
        let observer = PencilObserver { [weak self] payload in
          self?.sendEvent("onPencil", payload)
        }
        if observer.attach() {
          self.pencil = observer
        }
      }
    }

    // The edge swipe is on while the window on the instance is in front
    // and the page has a step back.
    Function("setEdgeSwipe") { (enabled: Bool) in
      Task { @MainActor [weak self] in
        guard let self = self else { return }
        if self.edgeSwipe == nil {
          let observer = EdgeSwipeObserver { [weak self] in
            self?.sendEvent("onEdgeSwipe", [:])
          }
          guard observer.attach() else { return }
          self.edgeSwipe = observer
        }
        self.edgeSwipe?.enabled = enabled
      }
    }

    OnDestroy {
      if let linkObserver = self.linkObserver {
        NotificationCenter.default.removeObserver(linkObserver)
      }
      let observer = self.pencil
      let edge = self.edgeSwipe
      Task { @MainActor in
        observer?.detach()
        edge?.detach()
      }
    }
  }
}

extension FlowplanNativeModule {
  static func reloadWidgets() {
    FPWidgets.reloadAll()
    if #available(iOS 18.0, *) {
      ControlCenter.shared.reloadAllControls()
    }
  }

  static func takePendingLink() -> String? {
    guard let defaults = FPShared.defaults, let link = defaults.string(forKey: "flowplan.pendingLink") else { return nil }
    defaults.removeObject(forKey: "flowplan.pendingLink")
    // Only the app's own links, fresh ones.
    let at = defaults.double(forKey: "flowplan.pendingLinkAt")
    guard link.hasPrefix("flowplan://"), Date().timeIntervalSince1970 - at < 120 else { return nil }
    return link
  }
}

/// Double-tap (Apple Pencil 2nd generation, Pro) and squeeze (Pro) on the
/// app's window.
@MainActor
final class PencilObserver: NSObject, UIPencilInteractionDelegate {
  private let send: ([String: Any?]) -> Void
  private var interaction: UIPencilInteraction?
  private weak var host: UIView?

  init(send: @escaping ([String: Any?]) -> Void) {
    self.send = send
  }

  func attach() -> Bool {
    guard UIDevice.current.userInterfaceIdiom == .pad else { return false }
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else { return false }
    let interaction = UIPencilInteraction()
    interaction.delegate = self
    window.addInteraction(interaction)
    self.interaction = interaction
    host = window
    return true
  }

  func detach() {
    if let interaction = interaction {
      host?.removeInteraction(interaction)
    }
    interaction = nil
  }

  @available(iOS 17.5, *)
  func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
    send(["gesture": "tap", "preferred": Self.name(UIPencilInteraction.preferredTapAction)])
  }

  @available(iOS 17.5, *)
  func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
    // Once per squeeze, when it ends.
    guard squeeze.phase == .ended else { return }
    send(["gesture": "squeeze", "preferred": Self.name(UIPencilInteraction.preferredSqueezeAction)])
  }

  // Before iOS 17.5 only the double-tap exists.
  func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
    if #available(iOS 17.5, *) { return }
    send(["gesture": "tap", "preferred": Self.name(UIPencilInteraction.preferredTapAction)])
  }

  private static func name(_ action: UIPencilPreferredAction) -> String {
    if action == .switchEraser { return "switchEraser" }
    if action == .switchPrevious { return "switchPrevious" }
    if action == .showColorPalette { return "showColorPalette" }
    if action == .showInkAttributes { return "showInkAttributes" }
    if #available(iOS 17.5, *), action == .showContextualPalette { return "showContextualPalette" }
    // "Ignore" and system shortcuts: nothing for the page to do.
    return "ignore"
  }
}

/// Swipe from the left edge of the window: a round chevron comes in with the
/// finger; past the threshold (or with a quick flick) it fires "back".
/// The web view's own gestures wait until this one has failed, which an
/// edge swipe does at once when the touch does not begin at the edge.
@MainActor
final class EdgeSwipeObserver: NSObject, UIGestureRecognizerDelegate {
  private let fire: () -> Void
  private var recognizer: UIScreenEdgePanGestureRecognizer?
  private weak var host: UIWindow?
  private var indicator: UIView?
  private var armed = false
  private let threshold: CGFloat = 72
  private let size: CGFloat = 40

  var enabled = false {
    didSet { recognizer?.isEnabled = enabled }
  }

  init(fire: @escaping () -> Void) {
    self.fire = fire
  }

  func attach() -> Bool {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else { return false }
    let recognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(pan(_:)))
    recognizer.edges = .left
    recognizer.delegate = self
    recognizer.isEnabled = enabled
    window.addGestureRecognizer(recognizer)
    self.recognizer = recognizer
    host = window
    return true
  }

  func detach() {
    if let recognizer = recognizer {
      host?.removeGestureRecognizer(recognizer)
    }
    recognizer = nil
    indicator?.removeFromSuperview()
    indicator = nil
  }

  // Only over the web view: the app's own screens (settings, setup) keep
  // their gestures.
  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard let window = host else { return false }
    let point = gestureRecognizer.location(in: window)
    var view = window.hitTest(point, with: nil)
    while let current = view {
      if current is WKWebView { return true }
      view = current.superview
    }
    return false
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
    var view = other.view
    while let current = view {
      if current is WKWebView { return true }
      view = current.superview
    }
    return false
  }

  @objc private func pan(_ recognizer: UIScreenEdgePanGestureRecognizer) {
    guard let window = host else { return }
    let distance = max(0, recognizer.translation(in: window).x)
    let y = recognizer.location(in: window).y
    switch recognizer.state {
    case .began:
      armed = false
      show(in: window, y: y)
      move(distance: distance, y: y)
    case .changed:
      move(distance: distance, y: y)
      let past = distance >= threshold
      if past != armed {
        armed = past
        if past { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        UIView.animate(withDuration: 0.12) {
          self.indicator?.transform = past ? CGAffineTransform(scaleX: 1.12, y: 1.12) : .identity
          self.indicator?.alpha = past ? 1 : 0.85
        }
      }
    case .ended:
      let flick = recognizer.velocity(in: window).x > 700 && distance > 24
      hide()
      if armed || flick { fire() }
      armed = false
    default:
      hide()
      armed = false
    }
  }

  private func show(in window: UIWindow, y: CGFloat) {
    indicator?.removeFromSuperview()
    let view = UIView(frame: CGRect(x: -size, y: y - size / 2, width: size, height: size))
    view.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.96)
    view.layer.cornerRadius = size / 2
    view.layer.shadowColor = UIColor.black.cgColor
    view.layer.shadowOpacity = 0.18
    view.layer.shadowRadius = 6
    view.layer.shadowOffset = CGSize(width: 0, height: 2)
    view.isUserInteractionEnabled = false
    view.alpha = 0.85
    let chevron = UIImageView(image: UIImage(systemName: "chevron.left", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)))
    chevron.tintColor = UIColor.label
    chevron.contentMode = .center
    chevron.frame = view.bounds
    view.addSubview(chevron)
    window.addSubview(view)
    indicator = view
  }

  private func move(distance: CGFloat, y: CGFloat) {
    // Follows the finger, slower past the threshold (rubber band).
    let travel = distance < threshold ? distance : threshold + (distance - threshold) * 0.25
    indicator?.center = CGPoint(x: -size / 2 + min(travel, threshold + 24) * 0.9 + 8, y: y)
  }

  private func hide() {
    guard let view = indicator else { return }
    indicator = nil
    UIView.animate(withDuration: 0.18, animations: {
      view.alpha = 0
      view.center.x = -self.size / 2
    }, completion: { _ in view.removeFromSuperview() })
  }
}
