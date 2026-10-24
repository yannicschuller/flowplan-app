import Foundation
import os
import Security
import WidgetKit

// What the app, its App Intents and the widget extension share about the
// configurable widgets (README → Widgets). This one file is compiled three
// times: into the FlowplanNative module (it writes the session), into the
// app target (App Shortcuts) and into the widget extension (widgets,
// controls, their buttons) – plugins/with-widget-suite.js copies it there.
//
// - The session (instance, device token, profile, language) lives in the
//   keychain under the App Group's access group, readable after the first
//   unlock: widgets refresh while the phone is locked. Without a token the
//   widgets ask to sign in; their settings stay.
// - The answers of POST /api/mobile/widgets/data are kept per profile in the
//   App Group's UserDefaults (as JSON text: the answers contain null, which
//   a property list cannot hold), with the settings each widget asked for.
//   One batched request answers every widget the extension has seen.
// - Buttons in widgets (FPWidgets.run) draw their result at once and keep
//   what went wrong for the app's settings and Console.app (subsystem
//   app.flowplan.mobile, category widgets).

enum FPShared {
  static var appGroup: String? {
    Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
  }
  static var defaults: UserDefaults? {
    appGroup.flatMap { UserDefaults(suiteName: $0) }
  }
  static let maxPerRequest = 16
}

struct FPSession: Codable, Equatable {
  var server: String
  // nil: signed out – the widgets keep their settings and ask to sign in.
  var token: String?
  var profile: String
  var lang: String
}

enum FPKeychain {
  private static let service = "app.flowplan.widgets"
  private static let account = "session"

  private static func query() -> [String: Any]? {
    guard let group = FPShared.appGroup else { return nil }
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
    ]
  }

  static func load() -> FPSession? {
    guard var query = query() else { return nil }
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
    return try? JSONDecoder().decode(FPSession.self, from: data)
  }

  static func save(_ session: FPSession?) {
    guard let query = query() else { return }
    SecItemDelete(query as CFDictionary)
    guard let session, let data = try? JSONEncoder().encode(session) else { return }
    var item = query
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(item as CFDictionary, nil)
  }
}

/// A JSON value as JSONSerialization reads it; null and missing are nil.
struct FPJSON: @unchecked Sendable {
  let raw: Any?

  init(_ raw: Any?) {
    self.raw = raw is NSNull ? nil : raw
  }
  init(data: Data?) {
    self.init(data.flatMap { try? JSONSerialization.jsonObject(with: $0, options: [.fragmentsAllowed]) })
  }

  subscript(key: String) -> FPJSON { FPJSON((raw as? [String: Any])?[key]) }
  var array: [FPJSON] { (raw as? [Any])?.map(FPJSON.init) ?? [] }
  var string: String? { raw as? String }
  var text: String { string ?? "" }
  var isNull: Bool { raw == nil }
  private var number: NSNumber? {
    guard let value = raw as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
    return value
  }
  var double: Double? { number?.doubleValue }
  var int: Int? { number?.intValue }
  var bool: Bool {
    guard let value = raw as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return false }
    return value.boolValue
  }
  var date: Date? {
    if let ms = double { return Date(timeIntervalSince1970: ms / 1000) }
    guard let text = string else { return nil }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = iso.date(from: text) { return date }
    iso.formatOptions = [.withInternetDateTime]
    return iso.date(from: text)
  }
}

enum FPError: Error {
  case noSession
  case signedOut
  case http(Int, String)
  case network
}

/// What one widget asks for: its kind and settings as the instance takes them.
struct FPRequest: @unchecked Sendable {
  let kind: String
  let config: [String: Any]

  /// Widgets with the same settings share one answer.
  var key: String {
    let data = (try? JSONSerialization.data(withJSONObject: config, options: [.sortedKeys])) ?? Data()
    return "\(kind):\(String(data: data, encoding: .utf8) ?? "{}")"
  }
}

struct FPResult: @unchecked Sendable {
  let ok: Bool
  let status: Int
  let error: String
  let data: FPJSON
  let at: Date
}

enum FPAPI {
  static func today(_ date: Date = Date()) -> String {
    let format = DateFormatter()
    format.calendar = Calendar(identifier: .gregorian)
    format.locale = Locale(identifier: "en_US_POSIX")
    format.timeZone = .current
    format.dateFormat = "yyyy-MM-dd"
    return format.string(from: date)
  }

