import Foundation
import Security
import UIKit
import UniformTypeIdentifiers

// What the share extension shares with the app and asks the instance
// (README → Capture). The session is the one the app writes for its
// widgets (FPKeychain in modules/flowplan-native/ios/WidgetShared.swift:
// the same keychain item, the App Group as access group) – read here, never
// written. The extension talks to the instance itself with the device token:
// GET /api/mobile/capture/targets, POST /api/mobile/capture/save.

struct FPSSession: Decodable {
  let server: String
  // nil: signed out in the app.
  let token: String?
  let profile: String
  let lang: String
}

enum FPSShared {
  static var appGroup: String? {
    Bundle.main.object(forInfoDictionaryKey: "FlowplanAppGroup") as? String
  }
  static var defaults: UserDefaults? {
    appGroup.flatMap { UserDefaults(suiteName: $0) }
  }
}

enum FPSKeychain {
  static func load() -> FPSSession? {
    guard let group = FPSShared.appGroup else { return nil }
    var query: [String: Any] = [:]
    query[kSecClass as String] = kSecClassGenericPassword
    query[kSecAttrService as String] = "app.flowplan.widgets"
    query[kSecAttrAccount as String] = "session"
    query[kSecAttrAccessGroup as String] = group
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status: OSStatus = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return try? JSONDecoder().decode(FPSSession.self, from: data)
  }
}

/// A place to save to: the inbox (the capture database), a database (a new
/// record) or a page (a new sub page).
struct FPSTarget: Identifiable, Equatable {
  let id: String
  let name: String
  let kind: String
  let place: String
  let inbox: Bool

  var label: String {
    inbox ? FPSStrings.t("inbox") + " · " + name : name
  }
  var detail: String {
    let kindText: String = kind == "database" ? FPSStrings.t("database") : FPSStrings.t("page")
    return place.isEmpty ? kindText : kindText + " · " + place
  }
}

struct FPSTargets {
  let targets: [FPSTarget]
  let maxFiles: Int
  let maxUploadMb: Double
}

/// A file to upload: an image (PNG, JPEG, GIF, WebP – other formats become
/// JPEG) or a PDF.
struct FPSFile: Identifiable {
  let id = UUID()
  let name: String
  let type: String
  let data: Data
  let preview: UIImage?
}

/// What arrived from the other app.
struct FPSContent {
  var title = ""
  var text = ""
  var link = ""
  var files: [FPSFile] = []
  var skipped = 0

  var isEmpty: Bool { text.isEmpty && link.isEmpty && files.isEmpty }

  mutating func add(text value: String) {
    let clean: String = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty else { return }
    // A link on its own is the link.
    if link.isEmpty, !clean.contains(" "), let url = URL(string: clean), url.scheme == "https" || url.scheme == "http" {
      link = clean
      return
    }
    if text.contains(clean) { return }
    text = text.isEmpty ? clean : text + "\n\n" + clean
  }
}

enum FPSError: Error {
  case signedOut
  case offline
  case server(String)
}

enum FPSLoader {
  static let maxPixels: CGFloat = 4096

