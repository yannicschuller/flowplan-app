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

  static func pages(_ kind: String, _ list: String, pageId: String? = nil, profile: String? = nil) async -> [FPOption] {
    guard let answer = await cache.answer(kind: kind, pageId: pageId, profile: profile) else { return [] }
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
  static func database(_ kind: String, pageId: String, profile: String? = nil) async -> FPJSON? {
    guard let answer = await cache.answer(kind: kind, pageId: pageId, profile: profile) else { return nil }
    let database: FPJSON = answer["database"]
    if database.isNull { return nil }
    if database["locked"].bool { return nil }
    if database["encrypted"].bool { return nil }
    return database
  }

  static func answer(_ kind: String, pageId: String? = nil, profile: String? = nil) async -> FPJSON? {
    await cache.answer(kind: kind, pageId: pageId, profile: profile)
  }
}

/// Options answers for a minute: editing a widget asks for several lists.
actor FPOptionCache {
  private var entries: [String: (at: Date, json: FPJSON)] = [:]

  func answer(kind: String, pageId: String?, profile: String?) async -> FPJSON? {
    let key = "\(profile ?? "")|\(kind)|\(pageId ?? "")"
    if let entry = entries[key], Date().timeIntervalSince(entry.at) < 60 { return entry.json }
    guard let json = try? await FPAPI.options(kind: kind, pageId: pageId, profile: profile) else { return entries[key]?.json }
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
  static var defaultQuery = FPCaptureTargetQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPCaptureTargetQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPCaptureConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPCaptureTarget] {
      await FPOptions.resolve(identifiers, FPOptions.pages("capture", "targets", profile: widget?.profile.id)).map(FPCaptureTarget.init)
    }
    func suggestedEntities() async throws -> [FPCaptureTarget] {
      await FPOptions.pages("capture", "targets", profile: widget?.profile.id).map(FPCaptureTarget.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPTaskDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Database"
  static var defaultQuery = FPTaskDatabaseQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPTaskDatabaseQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPTasksConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPTaskDatabase] {
      await FPOptions.resolve(identifiers, FPOptions.pages("tasks", "databases", profile: widget?.profile.id)).map(FPTaskDatabase.init)
    }
    func suggestedEntities() async throws -> [FPTaskDatabase] {
      await FPOptions.pages("tasks", "databases", profile: widget?.profile.id).map(FPTaskDatabase.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPTodoPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  static var defaultQuery = FPTodoPageQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPTodoPageQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPTasksConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPTodoPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("tasks", "pages", profile: widget?.profile.id)).map(FPTodoPage.init)
    }
    func suggestedEntities() async throws -> [FPTodoPage] {
      await FPOptions.pages("tasks", "pages", profile: widget?.profile.id).map(FPTodoPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPPinnedPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Page"
  static var defaultQuery = FPPinnedPageQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPPinnedPageQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPPinnedConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPPinnedPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("pinned", "pages", profile: widget?.profile.id)).map(FPPinnedPage.init)
    }
    func suggestedEntities() async throws -> [FPPinnedPage] {
      await FPOptions.pages("pinned", "pages", profile: widget?.profile.id).map(FPPinnedPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPCounterDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Database"
  static var defaultQuery = FPCounterDatabaseQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPCounterDatabaseQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one): the old
    // database counter, or "Key figure" with a database as its source.
    @IntentParameterDependency<FPCounterConfiguration>(\.$profile) var widget
    @IntentParameterDependency<FPMetricConfiguration>(\.$profile) var figure

    private var profile: String? { widget?.profile.id ?? figure?.profile.id }

    func entities(for identifiers: [String]) async throws -> [FPCounterDatabase] {
      await FPOptions.resolve(identifiers, FPOptions.pages("counter", "databases", profile: profile)).map(FPCounterDatabase.init)
    }
    func suggestedEntities() async throws -> [FPCounterDatabase] {
      await FPOptions.pages("counter", "databases", profile: profile).map(FPCounterDatabase.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPJournalPage: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Journal"
  static var defaultQuery = FPJournalPageQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPJournalPageQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPJournalConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPJournalPage] {
      await FPOptions.resolve(identifiers, FPOptions.pages("journal", "journals", profile: widget?.profile.id)).map(FPJournalPage.init)
    }
    func suggestedEntities() async throws -> [FPJournalPage] {
      await FPOptions.pages("journal", "journals", profile: widget?.profile.id).map(FPJournalPage.init)
    }
  }
}

@available(iOS 17.0, *)
struct FPHabitDatabase: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habits"
  static var defaultQuery = FPHabitDatabaseQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct FPHabitDatabaseQuery: EntityQuery {
    @IntentParameterDependency<FPJournalConfiguration>(\.$profile) var widget
    @IntentParameterDependency<FPMyDayConfiguration>(\.$profile) var myDay

    private func all() async -> [FPHabitDatabase] {
      guard let answer = await FPOptions.answer("journal", profile: widget?.profile.id ?? myDay?.profile.id) else { return [] }
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
struct FPDeck: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Deck"
  static var defaultQuery = FPDeckQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }
  init(_ option: FPOption) { id = option.id; name = option.name; detail = option.detail }

  struct FPDeckQuery: EntityQuery {
    // Options of the widget's profile (none chosen: the active one).
    @IntentParameterDependency<FPStudyConfiguration>(\.$profile) var widget

    func entities(for identifiers: [String]) async throws -> [FPDeck] {
      await FPOptions.resolve(identifiers, FPOptions.pages("study", "decks", profile: widget?.profile.id)).map(FPDeck.init)
    }
    func suggestedEntities() async throws -> [FPDeck] {
      await FPOptions.pages("study", "decks", profile: widget?.profile.id).map(FPDeck.init)
    }
  }
}

// MARK: - Views and properties of the chosen database

@available(iOS 17.0, *)
struct FPViewEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "View"
  static var defaultQuery = FPViewEntityQuery()
  // "<database id>|<view id>"
  var id: String
  var name: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  var pageId: String { FPCompositeID.split(id).first ?? "" }
  var viewId: String { FPCompositeID.split(id).dropFirst().joined(separator: "|") }

  static func views(kind: String, pageId: String, profile: String? = nil) async -> [FPViewEntity] {
    guard let database = await FPOptions.database(kind, pageId: pageId, profile: profile) else { return [] }
    return database["views"].array.compactMap { view in
      guard let id = view["id"].string else { return nil }
      return FPViewEntity(id: FPCompositeID.make(pageId, id), name: view["name"].text)
    }
  }

  struct FPViewEntityQuery: EntityQuery {
    // The database chosen in the same widget's settings.
    @IntentParameterDependency<FPTasksConfiguration>(\.$database) var tasks
    @IntentParameterDependency<FPPinnedConfiguration>(\.$page) var pinned
    @IntentParameterDependency<FPCounterConfiguration>(\.$database) var counter
    @IntentParameterDependency<FPMetricConfiguration>(\.$database) var figure
    @IntentParameterDependency<FPTasksConfiguration>(\.$profile) var tasksProfile
    @IntentParameterDependency<FPPinnedConfiguration>(\.$profile) var pinnedProfile
    @IntentParameterDependency<FPCounterConfiguration>(\.$profile) var counterProfile
    @IntentParameterDependency<FPMetricConfiguration>(\.$profile) var figureProfile

    private var profile: String? { tasksProfile?.profile.id ?? pinnedProfile?.profile.id ?? counterProfile?.profile.id ?? figureProfile?.profile.id }

    func entities(for identifiers: [String]) async throws -> [FPViewEntity] {
      var out: [FPViewEntity] = []
      for id in identifiers {
        let parts = FPCompositeID.split(id)
        guard parts.count >= 2 else { continue }
        let known = await FPViewEntity.views(kind: "counter", pageId: parts[0], profile: profile).first { $0.id == id }
        out.append(known ?? FPViewEntity(id: id, name: L("View")))
      }
      return out
    }

    func suggestedEntities() async throws -> [FPViewEntity] {
      if let id = tasks?.database.id { return await FPViewEntity.views(kind: "tasks", pageId: id, profile: profile) }
      if let id = pinned?.page.id { return await FPViewEntity.views(kind: "pinned", pageId: id, profile: profile) }
      if let id = counter?.database.id { return await FPViewEntity.views(kind: "counter", pageId: id, profile: profile) }
      if let id = figure?.database.id { return await FPViewEntity.views(kind: "counter", pageId: id, profile: profile) }
      return []
    }
  }
}

@available(iOS 17.0, *)
struct FPFieldEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Property"
  static var defaultQuery = FPFieldEntityQuery()
  // "<database id>|<property id>"
  var id: String
  var name: String
  var type: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
  var fieldId: String { FPCompositeID.split(id).dropFirst().joined(separator: "|") }

  static func fields(kind: String, pageId: String, numbersOnly: Bool = false, profile: String? = nil) async -> [FPFieldEntity] {
    guard let database = await FPOptions.database(kind, pageId: pageId, profile: profile) else { return [] }
    return database["properties"].array.compactMap { field in
      guard let id = field["id"].string else { return nil }
      let type = field["type"].text
      if numbersOnly && type != "number" { return nil }
      return FPFieldEntity(id: FPCompositeID.make(pageId, id), name: field["name"].text, type: type)
    }
  }

  struct FPFieldEntityQuery: EntityQuery {
    @IntentParameterDependency<FPPinnedConfiguration>(\.$page) var pinned
    @IntentParameterDependency<FPCounterConfiguration>(\.$database) var counter
    @IntentParameterDependency<FPMetricConfiguration>(\.$database) var figure
    @IntentParameterDependency<FPPinnedConfiguration>(\.$profile) var pinnedProfile
    @IntentParameterDependency<FPCounterConfiguration>(\.$profile) var counterProfile
    @IntentParameterDependency<FPMetricConfiguration>(\.$profile) var figureProfile

    private var profile: String? { pinnedProfile?.profile.id ?? counterProfile?.profile.id ?? figureProfile?.profile.id }

    func entities(for identifiers: [String]) async throws -> [FPFieldEntity] {
      var out: [FPFieldEntity] = []
      for id in identifiers {
        let parts = FPCompositeID.split(id)
        guard parts.count >= 2 else { continue }
        let known = await FPFieldEntity.fields(kind: "counter", pageId: parts[0], profile: profile).first { $0.id == id }
        out.append(known ?? FPFieldEntity(id: id, name: L("Property"), type: ""))
      }
      return out
    }

    func suggestedEntities() async throws -> [FPFieldEntity] {
      if let id = pinned?.page.id { return await FPFieldEntity.fields(kind: "pinned", pageId: id, profile: profile) }
      if let id = counter?.database.id { return await FPFieldEntity.fields(kind: "counter", pageId: id, profile: profile) }
      if let id = figure?.database.id { return await FPFieldEntity.fields(kind: "counter", pageId: id, profile: profile) }
      return []
    }
  }
}