  static func call(_ path: String, query: [URLQueryItem] = [], body: [String: Any]? = nil, session: FPSession, timeout: TimeInterval = 20) async throws -> FPJSON {
    guard let token = session.token else { throw FPError.signedOut }
    guard var components = URLComponents(string: session.server) else { throw FPError.noSession }
    components.path = path
    components.queryItems = query + [URLQueryItem(name: "lang", value: session.lang)]
    guard let url = components.url else { throw FPError.noSession }
    var request = URLRequest(url: url, timeoutInterval: timeout)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      os_log("Request %{public}@ failed: %{public}@", log: FPLog.widgets, type: .error, path, String(describing: error))
      throw FPError.network
    }
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 {
      // The device token died with its session: signed out until the app
      // registers again (it writes a new session then).
      FPStore.markSignedOut(session)
      throw FPError.signedOut
    }
    let json = FPJSON(data: data)
    guard (200..<300).contains(status) else { throw FPError.http(status, json["error"].text) }
    return json
  }

  static func options(kind: String, pageId: String? = nil) async throws -> FPJSON {
    guard let session = FPKeychain.load() else { throw FPError.noSession }
    var query = [URLQueryItem(name: "kind", value: kind)]
    if let pageId { query.append(URLQueryItem(name: "pageId", value: pageId)) }
    return try await call("/api/mobile/widgets/options", query: query, session: session)
  }

  /// An action: short timeout, a button in a widget has only seconds.
  @discardableResult
  static func action(_ name: String, _ fields: [String: Any] = [:], timeout: TimeInterval = 10) async throws -> FPJSON {
    guard let session = FPKeychain.load() else { throw FPError.noSession }
    var body = fields
    body["action"] = name
    return try await call("/api/mobile/widgets/action", body: body, session: session, timeout: timeout)
  }

  /// One batched request (at most 16 widgets).
  static func data(_ requests: [FPRequest], session: FPSession) async throws -> [String: FPResult] {
    let widgets = requests.prefix(FPShared.maxPerRequest).map { ["id": $0.key, "kind": $0.kind, "config": $0.config] as [String: Any] }
    guard !widgets.isEmpty else { return [:] }
    let body: [String: Any] = ["today": today(), "zone": TimeZone.current.identifier, "lang": session.lang, "widgets": widgets]
    let answer = try await call("/api/mobile/widgets/data", body: body, session: session)
    var results: [String: FPResult] = [:]
    let now = Date()
    for widget in answer["widgets"].array {
      guard let id = widget["id"].string else { continue }
      results[id] = FPResult(ok: widget["ok"].bool, status: widget["status"].int ?? 200, error: widget["error"].text, data: widget["data"], at: now)
    }
    return results
  }
}

/// The widgets' settings and answers in the App Group.
enum FPStore {
  private static let registryKey = "flowplan.suite.registry"
  private static let invalidKey = "flowplan.suite.invalidated"
  private static func cacheKey(_ profile: String) -> String { "flowplan.suite.cache.\(profile)" }
  private static func signedOutKey(_ profile: String) -> String { "flowplan.suite.signedOut.\(profile)" }
  // Settings a widget has not asked for in three days are no longer shown.
  private static let keep: TimeInterval = 3 * 86_400
  private static let lock = NSLock()

