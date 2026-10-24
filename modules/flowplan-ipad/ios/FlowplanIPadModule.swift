import ExpoModulesCore
import UIKit

/// The iPad's side of the Flowplan app (src/windows.ts, src/ipad.ts):
/// - several windows (Split View, Slide Over, Stage Manager; on iPhone Duo
///   the inner display): "Open in new window" asks UIKit for a new scene,
///   which the app's SceneDelegate (plugins/with-ipad.js) starts with the
///   page as initial properties;
/// - the web app's keyboard shortcuts as UIKeyCommands: holding ⌘ lists them
///   (the discoverability overlay), pressing one runs it in the page of the
///   window it was pressed in;
/// - Handoff: every window advertises its page as NSUserActivity
///   "app.flowplan.page" with the page's address as webpageURL, which the Mac
///   app (flowplan-desktop), another iPad or – without an app – the browser
///   continues. Pages handed over from there arrive in
///   FlowplanHandoffSubscriber.
public class FlowplanIPadModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("FlowplanIPad")

    Events("onKeyCommand", "onContinuePage", "onWindowRefused")

    OnCreate {
      let center = NotificationCenter.default
      // UIKit opened no window for the page (none possible right now, e.g.
      // on the outer display of iPhone Duo): the window that asked shows it.
      self.observers.append(center.addObserver(forName: FlowplanWindows.refused, object: nil, queue: .main) { [weak self] note in
        let scene = note.userInfo?["scene"] as? String ?? ""
        let url = note.userInfo?["url"] as? String ?? ""
        self?.sendEvent("onWindowRefused", ["scene": scene, "url": url])
      })
      // The page stays waiting until the app takes it (consumeContinuedPage):
      // on a cold start nobody listens yet.
      self.observers.append(center.addObserver(forName: FlowplanHandoff.continued, object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onContinuePage", [:])
      })
      self.observers.append(center.addObserver(forName: FlowplanKeyCommands.pressed, object: nil, queue: .main) { [weak self] note in
        let scene = note.userInfo?["scene"] as? String ?? ""
        let action = note.userInfo?["action"] as? String ?? ""
        self?.sendEvent("onKeyCommand", ["scene": scene, "action": action])
      })
    }

    // Whether the app may have more than one window at all (Info.plist; it
    // asks for them on every device, UIKit gives them where it can).
    Function("multipleScenes") { () -> Bool in
      let manifest = Bundle.main.object(forInfoDictionaryKey: "UIApplicationSceneManifest") as? [String: Any]
      return manifest?["UIApplicationSupportsMultipleScenes"] as? Bool ?? false
    }

    // Whether "Open in new window" makes sense in this window now: the device
    // has several windows (iPad, the inner display of iPhone Duo – not an
    // ordinary iPhone) and – on an iPhone – the window is wide (regular
    // width). Asked again whenever the window changes size.
    AsyncFunction("windowsAvailable") { (scene: String?, promise: Promise) in
      Task { @MainActor in
        promise.resolve(FlowplanWindows.available(in: scene))
      }
    }

    // A page handed over from another device (Handoff), at most once.
    Function("consumeContinuedPage") { () -> String? in
      FlowplanHandoff.takePending()
    }

    // A new window with this page of the instance, next to `scene`.
    Function("openWindow") { (url: String, scene: String?) in
      Task { @MainActor in
        FlowplanWindows.open(url: url, from: scene)
      }
    }

    // The page a window shows (nil: none to hand over), for Handoff and for
    // restoring the window. restore: the window opens this page again when
    // iPadOS brings it back (the windows besides the main one).
    Function("setPage") { (scene: String?, page: [String: Any]?) in
      let url = page?["url"] as? String
      let title = page?["title"] as? String
      let restore = page?["restore"] as? Bool ?? false
      Task { @MainActor in
        FlowplanWindows.setPage(scene: scene, url: url, title: title, restore: restore)
      }
    }

    // The shortcuts of the page in this window: [{ action, title, input,
    // modifiers, hidden }]; an empty list takes them away.
    Function("setKeyCommands") { (scene: String?, commands: [[String: Any]]) in
      Task { @MainActor in
        FlowplanKeyCommands.set(scene: scene, commands: commands)
      }
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers = []
    }
  }
}