/// The values of the counter's group property (options, checkbox): the old
/// database counter's, or "Key figure" with a database as its source.
@available(iOS 17.0, *)
struct FPGroupValues: DynamicOptionsProvider {
  @IntentParameterDependency<FPCounterConfiguration>(\.$database, \.$groupField) var counter
  @IntentParameterDependency<FPCounterConfiguration>(\.$profile) var counterProfile
  @IntentParameterDependency<FPMetricConfiguration>(\.$database, \.$groupField) var figure
  @IntentParameterDependency<FPMetricConfiguration>(\.$profile) var figureProfile

  func results() async throws -> [String] {
    let chosen: (pageId: String, field: FPFieldEntity)?
    if let pageId = counter?.database.id, let field = counter?.groupField {
      chosen = (pageId, field)
    } else if let pageId = figure?.database.id, let field = figure?.groupField {
      chosen = (pageId, field)
    } else {
      chosen = nil
    }
    guard let chosen, let database = await FPOptions.database("counter", pageId: chosen.pageId, profile: counterProfile?.profile.id ?? figureProfile?.profile.id) else { return [] }
    let field = chosen.field
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
  static var defaultQuery = FPCalendarEntityQuery()
  // "<page id>|<view id>"
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct FPCalendarEntityQuery: EntityQuery {
    @IntentParameterDependency<FPCalendarConfiguration>(\.$profile) var widget
    @IntentParameterDependency<FPMyDayConfiguration>(\.$profile) var myDay

    private func all() async -> [FPCalendarEntity] {
      guard let answer = await FPOptions.answer("calendar", profile: widget?.profile.id ?? myDay?.profile.id) else { return [] }
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
  static var defaultQuery = FPTimerEntityQuery()
  // "<page id>|<record id>|<property id>"
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct FPTimerEntityQuery: EntityQuery {
    @IntentParameterDependency<FPTimeConfiguration>(\.$profile) var widget

    private func all() async -> [FPTimerEntity] {
      guard let answer = await FPOptions.answer("time", profile: widget?.profile.id) else { return [] }
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

// MARK: - Next appointment, key figure (dashboard), deadline

/// A calendar of the next appointment widget ("<page id>:<view id>" as the
/// instance lists it).
@available(iOS 17.0, *)
struct FPEventCalendar: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Calendar"
  static var defaultQuery = FPEventCalendarQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct FPEventCalendarQuery: EntityQuery {
    @IntentParameterDependency<FPEventConfiguration>(\.$profile) var widget

    private func all() async -> [FPEventCalendar] {
      guard let answer = await FPOptions.answer("event", profile: widget?.profile.id) else { return [] }
      return answer["calendars"].array.compactMap { item in
        guard let id = item["id"].string else { return nil }
        let synced: String? = item["synced"].string
        return FPEventCalendar(id: id, name: item["name"].text, detail: synced ?? item["database"].text)
      }
    }
    func entities(for identifiers: [String]) async throws -> [FPEventCalendar] {
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPEventCalendar(id: id, name: L("Calendar"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPEventCalendar] {
      await all()
    }
  }
}

/// A number tile of a dashboard ("<dashboard id>|<tile id>").
@available(iOS 17.0, *)
struct FPFigureEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Key figure"
  static var defaultQuery = FPFigureQuery()
  var id: String
  var name: String
  var detail: String
  var dashboardId: String { FPCompositeID.split(id).first ?? "" }
  var widgetId: String { FPCompositeID.split(id).dropFirst().joined(separator: "|") }
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  struct FPFigureQuery: EntityQuery {
    @IntentParameterDependency<FPMetricConfiguration>(\.$profile) var widget

    private func all() async -> [FPFigureEntity] {
      guard let answer = await FPOptions.answer("metric", profile: widget?.profile.id) else { return [] }
      var out: [FPFigureEntity] = []
      for dashboard in answer["dashboards"].array {
        guard let dashboardId = dashboard["id"].string, let option = FPOptions.page(dashboard) else { continue }
        for tile in dashboard["widgets"].array {
          guard let tileId = tile["id"].string else { continue }
          out.append(FPFigureEntity(id: FPCompositeID.make(dashboardId, tileId), name: tile["name"].text, detail: option.name))
        }
      }
      return out
    }
    func entities(for identifiers: [String]) async throws -> [FPFigureEntity] {
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPFigureEntity(id: id, name: L("Key figure"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPFigureEntity] {
      await all()
    }
  }
}

/// What the deadline counts down to: a record of a database with a due date
/// ("r|<database>|<record>") or one of the person's open tasks with a due
/// date ("t|<page>|<record or "">|<position>|<key>").
@available(iOS 17.0, *)
struct FPDeadlineEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Task or record"
  static var defaultQuery = FPDeadlineQuery()
  var id: String
  var name: String
  var detail: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(detail)") }

  /// The settings as the instance takes them.
  var config: [String: Any] {
    let parts = FPCompositeID.split(id)
    if parts.first == "r", parts.count >= 3 { return ["pageId": parts[1], "rowId": parts[2]] }
    guard parts.first == "t", parts.count >= 5 else { return [:] }
    var out: [String: Any] = ["pageId": parts[1], "taskKey": parts[4...].joined(separator: "|")]
    if !parts[2].isEmpty { out["rowId"] = parts[2] }
    if let index = Int(parts[3]) { out["index"] = index }
    return out
  }

  struct FPDeadlineQuery: EntityQuery {
    @IntentParameterDependency<FPDeadlineConfiguration>(\.$profile) var widget

    // My open tasks with a due date, then the records with one of every
    // database that has a due date.
    private func all() async -> [FPDeadlineEntity] {
      let profile: String? = widget?.profile.id
      guard let answer = await FPOptions.answer("deadline", profile: profile) else { return [] }
      var out: [FPDeadlineEntity] = answer["tasks"].array.compactMap { task in
        guard let pageId = task["pageId"].string, let key = task["taskKey"].string else { return nil }
        let index: String = task["index"].int.map(String.init) ?? ""
        let due: String = FPFormat.due(task["due"].string).label
        let detail: String = [task["page"].text, due].filter { !$0.isEmpty }.joined(separator: " · ")
        return FPDeadlineEntity(id: FPCompositeID.make("t", pageId, task["rowId"].text, index, key), name: task["text"].text, detail: detail)
      }
      for database in answer["databases"].array.prefix(8) {
        guard let pageId = database["id"].string, let option = FPOptions.page(database),
              let records = await FPOptions.answer("deadline", pageId: pageId, profile: profile) else { continue }
        for record in records["records"].array where !record["done"].bool {
          guard let rowId = record["id"].string else { continue }
          let due: String = FPFormat.due(record["due"].string).label
          out.append(FPDeadlineEntity(id: FPCompositeID.make("r", pageId, rowId), name: record["title"].text, detail: [option.name, due].filter { !$0.isEmpty }.joined(separator: " · ")))
        }
      }
      return out
    }
    func entities(for identifiers: [String]) async throws -> [FPDeadlineEntity] {
      // One that is no longer listed (done, offline) stays: its settings are
      // in the id.
      let known = await all()
      return identifiers.map { id in known.first { $0.id == id } ?? FPDeadlineEntity(id: id, name: L("Deadline"), detail: "") }
    }
    func suggestedEntities() async throws -> [FPDeadlineEntity] {
      await all()
    }
  }
}

/// A text of the extension in the person's language (Localizable.strings,
/// generated from plugins/widget-suite/strings.js).
func L(_ key: String) -> String {
  NSLocalizedString(key, comment: "")
}
