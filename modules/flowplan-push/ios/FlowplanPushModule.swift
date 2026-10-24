import CryptoKit
import ExpoModulesCore
import Foundation

/// The device keys of the push relay for JavaScript (modules/flowplan-push/
/// src/index.ts): only public keys leave this module. Decryption happens in
/// the Notification Service Extension (PushShared.swift).
public class FlowplanPushModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FlowplanPush")

    Function("isAvailable") { () -> Bool in
      return FPPush.appGroup != nil
    }

    // The profile's public key (base64url, 32 bytes); a new key pair when
    // there is none or it was made for another address.
    AsyncFunction("publicKey") { (profile: String, origin: String) -> String? in
      guard FPPush.isProfile(profile), FlowplanPushModule.isOrigin(origin) else { return nil }
      if let existing = FPPushKeychain.load(profile), existing.origin == origin {
        return FPPush.base64url(existing.privateKey.publicKey.rawRepresentation)
      }
      let key = Curve25519.KeyAgreement.PrivateKey()
      guard FPPushKeychain.save(key, profile: profile, origin: origin) else { return nil }
      return FPPush.base64url(key.publicKey.rawRepresentation)
    }

    Function("deleteKey") { (profile: String) -> Bool in
      return FPPushKeychain.delete(profile)
    }

    Function("keepOnly") { (profiles: [String]) in
      let keep = Set(profiles)
      for profile in FPPushKeychain.profiles() where !keep.contains(profile) {
        FPPushKeychain.delete(profile)
      }
    }

    // The APNs environment of this build's provisioning profile
    // ("development" or "production"); nil without one (App Store and
    // TestFlight builds carry none: production).
    Function("environment") { () -> String? in
      return FlowplanPushModule.apsEnvironment()
    }
  }

  static func isOrigin(_ value: String) -> Bool {
    guard value.count <= 300, let parts = URLComponents(string: value), let scheme = parts.scheme,
          scheme == "https" || scheme == "http", parts.host?.isEmpty == false,
          parts.path.isEmpty, parts.query == nil, parts.fragment == nil, parts.user == nil else { return false }
    return true
  }

  static func apsEnvironment() -> String? {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let data = try? Data(contentsOf: url),
          let start = data.range(of: Data("<?xml".utf8)),
          let end = data.range(of: Data("</plist>".utf8), options: [], in: start.lowerBound..<data.endIndex) else { return nil }
    let xml = data.subdata(in: start.lowerBound..<end.upperBound)
    guard let profile = try? PropertyListSerialization.propertyList(from: xml, options: [], format: nil) as? [String: Any],
          let entitlements = profile["Entitlements"] as? [String: Any],
          let environment = entitlements["aps-environment"] as? String else { return nil }
    return environment
  }
}
