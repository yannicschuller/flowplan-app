import ExpoModulesCore
import UIKit
import VisionKit

/// Capturing and finding in the Flowplan app on iPhone and iPad (README →
/// Capture):
/// - the document scanner (VisionKit) with text recognition (Vision): a PDF
///   whose pages carry the recognised text invisibly (DocumentScanner.swift),
///   and that text for the instance's search;
/// - Spotlight: the active profile's pages and open tasks in the phone's
///   search (SpotlightIndex.swift); a tap opens them in the app
///   (FlowplanCaptureAppDelegate.swift → "onOpenLink").
/// The share extension is a target of its own (plugins/with-capture.js).
public class FlowplanCaptureModule: Module {
  private var linkObserver: NSObjectProtocol?
  private var scanner: DocumentScanner?

  public func definition() -> ModuleDefinition {
    Name("FlowplanCapture")

    Events("onOpenLink")

    OnCreate {
      // A Spotlight result tapped while the app runs.
      self.linkObserver = NotificationCenter.default.addObserver(forName: FPCLinks.notification, object: nil, queue: .main) { [weak self] _ in
        if let link = FPCLinks.take() {
          self?.sendEvent("onOpenLink", ["url": link])
        }
      }
    }

    OnDestroy {
      if let linkObserver = self.linkObserver {
        NotificationCenter.default.removeObserver(linkObserver)
      }
    }

    // The link of a Spotlight result that started the app (once).
    Function("consumeOpenedLink") { () -> String? in
      FPCLinks.take()
    }

    Function("isScannerAvailable") { () -> Bool in
      VNDocumentCameraViewController.isSupported
    }

    // The camera's document scanner; nil when cancelled. languages: the
    // recognition languages in order ("de-DE", "en-US", "fr-FR").
    AsyncFunction("scanDocument") { (title: String, languages: [String], promise: Promise) in
      guard VNDocumentCameraViewController.isSupported else {
        promise.reject("ERR_SCANNER_UNAVAILABLE", "The document scanner is not available on this device.")
        return
      }
      guard self.scanner == nil else {
        promise.reject("ERR_SCANNER_BUSY", "A scan is already running.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_SCANNER_NO_VIEW", "No view to show the scanner on.")
        return
      }
      let scanner = DocumentScanner(title: title, languages: languages)
      self.scanner = scanner
      scanner.present(from: presenter) { [weak self] result in
        self?.scanner = nil
        switch result {
        case .success(let scan):
          promise.resolve(scan?.dictionary)
        case .failure(let error):
          promise.reject("ERR_SCAN_FAILED", error.localizedDescription)
        }
      }
    }
    .runOnQueue(.main)

    // Replaces what Spotlight holds for this domain (the profile) with the
    // entries (JSON: [{ id, path, title, description, keywords, kind,
    // updatedAt, due }]); answers how many were indexed.
    AsyncFunction("indexSpotlight") { (domain: String, json: String, promise: Promise) in
      FPCSpotlight.replace(domain: domain, json: json) { count, error in
        if let error = error {
          promise.reject("ERR_SPOTLIGHT", error.localizedDescription)
        } else {
          promise.resolve(count)
        }
      }
    }

    // Signed out or another profile: nothing of the account stays in the
    // phone's search.
    AsyncFunction("clearSpotlight") { (promise: Promise) in
      FPCSpotlight.clear { error in
        if let error = error {
          promise.reject("ERR_SPOTLIGHT", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }
  }
}

/// Links the app opens from outside JavaScript (a Spotlight result): kept
/// until the app asks (cold start), announced while it runs.
enum FPCLinks {
  static let notification = Notification.Name("FlowplanCaptureOpenLink")
  private static let lock = NSLock()
  private static var pending: String?
  private static var pendingAt = Date.distantPast

  /// A Spotlight entry's identifier: "flowplan|<id>|<path>".
  static func identifier(id: String, path: String) -> String {
    "flowplan|" + id + "|" + path
  }

  static func path(of identifier: String) -> String? {
    let parts: [String] = identifier.components(separatedBy: "|")
    guard parts.count >= 3, parts[0] == "flowplan" else { return nil }
    let path: String = parts[2...].joined(separator: "|")
    guard path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
    return path
  }

  /// flowplan://open?path=… – the path fully encoded, "#", "&" and "=" too.
  static func link(path: String) -> String? {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~/")
    guard let encoded = path.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
    return "flowplan://open?path=" + encoded
  }

  static func open(path: String) {
    guard let link = link(path: path) else { return }
    lock.lock()
    pending = link
    pendingAt = Date()
    lock.unlock()
    NotificationCenter.default.post(name: notification, object: nil)
  }

  static func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let link = pending else { return nil }
    pending = nil
    // Only fresh ones: a link the app never picked up goes stale.
    let age: TimeInterval = Date().timeIntervalSince(pendingAt)
    return age < 120 ? link : nil
  }
}