  /// Remembers that a widget with these settings is on a screen.
  static func register(_ request: FPRequest) {
    lock.lock()
    defer { lock.unlock() }
    guard let defaults = FPShared.defaults else { return }
    var registry = defaults.dictionary(forKey: registryKey) as? [String: [String: Any]] ?? [:]
    let now = Date().timeIntervalSince1970
    if let seen = registry[request.key]?["seen"] as? Double, now - seen < 3600 { return }
    let config = (try? JSONSerialization.data(withJSONObject: request.config)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    registry[request.key] = ["kind": request.kind, "config": config, "seen": now]
    registry = registry.filter { now - (($0.value["seen"] as? Double) ?? 0) < keep }
    defaults.set(registry, forKey: registryKey)
  }

  /// The settings of every widget on a screen, most recently seen first.
  static func registered() -> [FPRequest] {
    guard let registry = FPShared.defaults?.dictionary(forKey: registryKey) as? [String: [String: Any]] else { return [] }
    let now = Date().timeIntervalSince1970
    return registry.values
      .filter { now - (($0["seen"] as? Double) ?? 0) < keep }
      .sorted { (($0["seen"] as? Double) ?? 0) > (($1["seen"] as? Double) ?? 0) }
      .compactMap { entry in
        guard let kind = entry["kind"] as? String,
              let text = entry["config"] as? String,
              let config = FPJSON(data: text.data(using: .utf8)).raw as? [String: Any] else { return nil }
        return FPRequest(kind: kind, config: config)
      }
  }

  static func cached(_ key: String, profile: String) -> FPResult? {
    guard let text = FPShared.defaults?.string(forKey: cacheKey(profile)),
          let all = FPJSON(data: text.data(using: .utf8)).raw as? [String: Any],
          let entry = all[key] as? [String: Any] else { return nil }
    let json = FPJSON(entry)
    return FPResult(ok: json["ok"].bool, status: json["status"].int ?? 0, error: json["error"].text, data: json["data"], at: Date(timeIntervalSince1970: json["at"].double ?? 0))
  }

  static func save(_ results: [String: FPResult], profile: String) {
    lock.lock()
    defer { lock.unlock() }
    guard let defaults = FPShared.defaults else { return }
    var all = (defaults.string(forKey: cacheKey(profile)).flatMap { FPJSON(data: $0.data(using: .utf8)).raw as? [String: Any] }) ?? [:]
    let live = Set(registered().map(\.key))
    all = all.filter { live.contains($0.key) }
    for (key, result) in results {
      // A failed answer keeps the last good one (the widget shows it).
      if !result.ok, let previous = all[key] as? [String: Any], FPJSON(previous)["ok"].bool,
         result.status != 403, result.status != 404 { continue }
      all[key] = ["ok": result.ok, "status": result.status, "error": result.error, "data": result.data.raw ?? NSNull(), "at": result.at.timeIntervalSince1970]
    }
    if let data = try? JSONSerialization.data(withJSONObject: all), let text = String(data: data, encoding: .utf8) {
      defaults.set(text, forKey: cacheKey(profile))
    }
  }

  /// Everything shown is old: the next look asks the instance again.
  static func invalidate() {
    FPShared.defaults?.set(Date().timeIntervalSince1970, forKey: invalidKey)
  }
  static var invalidatedAt: Date {
    Date(timeIntervalSince1970: FPShared.defaults?.double(forKey: invalidKey) ?? 0)
  }

  /// A profile's answers go when it is left or signs out (privacy); the
  /// settings of the widgets stay.
  static func clear(profile: String) {
    FPShared.defaults?.removeObject(forKey: cacheKey(profile))
  }

  static func markSignedOut(_ session: FPSession) {
    FPShared.defaults?.set(true, forKey: signedOutKey(session.profile))
    clear(profile: session.profile)
  }
  static func signedOut(_ session: FPSession) -> Bool {
    session.token == nil || FPShared.defaults?.bool(forKey: signedOutKey(session.profile)) == true
  }
  static func signedIn(_ session: FPSession) {
    FPShared.defaults?.removeObject(forKey: signedOutKey(session.profile))
  }
}

/// What a widget gets: the answer for its settings, from the cache while it
/// is fresh, otherwise from one request for every widget on a screen.
enum FPLoad: @unchecked Sendable {
  case signedOut
  case answer(FPResult, stale: Bool)
  case unavailable
}

actor FPRefresher {
  static let shared = FPRefresher()
  private var running: Task<Void, Never>?

  func load(_ request: FPRequest, maxAge: TimeInterval) async -> FPLoad {
    guard let session = FPKeychain.load() else { return .signedOut }
    if FPStore.signedOut(session) { return .signedOut }
    FPStore.register(request)
    let key = request.key
    if let cached = FPStore.cached(key, profile: session.profile), isFresh(cached, maxAge: maxAge) {
      return .answer(cached, stale: false)
    }
    // Several widgets ask at once (after a reload): one request for all.
    if let running {
      await running.value
    } else {
      let task = Task { await Self.fetchAll(first: request, session: session) }
      running = task
      await task.value
      running = nil
    }
    guard let current = FPKeychain.load(), !FPStore.signedOut(current) else { return .signedOut }
    if let cached = FPStore.cached(key, profile: session.profile) {
      return .answer(cached, stale: !isFresh(cached, maxAge: maxAge))
    }
    return .unavailable
  }

  private func isFresh(_ result: FPResult, maxAge: TimeInterval) -> Bool {
    result.at > FPStore.invalidatedAt && Date().timeIntervalSince(result.at) < maxAge
  }

  private static func fetchAll(first: FPRequest, session: FPSession) async {
    let started = Date()
    var seen = Set<String>()
    let requests = ([first] + FPStore.registered()).filter { seen.insert($0.key).inserted }
    // Above 16 widgets on screens: the rest follows in a second request.
    for start in stride(from: 0, to: min(requests.count, FPShared.maxPerRequest * 2), by: FPShared.maxPerRequest) {
      let batch = Array(requests[start..<min(requests.count, start + FPShared.maxPerRequest)])
      guard let results = try? await FPAPI.data(batch, session: session) else { return }
      FPStore.save(results, profile: session.profile)
    }
    // Fresh answers: what was tapped before is shown as the instance says.
    FPActions.settle(before: started)
  }
}

enum FPLog {
  static let widgets = OSLog(subsystem: "app.flowplan.mobile", category: "widgets")
}

/// What a widget shows of its buttons until the instance's fresh answer
/// says it: the tapped item done (pending, then confirmed), or back with a
/// hint after a refusal (failed).
struct FPMarks: Sendable {
  var pending: [String: Date] = [:]
  var failed: Set<String> = []

