import ExpoModulesCore
import Foundation

/// What the App Intents of the app (plugins/intents/app) share with the
/// JavaScript side, through the App Group's UserDefaults:
/// - the profiles (id, name, address, the active one), which the Focus
///   filter offers to choose from (flowplan.intents.profiles);
/// - the Focus filter now (flowplan.focus.filter, FlowplanFocusFilter.swift
///   describes it), and an event when it changes while the app runs.
public class FlowplanIntentsModule: Module {
  private var focusObserver: NSObjectProtocol?

  private static var defaults: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String else { return nil }
    return UserDefaults(suiteName: group)
  }

  public func definition() -> ModuleDefinition {
    Name("FlowplanIntents")

    Events("onFocusFilter")

    OnCreate {
      self.focusObserver = NotificationCenter.default.addObserver(forName: Notification.Name("FlowplanFocusFilter"), object: nil, queue: .main) { [weak self] _ in
        self?.sendEvent("onFocusFilter", [:])
      }
    }

    OnDestroy {
      if let observer = self.focusObserver {
        NotificationCenter.default.removeObserver(observer)
      }
    }

    // JSON text: { profiles: [{ id, name, server }], active }.
    Function("setProfiles") { (json: String) in
      Self.defaults?.set(json, forKey: "flowplan.intents.profiles")
    }

    // JSON text, or nil before any Focus filter ran.
    Function("focusFilter") { () -> String? in
      Self.defaults?.string(forKey: "flowplan.focus.filter")
    }
  }
}