/// The windows (scenes) of the app and the page each one advertises.
@MainActor
enum FlowplanWindows {
  /// The current page of a window, for Handoff and for restoring the window.
  static let pageType = "app.flowplan.page"
  /// Asks for a new window with a page ("Open in new window").
  static let windowType = "app.flowplan.window"

  private static var activities: [String: NSUserActivity] = [:]

  /// The window with this id (UISceneSession.persistentIdentifier, handed to
  /// the page as initial property); without an id the one in front. A window
  /// that is gone is nil.
  static func scene(_ id: String?) -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let id = id, !id.isEmpty {
      return scenes.first(where: { $0.session.persistentIdentifier == id })
    }
    return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
  }

  static func rootController(of scene: UIWindowScene) -> UIViewController? {
    (scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first)?.rootViewController
  }

  /// Posted when no new window opened: userInfo ["scene", "url"].
  nonisolated static let refused = Notification.Name("FlowplanWindowRefused")

  /// Size-based, not by device model: the iPad always (also in a narrow
  /// Split View), an iPhone only where UIKit supports several scenes
  /// (iPhone Duo) and the window is regular width (the inner display;
  /// the outer one can open no new windows).
  static func available(in sceneId: String?) -> Bool {
    guard UIApplication.shared.supportsMultipleScenes else { return false }
    if UIDevice.current.userInterfaceIdiom == .pad { return true }
    guard let windowScene = scene(sceneId) else { return false }
    return windowScene.traitCollection.horizontalSizeClass == .regular
  }

  /// No window opened for the page: the window that asked shows it
  /// (onWindowRefused). Callable from UIKit's error handler on any thread.
  nonisolated static func refuse(url: String, from sceneId: String?, reason: String) {
    NSLog("Flowplan: no new window (%@)", reason)
    NotificationCenter.default.post(name: refused, object: nil, userInfo: ["scene": sceneId ?? "", "url": url])
  }

  static func open(url: String, from sceneId: String?) {
    guard UIApplication.shared.supportsMultipleScenes else {
      refuse(url: url, from: sceneId, reason: "one window only")
      return
    }
    let activity = NSUserActivity(activityType: windowType)
    activity.userInfo = ["url": url]
    let options = UIScene.ActivationRequestOptions()
    options.requestingScene = scene(sceneId)
    UIApplication.shared.requestSceneSessionActivation(nil, userActivity: activity, options: options) { error in
      FlowplanWindows.refuse(url: url, from: sceneId, reason: error.localizedDescription)
    }
  }

  static func setPage(scene sceneId: String?, url: String?, title: String?, restore: Bool) {
    guard let windowScene = scene(sceneId) else { return }
    let key = windowScene.session.persistentIdentifier
    let controller = rootController(of: windowScene)
    guard let url = url, let address = URL(string: url), address.scheme == "https" || address.scheme == "http" else {
      activities[key]?.invalidate()
      activities[key] = nil
      controller?.userActivity = nil
      windowScene.userActivity = nil
      return
    }
    if let current = activities[key], current.webpageURL == address, current.title == title,
       (current.userInfo?["window"] as? String == "page") == restore {
      return
    }
    activities[key]?.invalidate()
    let activity = NSUserActivity(activityType: pageType)
    activity.title = title
    activity.webpageURL = address
    var info: [String: Any] = ["url": url]
    if restore { info["window"] = "page" }
    activity.userInfo = info
    activity.requiredUserInfoKeys = ["url"]
    activity.isEligibleForHandoff = true
    activity.isEligibleForSearch = false
    activity.isEligibleForPublicIndexing = false
    activity.isEligibleForPrediction = false
    activities[key] = activity
    // The scene keeps it for restoring the window (SceneDelegate), the
    // window's view controller makes it current while the window is in
    // front – for each window its own page.
    windowScene.userActivity = activity
    controller?.userActivity = activity
    if windowScene.activationState == .foregroundActive {
      activity.becomeCurrent()
    }
  }
}