  func isPending(_ id: String) -> Bool { pending[id] != nil }
  func hasFailed(_ id: String) -> Bool { failed.contains(id) }
  var isEmpty: Bool { pending.isEmpty && failed.isEmpty }
}

/// The last action that went wrong (the app's settings show it).
struct FPActionError: Sendable {
  let action: String
  let status: Int
  let message: String
  let at: Date
}

/// The state of the widgets' buttons in the App Group, shared by the
/// extension's intents, its timelines and the app.
enum FPActions {
  private static let pendingKey = "flowplan.suite.actions.pending"
  private static let confirmedKey = "flowplan.suite.actions.confirmed"
  private static let failedKey = "flowplan.suite.actions.failed"
  private static let errorKey = "flowplan.suite.actions.lastError"
  // An action that never answered (the extension was stopped) is forgotten.
  static let pendingFor: TimeInterval = 120
  // The hint after a refusal stays until the next refresh after this.
  static let failedFor: TimeInterval = 600
  private static let lock = NSLock()

  /// One task of the tasks widget (rowId "" and index -1: none).
  static func taskID(source: String, pageId: String, rowId: String, index: Int) -> String {
    let position: String = index >= 0 ? String(index) : ""
    return "task:" + source + ":" + pageId + ":" + rowId + ":" + position
  }
  static func habitID(pageId: String, fieldId: String) -> String { "habit:" + pageId + ":" + fieldId }
  static func readID(_ notificationId: String?) -> String { "read:" + (notificationId ?? "all") }
  static let timerStartID = "timer:start"
  static let timerStopID = "timer:stop"

  private static func read(_ key: String) -> [String: Double] {
    guard let raw = FPShared.defaults?.dictionary(forKey: key) else { return [:] }
    var out: [String: Double] = [:]
    for (id, value) in raw {
      if let number = value as? NSNumber { out[id] = number.doubleValue }
    }
    return out
  }
  private static func write(_ key: String, _ value: [String: Double]) {
    FPShared.defaults?.set(value, forKey: key)
  }
  private static func within(_ all: [String: Double], _ age: TimeInterval) -> [String: Double] {
    let now: Double = Date().timeIntervalSince1970
    return all.filter { now - $0.value < age }
  }

  /// Tapped: drawn done from now on.
  static func begin(_ id: String) {
    lock.lock()
    defer { lock.unlock() }
    var pending = within(read(pendingKey), pendingFor)
    pending[id] = Date().timeIntervalSince1970
    write(pendingKey, pending)
    var failed = within(read(failedKey), failedFor)
    failed.removeValue(forKey: id)
    write(failedKey, failed)
  }

  /// The instance took it: drawn done until its next answer.
  static func succeeded(_ id: String, action: String) {
    lock.lock()
    defer { lock.unlock() }
    var pending = within(read(pendingKey), pendingFor)
    let at: Double = pending.removeValue(forKey: id) ?? Date().timeIntervalSince1970
    write(pendingKey, pending)
    var confirmed = within(read(confirmedKey), pendingFor)
    confirmed[id] = at
    write(confirmedKey, confirmed)
    os_log("Widget action %{public}@ done", log: FPLog.widgets, type: .info, action)
  }

