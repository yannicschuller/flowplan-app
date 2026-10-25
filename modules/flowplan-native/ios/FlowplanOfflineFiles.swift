import Foundation

/// The files of the offline copies (src/offline/store.ts): one folder per
/// profile below Application Support/FlowplanOffline. Every file is written
/// with "complete until first user authentication" protection – unreadable
/// after a restart until the device was unlocked once – and the folder is
/// excluded from backups: the copy is the instance's content, which the
/// instance keeps; a restored phone fetches it again.
///
/// Paths come from JavaScript and are checked here once more: at most four
/// components of letters, digits, "_", "-" and "." (not first), so nothing
/// outside the folder can be named.
enum FlowplanOfflineFiles {
  static let folderName = "FlowplanOffline"
  static let queue = DispatchQueue(label: "app.flowplan.offline.files", qos: .utility)
  private static let protection = FileProtectionType.completeUntilFirstUserAuthentication

  enum Failure: Error {
    case invalidPath
    case invalidData
  }

  static func isValidComponent(_ part: String) -> Bool {
    guard let first = part.unicodeScalars.first, part.unicodeScalars.count <= 128, first != "." else { return false }
    for scalar in part.unicodeScalars {
      let ok = (scalar >= "a" && scalar <= "z") || (scalar >= "A" && scalar <= "Z") || (scalar >= "0" && scalar <= "9") || scalar == "_" || scalar == "-" || scalar == "."
      if !ok { return false }
    }
    return true
  }

  static func root() throws -> URL {
    let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    var folder = support.appendingPathComponent(folderName, isDirectory: true)
    if !FileManager.default.fileExists(atPath: folder.path) {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [FileAttributeKey.protectionKey: protection])
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try folder.setResourceValues(values)
    }
    return folder
  }

  /// The folder itself only for listing (an empty path); never to remove.
  static func url(_ path: String, allowRoot: Bool = false) throws -> URL {
    if path.isEmpty && allowRoot { return try root() }
    let parts = path.split(separator: "/", omittingEmptySubsequences: false).map { String($0) }
    guard !parts.isEmpty, parts.count <= 4 else { throw Failure.invalidPath }
    var url = try root()
    for part in parts {
      guard isValidComponent(part) else { throw Failure.invalidPath }
      url = url.appendingPathComponent(part)
    }
    return url
  }

  static func read(_ path: String) throws -> Data? {
    let target = try url(path)
    guard FileManager.default.fileExists(atPath: target.path) else { return nil }
    return try Data(contentsOf: target)
  }

  static func write(_ path: String, _ data: Data) throws {
    let target = try url(path)
    try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [FileAttributeKey.protectionKey: protection])
    try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  static func remove(_ path: String) throws {
    let target = try url(path)
    if FileManager.default.fileExists(atPath: target.path) {
      try FileManager.default.removeItem(at: target)
    }
  }

  static func list(_ path: String) throws -> [String] {
    let target = try url(path, allowRoot: true)
    guard FileManager.default.fileExists(atPath: target.path) else { return [] }
    return try FileManager.default.contentsOfDirectory(atPath: target.path).filter { isValidComponent($0) }
  }

  /// Free bytes for files the person wants (iOS may clear caches of other
  /// apps to make that room).
  static func available() -> Double {
    guard let folder = try? root(),
          let values = try? folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
          let capacity = values.volumeAvailableCapacityForImportantUsage else { return 0 }
    return Double(capacity)
  }

  /// Runs the work off the main thread, one file operation at a time.
  static func run(_ resolve: @escaping (Any?) -> Void, _ reject: @escaping (String) -> Void, _ work: @escaping () throws -> Any?) {
    queue.async {
      do {
        resolve(try work())
      } catch {
        reject(String(describing: error))
      }
    }
  }
}