  static func content(of items: [NSExtensionItem]) async -> FPSContent {
    var content = FPSContent()
    for item in items {
      if let title = item.attributedTitle?.string {
        content.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      if let text = item.attributedContentText?.string {
        content.add(text: text)
      }
      for provider in item.attachments ?? [] {
        await add(provider, to: &content)
      }
    }
    // The title some apps send is often the text again.
    if content.title == content.text { content.title = "" }
    return content
  }

  private static func add(_ provider: NSItemProvider, to content: inout FPSContent) async {
    if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
      let item = await load(provider, UTType.pdf)
      if let file = pdf(from: item) { content.files.append(file) } else { content.skipped += 1 }
      return
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      let item = await load(provider, UTType.image)
      if let file = image(from: item, index: content.files.count + 1) { content.files.append(file) } else { content.skipped += 1 }
      return
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      let item = await load(provider, UTType.url)
      if let url = item as? URL {
        if url.isFileURL {
          content.skipped += 1
        } else if content.link.isEmpty {
          content.link = url.absoluteString
        } else {
          content.add(text: url.absoluteString)
        }
      }
      return
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      let item = await load(provider, UTType.plainText)
      if let text = item as? String {
        content.add(text: text)
      } else if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
        content.add(text: text)
      }
      return
    }
    content.skipped += 1
  }

  private static func load(_ provider: NSItemProvider, _ type: UTType) async -> Any? {
    await withCheckedContinuation { (continuation: CheckedContinuation<Any?, Never>) in
      provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
        let value: Any? = item
        continuation.resume(returning: value)
      }
    }
  }

  private static func read(_ url: URL) -> Data? {
    let scoped: Bool = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }
    return try? Data(contentsOf: url)
  }

  private static func pdf(from item: Any?) -> FPSFile? {
    var data: Data?
    var name = "Document.pdf"
    if let url = item as? URL {
      data = read(url)
      name = url.lastPathComponent
    } else if let raw = item as? Data {
      data = raw
    }
    guard let bytes = data, bytes.starts(with: [0x25, 0x50, 0x44, 0x46]) else { return nil }
    if !name.lowercased().hasSuffix(".pdf") { name += ".pdf" }
    return FPSFile(name: name, type: "application/pdf", data: bytes, preview: nil)
  }

  private static func image(from item: Any?, index: Int) -> FPSFile? {
    var data: Data?
    var base = "Image-\(index)"
    if let url = item as? URL {
      data = read(url)
      base = url.deletingPathExtension().lastPathComponent
    } else if let raw = item as? Data {
      data = raw
    } else if let image = item as? UIImage {
      data = image.jpegData(compressionQuality: 0.85)
    }
    guard let bytes = data else { return nil }
    let preview: UIImage? = UIImage(data: bytes)?.preparingThumbnail(of: CGSize(width: 160, height: 160))
    if let kind = webImage(bytes) {
      return FPSFile(name: base + "." + kind.ext, type: kind.type, data: bytes, preview: preview)
    }
    // HEIC and the like: as JPEG, which every browser shows.
    guard let decoded = UIImage(data: bytes), let jpeg = scaled(decoded).jpegData(compressionQuality: 0.85) else { return nil }
    return FPSFile(name: base + ".jpg", type: "image/jpeg", data: jpeg, preview: preview)
  }

  private static func webImage(_ bytes: Data) -> (type: String, ext: String)? {
    if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return ("image/png", "png") }
    if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return ("image/jpeg", "jpg") }
    if bytes.starts(with: [0x47, 0x49, 0x46, 0x38]) { return ("image/gif", "gif") }
    let riff: Bool = bytes.starts(with: [0x52, 0x49, 0x46, 0x46])
    if riff, bytes.count > 12, bytes.subdata(in: 8..<12) == Data([0x57, 0x45, 0x42, 0x50]) { return ("image/webp", "webp") }
    return nil
  }

  private static func scaled(_ image: UIImage) -> UIImage {
    let width: CGFloat = image.size.width * image.scale
    let height: CGFloat = image.size.height * image.scale
    let longest: CGFloat = max(width, height)
    guard longest > maxPixels else { return image }
    let factor: CGFloat = maxPixels / longest
    let target = CGSize(width: (width * factor).rounded(), height: (height * factor).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
  }
}

