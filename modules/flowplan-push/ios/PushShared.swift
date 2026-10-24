import CryptoKit
import Foundation
import os
import Security

// End-to-end encrypted push through the Flowplan push relay (PROTOCOL.md v1
// of flowplan-push with the v1.1 amendments of its §6, src/push-relay.ts). This one file is compiled twice:
// into the FlowplanPush module (the app creates the keys) and into the
// Notification Service Extension FlowplanNotifications (it decrypts) –
// plugins/with-notification-service.js copies it there.
//
// - One X25519 key pair per profile (instance). The private key lives in
//   the keychain under the App Group's access group – the extension reads it
//   – readable after the first unlock, on this device only (never in a
//   backup, never synced). Nothing logs a key, a token or a payload.
// - A payload is base64url(0x01 ‖ ephemeral public key ‖ nonce ‖ ciphertext ‖
//   tag): X25519 with the ephemeral key, HKDF-SHA256 (salt: ephemeral ‖ device
//   public key, info "flowplan-push-v1\n" + the key's instance origin) to an
//   AES-256-GCM key, the same info as additional data. A payload carries no
//   hint for whom it is: every stored key is tried with its own instance
//   (at most FPPush.maxKeys); with any other key or instance the GCM tag does
//   not verify. No plaintext path exists.
// - Messages older than 7 days and notification ids already shown (the
//   last 200, in the App Group) are not shown again.

enum FPPush {
  static let protocolName = "flowplan-push-v1"
  /// HKDF info and AES-GCM additional data, bound to the instance (§6.9).
  static func info(_ instance: String) -> Data { Data("\(protocolName)\n\(instance)".utf8) }
  static let version: UInt8 = 1
  static let maxPayload = 2800
  static let minPayload = 1 + 32 + 12 + 16
  static let maxKeys = 10
  static let service = "app.flowplan.push"
  static let maxAge: TimeInterval = 7 * 86_400
  static let seenIds = 200
  static let seenKey = "flowplan.push.seen"
  static let maxSkew: TimeInterval = 86_400
  static let log = OSLog(subsystem: "app.flowplan.mobile", category: "push")

  /// The App Group (Info.plist of the app and of the extension), which is
  /// also the keychain access group.
  static var appGroup: String? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "FlowplanPushAppGroup") as? String, !group.isEmpty else { return nil }
    return group
  }

  private static let profileCharacters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789")

  /// profiles.ts → ID: 1–32 lowercase letters and digits.
  static func isProfile(_ id: String) -> Bool {
    guard !id.isEmpty, id.unicodeScalars.count <= 32 else { return false }
    return id.unicodeScalars.allSatisfy { profileCharacters.contains($0) }
  }

  // MARK: base64url

  static func base64url(_ data: Data) -> String {
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  /// Strict: only the base64url alphabet, no padding.
  static func decodeBase64url(_ text: String) -> Data? {
    guard text.count % 4 != 1 else { return nil }
    let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    guard text.allSatisfy({ allowed.contains($0) }) else { return nil }
    var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64 += "=" }
    return Data(base64Encoded: base64)
  }
}

/// A profile's key as the keychain keeps it.
struct FPPushKey {
  let profile: String
  let origin: String
  let privateKey: Curve25519.KeyAgreement.PrivateKey
}

private struct FPPushKeyItem: Codable {
  var origin: String
  var key: String
}

