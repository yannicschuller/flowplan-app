import AppIntents
import Foundation

// What the widgets' settings offer, asked from the instance
// (GET /api/mobile/widgets/options?kind=…) while the person edits a widget.
// Pages, views, properties, calendars and timers are entities: the widget
// keeps their id and name. Each list has its own type, so each setting
// offers only what fits (capture targets, task databases, journals …).

/// One page of an options answer ("PageOption"); protected pages show their
/// state instead of a title.
struct FPOption: Sendable {
  let id: String
  let name: String
  let detail: String
}

enum FPOptions {
  private static let cache = FPOptionCache()

  static func pages(_ kind: String, _ list: String, pageId: String? = nil) async -> [FPOption] {
    guard let answer = await cache.answer(kind: kind, pageId: pageId) else { return [] }
    return answer[list].array.compactMap(page)
  }

  /// The pages behind stored ids; an id the list does not have (offline,
  /// no longer visible) stays, so a widget never loses its setting.
  static func resolve(_ identifiers: [String], _ list: [FPOption]) -> [FPOption] {
    identifiers.map { id in list.first { $0.id == id } ?? FPOption(id: id, name: L("Page"), detail: "") }
  }

  static func page(_ json: FPJSON) -> FPOption? {
    guard let id = json["id"].string else { return nil }
    var name: String = json["name"].text
    if json["locked"].bool { name = L("Locked") }
    if json["encrypted"].bool { name = L("Encrypted") }
    if name.isEmpty { name = L("Untitled") }
    var parts: [String] = []
    let space: String = json["space"].text
    let workspace: String = json["workspace"].text
    if !space.isEmpty { parts.append(space) }
    if !workspace.isEmpty { parts.append(workspace) }
    return FPOption(id: id, name: name, detail: parts.joined(separator: " · "))
  }

  /// The database of an options answer (with pageId): views and properties.
  static func database(_ kind: String, pageId: String) async -> FPJSON? {
    guard let answer = await cache.answer(kind: kind, pageId: pageId) else { return nil }
    let database: FPJSON = answer["database"]
    if database.isNull { return nil }
    if database["locked"].bool { return nil }
    if database["encrypted"].bool { return nil }
    return database
  }

  static func answer(_ kind: String) async -> FPJSON? {
    await cache.answer(kind: kind, pageId: nil)
  }
}

/// Options answers for a minute: editing a widget asks for several lists.
actor FPOptionCache {
  private var entries: [String: (at: Date, json: FPJSON)] = [:]

  func answer(kind: String, pageId: String?) async -> FPJSON? {
    let key = "\(kind)|\(pageId ?? "")"
    if let entry = entries[key], Date().timeIntervalSince(entry.at) < 60 { return entry.json }
    guard let json = try? await FPAPI.options(kind: kind, pageId: pageId) else { return entries[key]?.json }
    entries[key] = (Date(), json)
    return json
  }
}

/// Ids that hold their parent: views and properties are named per database.
enum FPCompositeID {
  static func make(_ parts: String...) -> String { parts.joined(separator: "|") }
  static func split(_ id: String) -> [String] { id.components(separatedBy: "|") }
}

// MARK: - Pages per list

