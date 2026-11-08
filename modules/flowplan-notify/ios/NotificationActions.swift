import ExpoModulesCore
import ExpoNotifications
import Foundation
import os
import Security
import UIKit
import UserNotifications

// The buttons on Flowplan's push notifications – "Done", "Tomorrow",
// "Reply", "Mark as read", "Reject" (categories registered from JavaScript,
// src/native/notification-actions.ts) – are answered here in Swift: iOS
// starts or wakes the app in the background for a button and gives it only
// a few seconds, too few to load JavaScript first. The request
// (POST /api/mobile/notifications with the device token, lib/notification-
// actions.ts in Flowplan) runs in a background task; what goes wrong becomes
// a notification that opens the page. JavaScript ignores these buttons on
// iOS (expo-notifications reports them there too).

/// Instance, device token and language for the buttons, in the app's own
/// keychain item (readable after the first unlock: buttons work while the
/// phone is locked). Written by the app at start, sign-in and sign-out.
struct FPNotifySession: Codable {
  var server: String
  var token: String
  var lang: String
}

enum FPNotifyKeychain {
  private static func query() -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "app.flowplan.notify",
      kSecAttrAccount as String: "session",
    ]
  }

  static func load() -> FPNotifySession? {
    var search = query()
    search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status: OSStatus = SecItemCopyMatching(search as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return try? JSONDecoder().decode(FPNotifySession.self, from: data)
  }

  /// Writes (or with nil removes) the session; false when the keychain refused.
  @discardableResult
  static func save(_ session: FPNotifySession?) -> Bool {
    let base = query()
    let removed: OSStatus = SecItemDelete(base as CFDictionary)
    guard let session = session, let data = try? JSONEncoder().encode(session) else {
      return removed == errSecSuccess || removed == errSecItemNotFound
    }
    var item = base
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status: OSStatus = SecItemAdd(item as CFDictionary, nil)
    if status != errSecSuccess {
      os_log("Notification session not saved: %ld", log: FPNotificationActions.log, type: .error, Int(status))
    }
    return status == errSecSuccess
  }
}

/// Keeps the app running until the request has an answer (at most the
/// time iOS grants a background task).
final class FPBackgroundTask {
  private var identifier: UIBackgroundTaskIdentifier = .invalid

  func begin() {
    identifier = UIApplication.shared.beginBackgroundTask(withName: "FlowplanNotificationAction") { [weak self] in
      self?.end()
    }
  }

  func end() {
    if identifier == .invalid { return }
    UIApplication.shared.endBackgroundTask(identifier)
    identifier = .invalid
  }
}