  /// Refused or unreachable: the item comes back with a hint.
  static func failed(_ id: String, action: String, error: Error) {
    lock.lock()
    var pending = within(read(pendingKey), pendingFor)
    pending.removeValue(forKey: id)
    write(pendingKey, pending)
    var failed = within(read(failedKey), failedFor)
    failed[id] = Date().timeIntervalSince1970
    write(failedKey, failed)
    lock.unlock()
    record(action: action, error: error)
  }

  /// A fresh answer arrived: what it was asked after is shown as it is.
  static func settle(before date: Date) {
    lock.lock()
    defer { lock.unlock() }
    let limit: Double = date.timeIntervalSince1970
    let confirmed = within(read(confirmedKey), pendingFor).filter { $0.value >= limit }
    write(confirmedKey, confirmed)
  }

  static func marks() -> FPMarks {
    var marks = FPMarks()
    let pending = within(read(pendingKey), pendingFor)
    let confirmed = within(read(confirmedKey), pendingFor)
    for (id, at) in pending { marks.pending[id] = Date(timeIntervalSince1970: at) }
    for (id, at) in confirmed { marks.pending[id] = Date(timeIntervalSince1970: at) }
    marks.failed = Set(within(read(failedKey), failedFor).keys)
    return marks
  }

  static func record(action: String, error: Error) {
    var status = 0
    var message = ""
    switch error {
    case FPError.http(let code, let text):
      status = code
      message = text
    case FPError.signedOut:
      status = 401
      message = "signed out"
    case FPError.noSession:
      message = "no session"
    case FPError.network:
      message = "network"
    default:
      message = String(describing: error)
    }
    let entry: [String: Any] = ["action": action, "status": status, "message": message, "at": Date().timeIntervalSince1970]
    FPShared.defaults?.set(entry, forKey: errorKey)
    os_log("Widget action %{public}@ failed: %ld %{public}@", log: FPLog.widgets, type: .error, action, status, message)
  }

  static func lastError() -> FPActionError? {
    guard let entry = FPShared.defaults?.dictionary(forKey: errorKey),
          let action = entry["action"] as? String else { return nil }
    let status: Int = (entry["status"] as? NSNumber)?.intValue ?? 0
    let message: String = (entry["message"] as? String) ?? ""
    let at: Double = (entry["at"] as? NSNumber)?.doubleValue ?? 0
    return FPActionError(action: action, status: status, message: message, at: Date(timeIntervalSince1970: at))
  }
}

enum FPWidgets {
  /// A button of a widget: the item is drawn done at once (its kind's
  /// widgets reload before the request), then the action runs with a short
  /// timeout; a refusal brings it back with a hint. Everything shown is
  /// asked again afterwards.
  static func run(_ name: String, _ fields: [String: Any], item: String, kind: String) async {
    FPActions.begin(item)
    WidgetCenter.shared.reloadTimelines(ofKind: kind)
    do {
      try await FPAPI.action(name, fields, timeout: 8)
      FPActions.succeeded(item, action: name)
    } catch {
      FPActions.failed(item, action: name, error: error)
    }
    FPStore.invalidate()
    WidgetCenter.shared.reloadAllTimelines()
  }

  /// An action of a control or a shortcut; everything shown is asked again
  /// afterwards.
  @discardableResult
  static func act(_ name: String, _ fields: [String: Any] = [:]) async throws -> FPJSON {
    let answer = try await FPAPI.action(name, fields)
    FPStore.invalidate()
    WidgetCenter.shared.reloadAllTimelines()
    return answer
  }

  /// The answer for one kind right now (controls, shortcuts).
  static func fresh(_ kind: String, _ config: [String: Any] = [:]) async throws -> FPJSON {
    guard let session = FPKeychain.load() else { throw FPError.noSession }
    let request = FPRequest(kind: kind, config: config)
    let results = try await FPAPI.data([request], session: session)
    guard let result = results[request.key] else { throw FPError.network }
    guard result.ok else { throw FPError.http(result.status, result.error) }
    return result.data
  }

  static func reloadAll() {
    FPStore.invalidate()
    WidgetCenter.shared.reloadAllTimelines()
  }
}
