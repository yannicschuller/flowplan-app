import ExpoModulesCore
import Foundation

/// What the app hands to the notification buttons (NotificationActions.swift):
/// the session they act with and the texts of the "did not work" notification.
public class FlowplanNotifyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanNotify")

    // Instance, device token and language; nil (or no token): signed out,
    // the buttons answer with "did not work".
    Function("setSession") { (session: [String: Any]?) -> Bool in
      guard let session = session,
            let server = session["server"] as? String,
            let token = session["token"] as? String,
            !token.isEmpty else {
        return FPNotifyKeychain.save(nil)
      }
      let lang = session["lang"] as? String ?? "en"
      return FPNotifyKeychain.save(FPNotifySession(server: server, token: token, lang: lang))
    }

    Function("setTexts") { (texts: [String: String]) in
      UserDefaults.standard.set(texts, forKey: FPNotificationActions.textsKey)
    }
  }
}