enum FPSAPI {
  private static func makeRequest(_ action: String, session: FPSSession, timeout: TimeInterval) throws -> URLRequest {
    guard let token = session.token else { throw FPSError.signedOut }
    guard var components = URLComponents(string: session.server) else { throw FPSError.signedOut }
    components.path = "/api/mobile/capture/" + action
    components.queryItems = [URLQueryItem(name: "lang", value: FPSStrings.lang)]
    guard let url = components.url else { throw FPSError.signedOut }
    var request = URLRequest(url: url, timeoutInterval: timeout)
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  private static func check(_ data: Data, _ response: URLResponse) throws -> [String: Any] {
    let status: Int = (response as? HTTPURLResponse)?.statusCode ?? 0
    let json: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    if status == 401 { throw FPSError.signedOut }
    guard (200..<300).contains(status) else {
      let message: String = (json["error"] as? String) ?? "HTTP \(status)"
      throw FPSError.server(message)
    }
    return json
  }

  static func targets(session: FPSSession) async throws -> FPSTargets {
    let request = try makeRequest("targets", session: session, timeout: 15)
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw FPSError.offline
    }
    let json = try check(data, response)
    var targets: [FPSTarget] = []
    var inboxId = ""
    if let inbox = json["inbox"] as? [String: Any], let id = inbox["id"] as? String {
      inboxId = id
      let name: String = (inbox["name"] as? String) ?? ""
      targets.append(FPSTarget(id: id, name: name, kind: "database", place: "", inbox: true))
    }
    for entry in (json["targets"] as? [[String: Any]]) ?? [] {
      guard let id = entry["id"] as? String, id != inboxId else { continue }
      let name: String = (entry["name"] as? String) ?? ""
      // Encrypted and PIN-locked pages take nothing from here.
      let encrypted: Bool = (entry["encrypted"] as? Bool) ?? false
      let locked: Bool = (entry["locked"] as? Bool) ?? false
      if name.isEmpty || encrypted || locked { continue }
      let space: String = (entry["space"] as? String) ?? ""
      let workspace: String = (entry["workspace"] as? String) ?? ""
      let place: String = [space, workspace].filter { !$0.isEmpty }.joined(separator: " · ")
      let kind: String = (entry["kind"] as? String) ?? "document"
      targets.append(FPSTarget(id: id, name: name, kind: kind, place: place, inbox: false))
    }
    let maxFiles: Int = (json["maxFiles"] as? NSNumber)?.intValue ?? 10
    let maxUploadMb: Double = (json["maxUploadMb"] as? NSNumber)?.doubleValue ?? 25
    return FPSTargets(targets: targets, maxFiles: maxFiles, maxUploadMb: maxUploadMb)
  }

  /// Saves; the multipart body goes through a file (photos and PDFs can be
  /// large, the extension has little memory).
  static func save(session: FPSSession, target: FPSTarget, title: String, text: String, link: String, files: [FPSFile]) async throws {
    var request = try makeRequest("save", session: session, timeout: 120)
    let boundary = "FlowplanShare-" + UUID().uuidString
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=" + boundary, forHTTPHeaderField: "Content-Type")
    var body = Data()
    func field(_ name: String, _ value: String) {
      body.append(Data(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n").utf8))
      body.append(Data(value.utf8))
      body.append(Data("\r\n".utf8))
    }
    field("targetId", target.inbox ? "inbox" : target.id)
    field("place", "subpage")
    if !title.isEmpty { field("title", title) }
    if !text.isEmpty { field("text", text) }
    if !link.isEmpty { field("url", link) }
    for file in files {
      let safeName: String = file.name.replacingOccurrences(of: "\"", with: "'").replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
      body.append(Data(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + safeName + "\"\r\n").utf8))
      body.append(Data(("Content-Type: " + file.type + "\r\n\r\n").utf8))
      body.append(file.data)
      body.append(Data("\r\n".utf8))
    }
    body.append(Data(("--" + boundary + "--\r\n").utf8))
    let upload = FileManager.default.temporaryDirectory.appendingPathComponent(boundary)
    try body.write(to: upload)
    body = Data()
    defer { try? FileManager.default.removeItem(at: upload) }
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.upload(for: request, fromFile: upload)
    } catch {
      throw FPSError.offline
    }
    _ = try check(data, response)
    FPSShared.defaults?.set(target.inbox ? "inbox" : target.id, forKey: "flowplan.share.lastTarget." + session.profile)
  }
}