final class FPNotificationActions: NotificationDelegate {
  static let shared = FPNotificationActions()
  static let log = OSLog(subsystem: "app.flowplan.mobile", category: "notifications")
  /// The localized texts of the notification about a failed button
  /// (failedTitle, failedBody), handed over by the app at every start.
  static let textsKey = "FlowplanNotifyTexts"
  /// The buttons' identifiers and the action the instance knows them by.
  static let actions: [String: String] = [
    "fp.done": "done",
    "fp.tomorrow": "tomorrow",
    "fp.reply": "reply",
    "fp.read": "read",
    // "Approve" (fp.approve) is not here: it opens the app, which asks for
    // Face ID / Touch ID before it sends anything (src/native/notification-
    // actions.ts answerApproval). "Reject" needs no confirmation (the
    // instance names the approval from the notification).
    "fp.reject": "reject",
  ]

  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    guard let action = Self.actions[response.actionIdentifier] else { return false }
    let data = Self.data(of: response.notification.request)
    let link = data["url"] as? String
    guard let notificationId = data["notificationId"] as? String, !notificationId.isEmpty else {
      Self.failed(link: link, message: nil)
      return true
    }
    var body: [String: Any] = ["action": action, "notificationId": notificationId, "today": Self.today()]
    if action == "reply" {
      let typed = (response as? UNTextInputNotificationResponse)?.userText ?? ""
      let text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
      // Sent without text: nothing to answer.
      if text.isEmpty { return true }
      body["text"] = text
    }
    // Through the push relay the notification names its instance
    // (PushShared.swift): its id goes to that instance only.
    Self.send(body, link: link, origin: data["origin"] as? String)
    return true
  }

  /// What the instance put into `data`: under "body" for pushes through
  /// Expo's service and the push relay (decrypted by the Notification
  /// Service Extension), the whole userInfo for notifications of the app
  /// itself.
  static func data(of request: UNNotificationRequest) -> [String: Any] {
    let info = request.content.userInfo
    if let body = info["body"] as? [String: Any] { return body }
    var out: [String: Any] = [:]
    for (key, value) in info {
      if let name = key as? String { out[name] = value }
    }
    return out
  }

  /// The phone's day ("2026-10-24"), for "Tomorrow".
  static func today() -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone.current
    let parts = calendar.dateComponents([.year, .month, .day], from: Date())
    let year = parts.year ?? 1970
    let month = parts.month ?? 1
    let day = parts.day ?? 1
    return String(format: "%04d-%02d-%02d", year, month, day)
  }

  static func send(_ body: [String: Any], link: String?, origin: String? = nil) {
    guard let session = FPNotifyKeychain.load() else {
      os_log("No session for the notification's button", log: log, type: .error)
      failed(link: link, message: nil)
      return
    }
    if let origin = origin, origin != session.server {
      os_log("Notification of another instance than the active profile's", log: log, type: .error)
      failed(link: nil, message: nil)
      return
    }
    let lang = session.lang.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "en"
    guard let endpoint = URL(string: "\(session.server)/api/mobile/notifications?lang=\(lang)") else {
      failed(link: link, message: nil)
      return
    }
    var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
    request.httpMethod = "POST"
    request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    // One key per tap, the same on the retry: the instance acts once even
    // when the first attempt arrived and only its answer got lost.
    request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    let background = FPBackgroundTask()
    background.begin()
    attempt(request, retries: 1, link: link, background: background)
  }

  /// Sends the button's request; without any answer once more (same
  /// request, same Idempotency-Key) after a second.
  static func attempt(_ request: URLRequest, retries: Int, link: String?, background: FPBackgroundTask) {
    URLSession.shared.dataTask(with: request) { data, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      if status == 0, error != nil, retries > 0 {
        DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
          attempt(request, retries: retries - 1, link: link, background: background)
        }
        return
      }
      var answer: [String: Any] = [:]
      if let data = data, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
        answer = object
      }
      if status == 200 {
        if let unread = answer["unread"] as? Int {
          UNUserNotificationCenter.current().setBadgeCount(unread) { _ in }
        }
      } else {
        let reason = error?.localizedDescription ?? ""
        os_log("Notification button failed: %ld %{public}@", log: log, type: .error, status, reason)
        // The instance's own words when it answered (e.g. "The task no
        // longer exists as it was").
        failed(link: link, message: answer["error"] as? String)
      }
      DispatchQueue.main.async {
        background.end()
      }
    }.resume()
  }

  /// A notification that says the button did not work; tapping it opens
  /// what the original notification was about.
  static func failed(link: String?, message: String?) {
    let texts = UserDefaults.standard.dictionary(forKey: textsKey) as? [String: String] ?? [:]
    let content = UNMutableNotificationContent()
    content.title = texts["failedTitle"] ?? "Flowplan"
    var text = texts["failedBody"] ?? "That did not work. Open Flowplan to try again."
    if let message = message, !message.isEmpty {
      text = message
    }
    content.body = text
    if let link = link {
      content.userInfo = ["url": link]
    }
    let request = UNNotificationRequest(identifier: "flowplan-action-failed-\(UUID().uuidString)", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request) { _ in }
  }
}

/// Joins expo-notifications' notification center delegate as early as
/// possible: a button tapped while the app was not running arrives right
/// after the launch.
public class FlowplanNotifyAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    NotificationCenterManager.shared.addDelegate(FPNotificationActions.shared)
    return true
  }
}
