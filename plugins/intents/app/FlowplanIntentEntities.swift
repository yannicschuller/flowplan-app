import AppIntents
import Foundation

// What Siri and Shortcuts choose from: pages to open (asked from the
// instance by title, GET /api/mobile/intents/pages) and the lists and
// databases a task can go to (the capture targets of the widgets). With the
// session the app keeps for its widgets (WidgetShared.swift: FPKeychain,
// FPAPI) – the active profile's instance.

enum FPIntentAPI {
  static func get(_ action: String, _ query: [String: String] = [:]) async throws -> FPJSON {
    guard let session = FPKeychain.load() else { throw FPError.noSession }
    let items: [URLQueryItem] = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    return try await FPAPI.call("/api/mobile/intents/\(action)", query: items, session: session)
  }

  static func post(_ action: String, _ body: [String: Any]) async throws -> FPJSON {
    guard let session = FPKeychain.load() else { throw FPError.noSession }
    return try await FPAPI.call("/api/mobile/intents/\(action)", body: body, session: session, timeout: 10)
  }
}

/// Links into the app (src/navigation.ts: flowplan://open?path=…).
enum FPIntentLinks {
  static func open(_ path: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    let encoded: String = path.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    return "flowplan://open?path=" + encoded
  }

  static func search(_ text: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    let query: String = text.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    return open("/#search=" + query)
  }
}

struct FPIntentPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Flowplan page"
  static var defaultQuery = FPIntentPageQuery()

  let id: String
  let name: String
  // Workspace and space, or the page of a record.
  let place: String
  // Where it opens in the web app (/#page=…).
  let path: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(place)")
  }

  init(id: String, name: String, place: String, path: String) {
    self.id = id
    self.name = name
    self.place = place
    self.path = path
  }

  init?(page json: FPJSON) {
    guard let id = json["id"].string else { return nil }
    let workspace: String = json["workspace"].text
    let space: String = json["space"].text
    let place: String = space.isEmpty || space == workspace ? workspace : workspace + " · " + space
    let path: String = json["url"].string ?? ("/#page=" + id)
    self.init(id: id, name: json["name"].string ?? L("Untitled"), place: place, path: path)
  }

  init?(result json: FPJSON) {
    guard let id = json["id"].string else { return nil }
    let page: String = json["page"].text
    let workspace: String = json["workspace"].text
    let place: String = page.isEmpty ? workspace : page + " · " + workspace
    let path: String = json["url"].string ?? ("/#page=" + id)
    self.init(id: id, name: json["title"].string ?? L("Untitled"), place: place, path: path)
  }
}

struct FPIntentPageQuery: EntityStringQuery {
  init() {}

  private func pages(_ query: [String: String]) async throws -> [FPIntentPage] {
    do {
      let answer = try await FPIntentAPI.get("pages", query)
      return answer["pages"].array.compactMap { FPIntentPage(page: $0) }
    } catch {
      throw FPIntentError.from(error)
    }
  }

  func entities(for identifiers: [String]) async throws -> [FPIntentPage] {
    let ids: [String] = Array(identifiers.prefix(20))
    if ids.isEmpty { return [] }
    return try await pages(["ids": ids.joined(separator: ",")])
  }

  func entities(matching string: String) async throws -> [FPIntentPage] {
    try await pages(["q": String(string.prefix(200))])
  }

  func suggestedEntities() async throws -> [FPIntentPage] {
    try await pages([:])
  }
}

/// A list or database a task can be added to (the capture targets).
struct FPIntentList: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "List or database"
  static var defaultQuery = FPIntentListQuery()

  let id: String
  let name: String
  let place: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)", subtitle: "\(place)")
  }
}

struct FPIntentListQuery: EntityStringQuery {
  init() {}

  func all() async throws -> [FPIntentList] {
    do {
      let options = try await FPAPI.options(kind: "capture")
      return options["targets"].array.compactMap { target -> FPIntentList? in
        guard let id = target["id"].string else { return nil }
        let name: String = target["name"].string ?? L("Untitled")
        return FPIntentList(id: id, name: name, place: target["workspace"].text)
      }
    } catch {
      throw FPIntentError.from(error)
    }
  }

  func entities(for identifiers: [String]) async throws -> [FPIntentList] {
    let lists = try await all()
    return lists.filter { identifiers.contains($0.id) }
  }

  func entities(matching string: String) async throws -> [FPIntentList] {
    let lists = try await all()
    let text = string.trimmingCharacters(in: .whitespaces)
    if text.isEmpty { return lists }
    return lists.filter { $0.name.localizedCaseInsensitiveContains(text) }
  }

  func suggestedEntities() async throws -> [FPIntentList] {
    try await all()
  }
}