enum FPPushKeychain {
  private static func base(_ group: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: FPPush.service,
      kSecAttrAccessGroup as String: group,
    ]
  }

  static func load(_ profile: String) -> FPPushKey? {
    guard FPPush.isProfile(profile), let group = FPPush.appGroup else { return nil }
    var query = base(group)
    query[kSecAttrAccount as String] = profile
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status: OSStatus = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data else {
      // -25308: before the first unlock; -34018: no access group.
      os_log("Push key not readable: %ld", log: FPPush.log, type: .error, Int(status))
      return nil
    }
    guard let stored = try? JSONDecoder().decode(FPPushKeyItem.self, from: data),
          let raw = FPPush.decodeBase64url(stored.key), raw.count == 32,
          let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: raw) else { return nil }
    return FPPushKey(profile: profile, origin: stored.origin, privateKey: key)
  }

  /// The profiles that have a key, most recently written first (at most
  /// FPPush.maxKeys).
  static func profiles() -> [String] {
    guard let group = FPPush.appGroup else { return [] }
    var query = base(group)
    query[kSecReturnAttributes as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitAll
    var items: CFTypeRef?
    let status: OSStatus = SecItemCopyMatching(query as CFDictionary, &items)
    guard status == errSecSuccess, let list = items as? [[String: Any]] else { return [] }
    let sorted = list.sorted { a, b in
      let first = a[kSecAttrModificationDate as String] as? Date ?? .distantPast
      let second = b[kSecAttrModificationDate as String] as? Date ?? .distantPast
      return first > second
    }
    return Array(sorted.compactMap { $0[kSecAttrAccount as String] as? String }.filter(FPPush.isProfile).prefix(FPPush.maxKeys))
  }

  static func all() -> [FPPushKey] {
    return profiles().compactMap(load)
  }

  @discardableResult
  static func save(_ key: Curve25519.KeyAgreement.PrivateKey, profile: String, origin: String) -> Bool {
    guard FPPush.isProfile(profile), let group = FPPush.appGroup else { return false }
    let stored = FPPushKeyItem(origin: origin, key: FPPush.base64url(key.rawRepresentation))
    guard let data = try? JSONEncoder().encode(stored) else { return false }
    delete(profile)
    var item = base(group)
    item[kSecAttrAccount as String] = profile
    item[kSecValueData as String] = data
    // After the first unlock (pushes arrive while the phone is locked), on
    // this device only: never in a backup, never on another device.
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    item[kSecAttrSynchronizable as String] = false
    let status: OSStatus = SecItemAdd(item as CFDictionary, nil)
    if status != errSecSuccess {
      os_log("Push key not saved: %ld", log: FPPush.log, type: .error, Int(status))
    }
    return status == errSecSuccess
  }

  @discardableResult
  static func delete(_ profile: String) -> Bool {
    guard FPPush.isProfile(profile), let group = FPPush.appGroup else { return false }
    var query = base(group)
    query[kSecAttrAccount as String] = profile
    let status: OSStatus = SecItemDelete(query as CFDictionary)
    return status == errSecSuccess || status == errSecItemNotFound
  }
}

enum FPPushCrypto {
  /// The plaintext of a payload for this key; nil when it is not for it, or
  /// not valid at all.
  static func open(_ payload: String, with key: Curve25519.KeyAgreement.PrivateKey, instance: String) -> Data? {
    guard payload.count <= (FPPush.maxPayload * 4 + 2) / 3, let data = FPPush.decodeBase64url(payload) else { return nil }
    let bytes = [UInt8](data)
    guard bytes.count >= FPPush.minPayload, bytes.count <= FPPush.maxPayload, bytes[0] == FPPush.version else { return nil }
    let ephemeral = Data(bytes[1..<33])
    let nonce = Data(bytes[33..<45])
    let ciphertext = Data(bytes[45..<(bytes.count - 16)])
    let tag = Data(bytes[(bytes.count - 16)..<bytes.count])
    do {
      let peer = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: ephemeral)
      let shared = try key.sharedSecretFromKeyAgreement(with: peer)
      // A low-order ephemeral key gives the all-zero secret: refused.
      let zero = shared.withUnsafeBytes { raw in raw.allSatisfy { $0 == 0 } }
      if zero { return nil }
      var salt = Data()
      salt.append(ephemeral)
      salt.append(key.publicKey.rawRepresentation)
      let info = FPPush.info(instance)
      let symmetric = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: salt, sharedInfo: info, outputByteCount: 32)
      let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce), ciphertext: ciphertext, tag: tag)
      return try AES.GCM.open(box, using: symmetric, authenticating: info)
    } catch {
      return nil
    }
  }

  /// Tries every stored key; the first whose tag verifies.
  static func open(_ payload: String) -> (key: FPPushKey, plaintext: Data)? {
    for key in FPPushKeychain.all() {
      if let plaintext = open(payload, with: key.privateKey, instance: key.origin) {
        return (key, plaintext)
      }
    }
    return nil
  }
}

/// Notification ids already shown (§6.9), in the App Group's defaults: a
/// message the relay repeats is not shown again.
enum FPPushSeen {
  /// True when the id was shown before; otherwise it is remembered.
  static func again(_ id: String, origin: String) -> Bool {
    guard let group = FPPush.appGroup, let defaults = UserDefaults(suiteName: group) else { return false }
    let entry = "\(origin)|\(id)"
    var seen = defaults.stringArray(forKey: FPPush.seenKey) ?? []
    if seen.contains(entry) { return true }
    seen.append(entry)
    if seen.count > FPPush.seenIds { seen.removeFirst(seen.count - FPPush.seenIds) }
    defaults.set(seen, forKey: FPPush.seenKey)
    return false
  }
}

/// A decrypted, checked notification (the same rules as parsePlaintext in
/// src/push-relay.ts).
struct FPPushMessage {
  let title: String
  let body: String
  let path: String?
  let id: String
  let category: String?
  let data: [String: Any]
  let origin: String

  static let categories: [String: String] = [
    "task": "flowplan.task",
    "comment": "flowplan.comment",
    "read": "flowplan.read",
    "flowplan.task": "flowplan.task",
    "flowplan.comment": "flowplan.comment",
    "flowplan.read": "flowplan.read",
  ]