@available(iOS 17.0, *)
struct FPCaptureTarget: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPCaptureTarget] {
      await FPOptions.resolve(identifiers, FPOptions.pages("capture", "targets")).map(FPCaptureTarget.init)
    }
    func suggestedEntities() async throws -> [FPCaptureTarget] {
      await FPOptions.pages("capture", "targets").map(FPCaptureTarget.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPTaskDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Database"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPTaskDatabase] {
      await FPOptions.resolve(identifiers, FPOptions.pages("tasks", "databases")).map(FPTaskDatabase.init)
    }
    func suggestedEntities() async throws -> [FPTaskDatabase] {
      await FPOptions.pages("tasks", "databases").map(FPTaskDatabase.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPTodoPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPTodoPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("tasks", "pages")).map(FPTodoPage.init)
    }
    func suggestedEntities() async throws -> [FPTodoPage] {
      await FPOptions.pages("tasks", "pages").map(FPTodoPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPPinnedPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPPinnedPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("pinned", "pages")).map(FPPinnedPage.init)
    }
    func suggestedEntities() async throws -> [FPPinnedPage] {
      await FPOptions.pages("pinned", "pages").map(FPPinnedPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPCounterDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Database"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPCounterDatabase] {
      await FPOptions.resolve(identifiers, FPOptions.pages("counter", "databases")).map(FPCounterDatabase.init)
    }
    func suggestedEntities() async throws -> [FPCounterDatabase] {
      await FPOptions.pages("counter", "databases").map(FPCounterDatabase.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPJournalPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Journal"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPJournalPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("journal", "journals")).map(FPJournalPage.init)
    }
    func suggestedEntities() async throws -> [FPJournalPage] {
      await FPOptions.pages("journal", "journals").map(FPJournalPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPHabitDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habits"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct Query: EntityQuery {
    private func all() async -> [FPHabitDatabase] {
      guard let answer = await FPOptions.answer("journal") else { return [] }
      return answer["habits"].array.compactMap { item in
        guard let id = item["id"].string else { return nil }
        let habits = item["habits"].array.map { $0["name"].text }.filter { !$0.isEmpty }.joined(separator: ", ")
        return FPHabitDatabase(id: id, name: item["name"].text, detail: habits)
      }
    }
    func entities(for identifiers: [String]) async throws -> [FPHabitDatabase] {
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPHabitDatabase(id: id, name: L("Habits"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPHabitDatabase] {
      await all()
    }
  }
}

@available(iOS 17.0, *)
struct FPFormPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Form"
  static var defaultQuery = Query()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct Query: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPFormPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("forms", "forms")).map(FPFormPage.init)
    }
    func suggestedEntities() async throws -> [FPFormPage] {
      await FPOptions.pages("forms", "forms").map(FPFormPage.init)
    }
  }
}

// MARK: - Views and properties of the chosen database

@available(iOS 17.0, *)
struct FPViewEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "View"
  static var defaultQuery = Query()
  // "<database id>|<view id>"
  var id: String
  var name: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  var pageId: String { FPCompositeID.split(id).first ?? "" }
  var viewId: String { FPCompositeID.split(id).dropFirst().joined(separator: "|") }

  static func views(kind: String, pageId: String) async -> [FPViewEntity] {
    guard let database = await FPOptions.database(kind, pageId: pageId) else { return [] }
    return database["views"].array.compactMap { view in
      guard let id = view["id"].string else { return nil }
      return FPViewEntity(id: FPCompositeID.make(pageId, id), name: view["name"].text)
    }
  }

  struct Query: EntityQuery {
    // The database chosen in the same widget's settings.
    @IntentParameterDependency<FPTasksConfiguration>(\.$database) var tasks
    @IntentParameterDependency<FPPinnedConfiguration>(\.$page) var pinned
    @IntentParameterDependency<FPCounterConfiguration>(\.$database) var counter

    func entities(for identifiers: [String]) async throws -> [FPViewEntity] {
      var out: [FPViewEntity] = []
      for id in identifiers {
        let parts = FPCompositeID.split(id)
        guard parts.count >= 2 else { continue }
        let known = await FPViewEntity.views(kind: "counter", pageId: parts[0]).first { $0.id == id }
        out.append(known ?? FPViewEntity(id: id, name: L("View")))
      }
      return out
    }

    func suggestedEntities() async throws -> [FPViewEntity] {
      if let id = tasks?.database.id { return await FPViewEntity.views(kind: "tasks", pageId: id) }
      if let id = pinned?.page.id { return await FPViewEntity.views(kind: "pinned", pageId: id) }
      if let id = counter?.database.id { return await FPViewEntity.views(kind: "counter", pageId: id) }
      return []
    }
  }
}

