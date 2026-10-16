import ExpoModulesCore
import UIKit

/// What the Flowplan app needs from iOS beyond Expo's modules:
/// - the address a managed installation suggests (MDM "Managed App
///   Configuration", key "server");
/// - Apple Pencil double-tap and squeeze, with the action chosen in the
///   iPad's settings (Settings → Apple Pencil), for the whiteboard and the
///   image markup of the page.
/// Sharing and the timer notification are Android's (iOS has the Live
/// Activity from expo-widgets instead).
public class FlowplanNativeModule: Module {
  private var pencil: PencilObserver?

  public func definition() -> ModuleDefinition {
    Name("FlowplanNative")

    Events("onShare", "onPencil")

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

    OnDestroy {
      let observer = self.pencil
      Task { @MainActor in
        observer?.detach()
      }
    }
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