  static func parse(_ plaintext: Data, origin: String, now: Date = Date()) -> FPPushMessage? {
    guard let object = try? JSONSerialization.jsonObject(with: plaintext) as? [String: Any] else { return nil }
    guard let title = object["title"] as? String, let body = object["body"] as? String else { return nil }
    guard let id = object["id"] as? String, isId(id) else { return nil }
    guard let sent = object["sentAt"] as? NSNumber, CFGetTypeID(sent) != CFBooleanGetTypeID() else { return nil }
    let sentAt = sent.doubleValue
    let nowSeconds = now.timeIntervalSince1970
    guard sentAt.isFinite, sentAt <= nowSeconds + FPPush.maxSkew, sentAt >= nowSeconds - FPPush.maxAge else { return nil }
    let url = object["url"]
    if url != nil, !(url is NSNull), !(url is String) { return nil }
    let category = object["category"]
    if category != nil, !(category is NSNull), !(category is String) { return nil }
    let cleanTitle = clean(title, max: 200)
    return FPPushMessage(
      title: cleanTitle.isEmpty ? "Flowplan" : cleanTitle,
      body: clean(body, max: 2000),
      path: (url as? String).flatMap { path($0, origin: origin) },
      id: id,
      category: (category as? String).flatMap { categories[$0] },
      data: plist(object["data"]) as? [String: Any] ?? [:],
      origin: origin
    )
  }

  /// What the notification carries for the app: under "body", where
  /// expo-notifications and NotificationActions.swift look for a remote
  /// notification's data – url and notificationId as before, and the
  /// instance it came from.
  var userInfo: [String: Any] {
    var out = data
    if let path = path { out["url"] = path }
    out["notificationId"] = id
    out["origin"] = origin
    if let category = category { out["category"] = category }
    return ["body": out]
  }

  /// 1–128 characters without control characters (it travels as JSON only).
  static func isId(_ id: String) -> Bool {
    guard !id.isEmpty, id.unicodeScalars.count <= 128 else { return false }
    return id.unicodeScalars.allSatisfy { scalar in
      let value = scalar.value
      return !(value < 0x20 || value == 0x7F || value == 0x2028 || value == 0x2029)
    }
  }

  /// Control characters removed (tab and line breaks stay), trimmed, at
  /// most `max` characters.
  static func clean(_ text: String, max: Int) -> String {
    var scalars = String.UnicodeScalarView()
    for scalar in text.unicodeScalars {
      let value = scalar.value
      let control = value < 0x20 || value == 0x7F || value == 0x2028 || value == 0x2029
      if !control || value == 0x09 || value == 0x0A || value == 0x0D { scalars.append(scalar) }
    }
    let trimmed = String(scalars).trimmingCharacters(in: .whitespacesAndNewlines)
    return String(trimmed.prefix(max)).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// A path, or an address on the instance's own origin made a path;
  /// anything else is dropped.
  static func path(_ value: String, origin: String) -> String? {
    guard !value.isEmpty, value.count <= 2000 else { return nil }
    if value.hasPrefix("/") { return safePath(value) }
    guard let parts = URLComponents(string: value),
          let scheme = parts.scheme?.lowercased(), scheme == "https" || scheme == "http",
          let host = parts.host?.lowercased(), !host.isEmpty,
          parts.user == nil, parts.password == nil else { return nil }
    var own = "\(scheme)://\(host)"
    if let port = parts.port, !((scheme == "https" && port == 443) || (scheme == "http" && port == 80)) {
      own += ":\(port)"
    }
    guard own == origin else { return nil }
    var path = parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath
    if let query = parts.percentEncodedQuery { path += "?" + query }
    if let fragment = parts.percentEncodedFragment { path += "#" + fragment }
    return safePath(path)
  }

  /// navigation.ts → safePath: starts with one "/", no backslash or space.
  static func safePath(_ path: String) -> String? {
    guard path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
    let refused = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\\"))
    guard path.rangeOfCharacter(from: refused) == nil else { return nil }
    return path
  }

  /// JSON as a property list (userInfo cannot hold null): nulls dropped,
  /// nested at most four levels.
  static func plist(_ value: Any?, depth: Int = 0) -> Any? {
    guard let value = value, !(value is NSNull), depth <= 4 else { return nil }
    if let text = value as? String { return text }
    if let number = value as? NSNumber { return number }
    if let list = value as? [Any] { return list.prefix(50).compactMap { plist($0, depth: depth + 1) } }
    if let object = value as? [String: Any] {
      var out: [String: Any] = [:]
      for (key, entry) in object.prefix(50) {
        if let converted = plist(entry, depth: depth + 1) { out[key] = converted }
      }
      return out
    }
    return nil
  }
}