@available(iOS 17.0, *)
struct FPFieldEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Property"
  static var defaultQuery = Query()
  // "<database id>|<property id>"
  var id: String
  var name: String
  var type: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  var fieldId: String { FPCompositeID.split(id).dropFirst().joined(separator: "|") }

  static func fields(kind: String, pageId: String, numbersOnly: Bool = false) async -> [FPFieldEntity] {
    guard let database = await FPOptions.database(kind, pageId: pageId) else { return [] }
    return database["properties"].array.compactMap { field in
      guard let id = field["id"].string else { return nil }
      let type = field["type"].text
      if numbersOnly && type != "number" { return nil }
      return FPFieldEntity(id: FPCompositeID.make(pageId, id), name: field["name"].text, type: type)
    }
  }

  struct Query: EntityQuery {
    @IntentParameterDependency<FPPinnedConfiguration>(\.$page) var pinned
    @IntentParameterDependency<FPCounterConfiguration>(\.$database) var counter

    func entities(for identifiers: [String]) async throws -> [FPFieldEntity] {
      var out: [FPFieldEntity] = []
      for id in identifiers {
        let parts = FPCompositeID.split(id)
        guard parts.count >= 2 else { continue }
        let known = await FPFieldEntity.fields(kind: "counter", pageId: parts[0]).first { $0.id == id }
        out.append(known ?? FPFieldEntity(id: id, name: L("Property"), type: ""))
      }
      return out
    }

    func suggestedEntities() async throws -> [FPFieldEntity] {
      if let id = pinned?.page.id { return await FPFieldEntity.fields(kind: "pinned", pageId: id) }
      if let id = counter?.database.id { return await FPFieldEntity.fields(kind: "counter", pageId: id) }
      return []
    }
  }
}

/// The values of the counter's group property (options, checkbox).
@available(iOS 17.0, *)
struct FPGroupValues: DynamicOptionsProvider {
  @IntentParameterDependency<FPCounterConfiguration>(\.$database, \.$groupField) var counter

  func results() async throws -> [String] {
    guard let pageId = counter?.database.id, let field = counter?.groupField,
          let database = await FPOptions.database("counter", pageId: pageId) else { return [] }
    let fieldId: String = field.fieldId
    let properties: [FPJSON] = database["properties"].array
    guard let property = properties.first(where: { (item: FPJSON) -> Bool in item["id"].text == fieldId }) else { return [] }
    let type: String = property["type"].text
    if type == "checkbox" { return ["true", "false"] }
    var values: [String] = []
    for value in property["values"].array {
      if let text = value.string { values.append(text) }
      else if let text = value["name"].string { values.append(text) }
      else if let text = value["value"].string { values.append(text) }
    }
    return values
  }
}

// MARK: - Calendars and timers

@available(iOS 17.0, *)
struct FPCalendarEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Calendar"
  static var defaultQuery = Query()
  // "<page id>|<view id>"
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct Query: EntityQuery {
    private func all() async -> [FPCalendarEntity] {
      guard let answer = await FPOptions.answer("calendar") else { return [] }
      return answer["calendars"].array.compactMap { item in
        guard let page = item["pageId"].string else { return nil }
        let view = item["viewId"].text
        let synced: String? = item["synced"].string
        let detail: String = synced ?? item["database"].text
        return FPCalendarEntity(id: FPCompositeID.make(page, view), name: item["name"].text, detail: detail)
      }
    }
    func entities(for identifiers: [String]) async throws -> [FPCalendarEntity] {
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPCalendarEntity(id: id, name: L("Calendar"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPCalendarEntity] {
      await all()
    }
  }
}

@available(iOS 17.0, *)
struct FPTimerEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Timer"
  static var defaultQuery = Query()
  // "<page id>|<record id>|<property id>"
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct Query: EntityQuery {
    private func all() async -> [FPTimerEntity] {
      guard let answer = await FPOptions.answer("time") else { return [] }
      return answer["recent"].array.compactMap { item in
        guard let page = item["pageId"].string, let row = item["rowId"].string, let field = item["fieldId"].string else { return nil }
        return FPTimerEntity(id: FPCompositeID.make(page, row, field), name: item["title"].text, detail: item["database"].text)
      }
    }
    func entities(for identifiers: [String]) async throws -> [FPTimerEntity] {
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPTimerEntity(id: id, name: L("Timer"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPTimerEntity] {
      await all()
    }
  }
}

/// A text of the extension in the person's language (Localizable.strings,
/// generated from plugins/widget-suite/strings.js).
func L(_ key: String) -> String {
  NSLocalizedString(key, comment: "")
}
