import Foundation
import UserNotifications

// The Notification Service Extension FlowplanNotifications (plugins/
// with-notification-service.js): every alert through the Flowplan push relay
// arrives with mutable-content, a placeholder text and the encrypted payload
// in `fp` (PROTOCOL.md §3; the placeholder as FP_PUSH_TITLE / FP_PUSH_BODY of
// the app's Localizable.strings, §6.8). Here – on the device, in the App Group – the
// payload is decrypted with the profile's key (PushShared.swift) and becomes
// title, text, buttons (category) and the data the app and its buttons read
// (userInfo["body"]: url, notificationId, origin). Whatever does not decrypt
// or check out stays a placeholder ("New notification") without buttons and
// without a link – never a plaintext from outside the encryption.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var handler: ((UNNotificationContent) -> Void)?
  private var fallback: UNNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    // Not from the relay (no `fp`): left as it came.
    guard let payload = request.content.userInfo["fp"] as? String else {
      contentHandler(request.content)
      return
    }
    let placeholder = FPNotificationContent.placeholder(from: request.content)
    lock.lock()
    handler = contentHandler
    fallback = placeholder
    lock.unlock()
    let result = FPNotificationContent.decrypted(payload, from: request.content) ?? placeholder
    finish(with: result)
  }

  // Time is up (about 30 seconds): the placeholder.
  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let content = fallback
    lock.unlock()
    if let content = content { finish(with: content) }
  }

  private func finish(with content: UNNotificationContent) {
    lock.lock()
    let deliver = handler
    handler = nil
    fallback = nil
    lock.unlock()
    deliver?(content)
  }
}

enum FPNotificationContent {
  /// "Flowplan" – "New notification" in the phone's language, no buttons, no
  /// link, no ciphertext left in it.
  static func placeholder(from original: UNNotificationContent) -> UNNotificationContent {
    let content = (original.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    content.title = "Flowplan"
    content.subtitle = ""
    content.body = placeholderText()
    content.categoryIdentifier = ""
    content.userInfo = [:]
    return content
  }

  static func decrypted(_ payload: String, from original: UNNotificationContent) -> UNNotificationContent? {
    guard let opened = FPPushCrypto.open(payload) else { return nil }
    guard let message = FPPushMessage.parse(opened.plaintext, origin: opened.key.origin) else { return nil }
    // Shown before (the relay repeating a message): its content not again.
    // Without Apple's filtering entitlement the extension cannot drop a
    // notification, so it stays the placeholder.
    if FPPushSeen.again(message.id, origin: message.origin) { return nil }
    let content = (original.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    content.title = message.title
    content.subtitle = ""
    content.body = message.body
    // Buttons only from the encrypted category (NotificationActions.swift
    // answers them with the notification's id).
    content.categoryIdentifier = message.category ?? ""
    content.userInfo = message.userInfo
    return content
  }

  static func placeholderText() -> String {
    let language = Locale.preferredLanguages.first?.prefix(2).lowercased() ?? "en"
    switch language {
    case "de": return "Neue Mitteilung"
    case "fr": return "Nouvelle notification"
    default: return "New notification"
    }
  }
}
