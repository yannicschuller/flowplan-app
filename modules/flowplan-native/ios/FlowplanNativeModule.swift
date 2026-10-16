import ExpoModulesCore

/// What the Flowplan app needs from iOS beyond Expo's modules: the address a
/// managed installation suggests (MDM "Managed App Configuration", key
/// "server"). Sharing and the timer notification are Android's (iOS has the
/// Live Activity from expo-widgets instead).
public class FlowplanNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanNative")

    Events("onShare")

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
  }
}