/// The web app's shortcuts as key commands of a window's root view
/// controller: in the overlay that holding ⌘ shows, and sent to the page of
/// that window when pressed (FlowplanIPadModule → onKeyCommand).
@MainActor
enum FlowplanKeyCommands {
  static let pressed = Notification.Name("FlowplanKeyCommand")

  private struct Installed {
    weak var controller: UIViewController?
    let commands: [UIKeyCommand]
  }
  private static var installed: [String: Installed] = [:]

  static func set(scene sceneId: String?, commands: [[String: Any]]) {
    guard let windowScene = FlowplanWindows.scene(sceneId) else { return }
    let key = windowScene.session.persistentIdentifier
    if let previous = installed[key] {
      previous.commands.forEach { previous.controller?.removeKeyCommand($0) }
      installed[key] = nil
    }
    guard let controller = FlowplanWindows.rootController(of: windowScene) else { return }
    let made = commands.compactMap(make)
    made.forEach { controller.addKeyCommand($0) }
    installed[key] = Installed(controller: controller, commands: made)
  }

  private static func make(_ spec: [String: Any]) -> UIKeyCommand? {
    guard let action = spec["action"] as? String,
          let title = spec["title"] as? String,
          let raw = spec["input"] as? String,
          let input = input(raw) else { return nil }
    var flags: UIKeyModifierFlags = []
    for name in spec["modifiers"] as? [String] ?? [] {
      switch name {
      case "command": flags.insert(.command)
      case "alternate": flags.insert(.alternate)
      case "control": flags.insert(.control)
      case "shift": flags.insert(.shift)
      default: break
      }
    }
    // Without ⌘, ⌃ or ⌥ a key command would take keys away from typing.
    guard !flags.intersection([.command, .control, .alternate]).isEmpty else { return nil }
    let command = UIKeyCommand(
      title: title,
      image: nil,
      action: #selector(UIViewController.flowplanKeyCommand(_:)),
      input: input,
      modifierFlags: flags,
      propertyList: action
    )
    command.discoverabilityTitle = title
    // Further combinations of the same action work, but the overlay lists
    // each action once.
    if spec["hidden"] as? Bool == true {
      command.attributes = .hidden
    }
    return command
  }

  // The page's names for keys that are not a character (src/ipad.ts).
  private static func input(_ raw: String) -> String? {
    switch raw {
    case "up": return UIKeyCommand.inputUpArrow
    case "down": return UIKeyCommand.inputDownArrow
    case "left": return UIKeyCommand.inputLeftArrow
    case "right": return UIKeyCommand.inputRightArrow
    case "escape": return UIKeyCommand.inputEscape
    case "pageUp": return UIKeyCommand.inputPageUp
    case "pageDown": return UIKeyCommand.inputPageDown
    case "home": return UIKeyCommand.inputHome
    case "end": return UIKeyCommand.inputEnd
    case "delete": return UIKeyCommand.inputDelete
    default: break
    }
    // UIKit's F-key inputs (UIKeyInputF1 …) are UIKeyCommand.f1 … f12 in Swift.
    let functionKeys = [
      UIKeyCommand.f1, UIKeyCommand.f2, UIKeyCommand.f3, UIKeyCommand.f4,
      UIKeyCommand.f5, UIKeyCommand.f6, UIKeyCommand.f7, UIKeyCommand.f8,
      UIKeyCommand.f9, UIKeyCommand.f10, UIKeyCommand.f11, UIKeyCommand.f12,
    ]
    if raw.count > 1, raw.hasPrefix("f"), let number = Int(raw.dropFirst()), number >= 1, number <= functionKeys.count {
      return functionKeys[number - 1]
    }
    return raw.count == 1 ? raw : nil
  }
}

extension UIViewController {
  /// A shortcut of the page (FlowplanKeyCommands): reported with the window
  /// it was pressed in, whose page runs it.
  @objc func flowplanKeyCommand(_ command: UIKeyCommand) {
    guard let action = command.propertyList as? String else { return }
    let scene = viewIfLoaded?.window?.windowScene?.session.persistentIdentifier ?? ""
    NotificationCenter.default.post(name: FlowplanKeyCommands.pressed, object: nil, userInfo: ["scene": scene, "action": action])
  }
}
