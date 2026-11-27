import AppIntents
import WidgetKit

// The settings of each configurable widget (long press → Edit Widget) and
// what they ask the instance for (lib/mobile-widget-schema.ts in Flowplan).
// Every setting has a default: a freshly added widget works at once. Titles
// are keys of Localizable.strings (German, English, French).

/// What the timeline provider needs from a widget's settings.
@available(iOS 17.0, *)
protocol FPSuiteConfiguration: WidgetConfigurationIntent {
  /// The kind of the instance's widget API.
  static var kind: String { get }
  /// The settings as the instance takes them.
  var request: FPRequest { get }
  /// Further answers the widget shows besides its own (same request).
  var extraRequests: [FPRequest] { get }
  /// Settings that only the phone uses (buttons, the start timer …).
  var settings: FPSettings { get }
  /// Nothing to show before a page is chosen.
  var needsSetup: Bool { get }
  /// The profile the widget shows (nil: the active one) and its colours –
  /// settings of the phone, every configuration has them.
  var profile: FPProfileEntity? { get }
  var color: FPColorChoice { get }
}

struct FPSettings: Sendable {
  var buttons: [String] = []
  var max = 5
  var timer: [String: String]? = nil
}

@available(iOS 17.0, *)
extension FPSuiteConfiguration {
  var settings: FPSettings { FPSettings() }
  var extraRequests: [FPRequest] { [] }
  var needsSetup: Bool { false }
  var profileId: String? { profile?.id }
  /// The request with the widget's profile.
  var profiledRequest: FPRequest {
    let base = request
    return FPRequest(kind: base.kind, config: base.config, profile: profileId)
  }
}

// MARK: - Profile and colours (every widget)

/// Which colours a widget takes: the workspace's accent from the instance
/// (default; Flowplan's without one), the profile's colour dot, the system's
/// tint, or Flowplan's own.
@available(iOS 17.0, *)
enum FPColorChoice: String, AppEnum {
  case accent, profile, system, flowplan
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Colors"
  static var caseDisplayRepresentations: [FPColorChoice: DisplayRepresentation] = [
    .accent: "Workspace accent",
    .profile: "Profile color",
    .system: "System",
    .flowplan: "Flowplan",
  ]
}

/// A profile of the app: its name only (and colour) – the instance and its
/// token stay in the keychain. None chosen: the active profile.
@available(iOS 17.0, *)
struct FPProfileEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Profile"
  static var defaultQuery = FPProfileQuery()
  var id: String
  var name: String
  var active: Bool
  var displayRepresentation: DisplayRepresentation {
    active ? DisplayRepresentation(title: "\(name)", subtitle: "Active profile") : DisplayRepresentation(title: "\(name)")
  }

  init(_ info: FPProfileInfo) {
    id = info.id
    name = info.name
    active = info.active
  }

  struct FPProfileQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FPProfileEntity] {
      let all = FPProfiles.all()
      return identifiers.compactMap { id in all.first { $0.id == id }.map(FPProfileEntity.init) }
    }
    func suggestedEntities() async throws -> [FPProfileEntity] {
      FPProfiles.all().map(FPProfileEntity.init)
    }
  }
}

// MARK: - 1. Quick capture

@available(iOS 17.0, *)
struct FPCaptureConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Quick capture"
  static var description = IntentDescription("Notes, tasks, voice memos and photos in one tap.")
  static let kind = "capture"

  @Parameter(title: "Save to")
  var target: FPCaptureTarget?
  @Parameter(title: "Note", default: true)
  var note: Bool
  @Parameter(title: "Task", default: true)
  var task: Bool
  @Parameter(title: "Voice memo", default: true)
  var voice: Bool
  @Parameter(title: "Photo", default: true)
  var photo: Bool

  var request: FPRequest { FPRequest(kind: Self.kind, config: target.map { ["targetId": $0.id] } ?? [:]) }
  var settings: FPSettings {
    let chosen = [("note", note), ("task", task), ("voice", voice), ("photo", photo)].filter(\.1).map(\.0)
    return FPSettings(buttons: chosen.isEmpty ? ["note"] : chosen)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 2. Tasks

@available(iOS 17.0, *)
enum FPTaskSource: String, AppEnum {
  case mine, view, page
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [FPTaskSource: DisplayRepresentation] = [
    .mine: "My tasks",
    .view: "Records of a database",
    .page: "To-dos of a page",
  ]
}

@available(iOS 17.0, *)
enum FPTaskFilter: String, AppEnum {
  case open, today, overdue
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Filter"
  static var caseDisplayRepresentations: [FPTaskFilter: DisplayRepresentation] = [
    .open: "All open",
    .today: "Due today",
    .overdue: "Overdue",
  ]
}

@available(iOS 17.0, *)
struct FPTasksConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Tasks"
  static var description = IntentDescription("Check off tasks right on the home screen.")
  static let kind = "tasks"

  @Parameter(title: "Show", default: .mine)
  var source: FPTaskSource
  @Parameter(title: "Database")
  var database: FPTaskDatabase?
  @Parameter(title: "View")
  var view: FPViewEntity?
  @Parameter(title: "Page")
  var page: FPTodoPage?
  @Parameter(title: "Filter", default: .open)
  var filter: FPTaskFilter
  // No longer offered: the widget shows as many as its size holds (FPGrid).
  // Kept so widgets already set up keep their settings.
  @Parameter(title: "Number of items", default: 10, inclusiveRange: (1, 10))
  var count: Int

  static var parameterSummary: some ParameterSummary {
    When(\FPTasksConfiguration.$source, .equalTo, .view) {
      Summary {
        \.$source
        \.$database
        \.$view
        \.$filter
        \.$profile
        \.$color
      }
    } otherwise: {
      When(\FPTasksConfiguration.$source, .equalTo, .page) {
        Summary {
          \.$source
          \.$page
          \.$filter
          \.$profile
          \.$color
        }
      } otherwise: {
        Summary {
          \.$source
          \.$filter
          \.$profile
          \.$color
        }
      }
    }
  }

  // Always the instance's most (ten): a large widget fills its rows.
  var request: FPRequest {
    var config: [String: Any] = ["source": "mine", "filter": filter.rawValue, "max": 10]
    if source == .view, let database {
      config["source"] = "view"
      config["pageId"] = database.id
      if let view, view.pageId == database.id { config["viewId"] = view.viewId }
    } else if source == .page, let page {
      config["source"] = "page"
      config["pageId"] = page.id
    }
    return FPRequest(kind: Self.kind, config: config)
  }
  var settings: FPSettings { FPSettings(max: 10) }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 3. Today / calendar

@available(iOS 17.0, *)
enum FPRange: String, AppEnum {
  case today
  case threeDays = "3days"
  case week
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Range"
  static var caseDisplayRepresentations: [FPRange: DisplayRepresentation] = [
    .today: "Today",
    .threeDays: "Next 3 days",
    .week: "This week",
  ]
}

@available(iOS 17.0, *)
struct FPCalendarConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Today"
  static var description = IntentDescription("Your appointments and what is due.")
  static let kind = "calendar"

  @Parameter(title: "Calendars")
  var calendars: [FPCalendarEntity]?
  @Parameter(title: "Range", default: .today)
  var range: FPRange
  @Parameter(title: "Show tasks due", default: true)
  var tasks: Bool

  var request: FPRequest {
    let sources: [[String: String]] = (calendars ?? []).prefix(10).map { calendar in
      let parts = FPCompositeID.split(calendar.id)
      return parts.count > 1 && !parts[1].isEmpty ? ["pageId": parts[0], "viewId": parts[1]] : ["pageId": parts[0]]
    }
    return FPRequest(kind: Self.kind, config: ["sources": sources, "range": range.rawValue, "tasks": tasks, "max": 10])
  }

  /// The small size is the next appointment (countdown, "Join"): the
  /// next-appointment answer of the same calendars; and the unread mentions
  /// for the header's badge.
  var extraRequests: [FPRequest] {
    let ids: [String] = Array(Set((calendars ?? []).map { calendar -> String in
      let parts = FPCompositeID.split(calendar.id)
      return parts.count > 1 && !parts[1].isEmpty ? parts[0] + ":" + parts[1] : parts[0]
    })).sorted().prefix(10).map { $0 }
    let within: String = range == .today ? "today" : range == .threeDays ? "48h" : "week"
    var event: [String: Any] = ["within": within, "showJoin": true, "max": 3]
    if !ids.isEmpty { event["calendars"] = ids }
    return [
      FPRequest(kind: "event", config: event),
      FPRequest(kind: "mentions", config: ["show": "all", "unreadOnly": true, "max": 1]),
    ]
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 4. Page or favorites

@available(iOS 17.0, *)
enum FPPinnedMode: String, AppEnum {
  case favorites, recent, page
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [FPPinnedMode: DisplayRepresentation] = [
    .favorites: "Favorites",
    .recent: "Recently opened",
    .page: "A page or database",
  ]
}

@available(iOS 17.0, *)
struct FPPinnedConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Pages"
  static var description = IntentDescription("Your favorites, what you opened last, or one page or database view.")
  static let kind = "pinned"

  @Parameter(title: "Show", default: .favorites)
  var mode: FPPinnedMode
  @Parameter(title: "Page")
  var page: FPPinnedPage?
  @Parameter(title: "View")
  var view: FPViewEntity?
  @Parameter(title: "First property")
  var first: FPFieldEntity?
  @Parameter(title: "Second property")
  var second: FPFieldEntity?

  static var parameterSummary: some ParameterSummary {
    When(\FPPinnedConfiguration.$mode, .equalTo, .page) {
      Summary {
        \.$mode
        \.$page
        \.$view
        \.$first
        \.$second
        \.$profile
        \.$color
      }
    } otherwise: {
      Summary {
        \.$mode
        \.$profile
        \.$color
      }
    }
  }

  // "Recently opened" is the continue-reading answer (books with how far
  // you got); a large widget fills its rows (at most ten).
  var request: FPRequest {
    if mode == .recent { return FPRequest(kind: "reading", config: ["source": "recent", "max": 6]) }
    guard mode == .page, let page else { return FPRequest(kind: Self.kind, config: ["mode": "favorites", "max": 10]) }
    var config: [String: Any] = ["mode": "page", "pageId": page.id, "max": 10]
    if let view, view.pageId == page.id { config["viewId"] = view.viewId }
    var seen = Set<String>()
    config["properties"] = [first, second].compactMap { $0 }.filter { $0.id.hasPrefix(page.id) }.map(\.fieldId).filter { seen.insert($0).inserted }
    return FPRequest(kind: Self.kind, config: config)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 5. Database counter (the old widget of its own; now a source of
// "Key figure", FPMetricConfiguration – kept for the screens it is on)

@available(iOS 17.0, *)
enum FPAggregate: String, AppEnum {
  case count, sum, average
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Value"
  static var caseDisplayRepresentations: [FPAggregate: DisplayRepresentation] = [
    .count: "Number of records",
    .sum: "Sum",
    .average: "Average",
  ]
}

@available(iOS 17.0, *)
struct FPCounterConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Database counter"
  static var description = IntentDescription("One number of a database, with its last 14 days.")
  static let kind = "counter"

  @Parameter(title: "Database")
  var database: FPCounterDatabase?
  @Parameter(title: "View")
  var view: FPViewEntity?
  @Parameter(title: "Value", default: .count)
  var aggregate: FPAggregate
  @Parameter(title: "Number property")
  var field: FPFieldEntity?
  @Parameter(title: "Only one group")
  var groupField: FPFieldEntity?
  @Parameter(title: "Group value", optionsProvider: FPGroupValues())
  var groupValue: String?
  @Parameter(title: "History of the last 14 days", default: true)
  var history: Bool

  static var parameterSummary: some ParameterSummary {
    When(\FPCounterConfiguration.$aggregate, .equalTo, FPAggregate.count) {
      Summary {
        \.$database
        \.$view
        \.$aggregate
        \.$groupField
        \.$groupValue
        \.$history
        \.$profile
        \.$color
      }
    } otherwise: {
      Summary {
        \.$database
        \.$view
        \.$aggregate
        \.$field
        \.$groupField
        \.$groupValue
        \.$history
        \.$profile
        \.$color
      }
    }
  }

  var needsSetup: Bool { database == nil }

  var request: FPRequest {
    guard let database else { return FPRequest(kind: Self.kind, config: [:]) }
    var config: [String: Any] = ["pageId": database.id, "aggregate": "count", "history": history]
    if let view, view.pageId == database.id { config["viewId"] = view.viewId }
    if aggregate != .count, let field, field.id.hasPrefix(database.id) {
      config["aggregate"] = aggregate.rawValue
      config["fieldId"] = field.fieldId
    }
    if let groupField, groupField.id.hasPrefix(database.id) {
      config["groupFieldId"] = groupField.fieldId
      if let groupValue { config["groupValue"] = groupValue }
    }
    return FPRequest(kind: Self.kind, config: config)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 6. Journal and habits

@available(iOS 17.0, *)
struct FPJournalConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Journal and habits"
  static var description = IntentDescription("Today's entry and your habits to check off.")
  static let kind = "journal"

  @Parameter(title: "Journal")
  var journal: FPJournalPage?
  @Parameter(title: "Habits")
  var habits: FPHabitDatabase?

  var request: FPRequest {
    var config: [String: Any] = [:]
    if let journal { config["journalId"] = journal.id }
    if let habits { config["habitsId"] = habits.id }
    return FPRequest(kind: Self.kind, config: config)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 7. Time this week

@available(iOS 17.0, *)
struct FPTimeConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Time this week"
  static var description = IntentDescription("Hours this week; start and stop the timer.")
  static let kind = "time"

  @Parameter(title: "Timer for “Start”")
  var timer: FPTimerEntity?

  var request: FPRequest { FPRequest(kind: Self.kind, config: [:]) }
  var settings: FPSettings {
    guard let timer else { return FPSettings() }
    let parts = FPCompositeID.split(timer.id)
    guard parts.count == 3 else { return FPSettings() }
    return FPSettings(timer: ["pageId": parts[0], "rowId": parts[1], "fieldId": parts[2]])
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 10. Cards due

@available(iOS 17.0, *)
struct FPStudyConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Cards due"
  static var description = IntentDescription("Flashcards to study today.")
  static let kind = "study"

  // None chosen: all decks (#352).
  @Parameter(title: "Decks")
  var decks: [FPDeck]?

  var request: FPRequest {
    // Sorted: the same decks in another order share one answer.
    let ids = Array(Set((decks ?? []).map(\.id))).sorted().prefix(20)
    return FPRequest(kind: Self.kind, config: ids.isEmpty ? [:] : ["pageIds": Array(ids)])
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 11. Next appointment

@available(iOS 17.0, *)
enum FPWithin: String, AppEnum {
  case today
  case twoDays = "48h"
  case week
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Look ahead"
  static var caseDisplayRepresentations: [FPWithin: DisplayRepresentation] = [
    .today: "Today",
    .twoDays: "Next 48 hours",
    .week: "This week",
  ]
}

@available(iOS 17.0, *)
struct FPEventConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Next appointment"
  static var description = IntentDescription("Your next appointment with a countdown; join video calls.")
  static let kind = "event"

  @Parameter(title: "Calendars")
  var calendars: [FPEventCalendar]?
  @Parameter(title: "Look ahead", default: .twoDays)
  var within: FPWithin
  @Parameter(title: "“Join” for video calls", default: true)
  var showJoin: Bool

  var request: FPRequest {
    let ids: [String] = Array(Set((calendars ?? []).map(\.id))).sorted().prefix(10).map { $0 }
    var config: [String: Any] = ["within": within.rawValue, "showJoin": showJoin, "max": 3]
    if !ids.isEmpty { config["calendars"] = ids }
    return FPRequest(kind: Self.kind, config: config)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 12. Continue reading

@available(iOS 17.0, *)
enum FPReadingSource: String, AppEnum {
  case recent, library
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [FPReadingSource: DisplayRepresentation] = [
    .recent: "Recently opened",
    .library: "Library books",
  ]
}

@available(iOS 17.0, *)
struct FPReadingConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Continue reading"
  static var description = IntentDescription("Pick up recent pages and library books where you left off.")
  static let kind = "reading"

  @Parameter(title: "Show", default: .recent)
  var source: FPReadingSource
  @Parameter(title: "Number of items", default: 4, inclusiveRange: (1, 6))
  var count: Int

  var request: FPRequest { FPRequest(kind: Self.kind, config: ["source": source.rawValue, "max": min(6, max(1, count))]) }
  var settings: FPSettings { FPSettings(max: min(6, max(1, count))) }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 13. Key figure: a database's number or a dashboard's

/// Where the key figure comes from.
@available(iOS 17.0, *)
enum FPFigureSource: String, AppEnum {
  case dashboard, database
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Source"
  static var caseDisplayRepresentations: [FPFigureSource: DisplayRepresentation] = [
    .dashboard: "Dashboard",
    .database: "Database",
  ]
}

// The old "Key figure" (dashboard) with the database counter's settings:
// widgets set up before keep theirs (the source defaults to the dashboard).
@available(iOS 17.0, *)
struct FPMetricConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Key figure"
  static var description = IntentDescription("A number of a database or dashboard, with its trend.")
  static let kind = "metric"

  @Parameter(title: "Source", default: .dashboard)
  var source: FPFigureSource
  @Parameter(title: "Key figure")
  var figure: FPFigureEntity?
  @Parameter(title: "Database")
  var database: FPCounterDatabase?
  @Parameter(title: "View")
  var view: FPViewEntity?
  @Parameter(title: "Value", default: .count)
  var aggregate: FPAggregate
  @Parameter(title: "Number property")
  var field: FPFieldEntity?
  @Parameter(title: "Only one group")
  var groupField: FPFieldEntity?
  @Parameter(title: "Group value", optionsProvider: FPGroupValues())
  var groupValue: String?

  static var parameterSummary: some ParameterSummary {
    When(\FPMetricConfiguration.$source, .equalTo, FPFigureSource.dashboard) {
      Summary {
        \.$source
        \.$figure
        \.$profile
        \.$color
      }
    } otherwise: {
      When(\FPMetricConfiguration.$aggregate, .equalTo, FPAggregate.count) {
        Summary {
          \.$source
          \.$database
          \.$view
          \.$aggregate
          \.$groupField
          \.$groupValue
          \.$profile
          \.$color
        }
      } otherwise: {
        Summary {
          \.$source
          \.$database
          \.$view
          \.$aggregate
          \.$field
          \.$groupField
          \.$groupValue
          \.$profile
          \.$color
        }
      }
    }
  }

  var needsSetup: Bool { source == .dashboard ? figure == nil : database == nil }

  var request: FPRequest {
    if source == .database {
      // A database's number with its last 14 days: the trend.
      guard let database else { return FPRequest(kind: "counter", config: [:]) }
      var config: [String: Any] = ["pageId": database.id, "aggregate": "count", "history": true]
      if let view, view.pageId == database.id { config["viewId"] = view.viewId }
      if aggregate != .count, let field, field.id.hasPrefix(database.id) {
        config["aggregate"] = aggregate.rawValue
        config["fieldId"] = field.fieldId
      }
      if let groupField, groupField.id.hasPrefix(database.id) {
        config["groupFieldId"] = groupField.fieldId
        if let groupValue { config["groupValue"] = groupValue }
      }
      return FPRequest(kind: "counter", config: config)
    }
    guard let figure else { return FPRequest(kind: Self.kind, config: [:]) }
    return FPRequest(kind: Self.kind, config: ["dashboardId": figure.dashboardId, "widgetId": figure.widgetId])
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 14. Deadline countdown

@available(iOS 17.0, *)
struct FPDeadlineConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Deadline"
  static var description = IntentDescription("Counts down to one task or record.")
  static let kind = "deadline"

  @Parameter(title: "Task or record")
  var item: FPDeadlineEntity?

  var needsSetup: Bool { item == nil }
  var request: FPRequest {
    guard let item else { return FPRequest(kind: Self.kind, config: [:]) }
    return FPRequest(kind: Self.kind, config: item.config)
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 15. My day

/// Today's appointments, the tasks due today or overdue, and today's habits:
/// one request (the calendar's answer) with the tasks and habits answers.
@available(iOS 17.0, *)
struct FPMyDayConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "My day"
  static var description = IntentDescription("Today's appointments, what is due and your habits – check off right here.")
  static let kind = "myday"

  @Parameter(title: "Calendars")
  var calendars: [FPCalendarEntity]?
  @Parameter(title: "Habits")
  var habits: FPHabitDatabase?

  var request: FPRequest {
    let sources: [[String: String]] = (calendars ?? []).prefix(10).map { calendar in
      let parts = FPCompositeID.split(calendar.id)
      return parts.count > 1 && !parts[1].isEmpty ? ["pageId": parts[0], "viewId": parts[1]] : ["pageId": parts[0]]
    }
    return FPRequest(kind: "calendar", config: ["sources": sources, "range": "today", "tasks": false, "max": 10])
  }

  var extraRequests: [FPRequest] {
    var journal: [String: Any] = [:]
    if let habits { journal["habitsId"] = habits.id }
    return [
      FPRequest(kind: "tasks", config: ["source": "mine", "filter": "open", "max": 10]),
      FPRequest(kind: "journal", config: journal),
    ]
  }

  @Parameter(title: "Profile")
  var profile: FPProfileEntity?
  @Parameter(title: "Colors", default: .accent)
  var color: FPColorChoice

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - Buttons in widgets (iOS 17: they run here, in the extension)
//
// The tapped item is drawn done at once and comes back with a hint when the
// instance refuses (FPWidgets.run). Parameters are plain values ("" and -1
// for none): the system stores them with the widget's view.

/// The widget kinds whose buttons these are (SuiteWidgets.swift).
enum FPWidgetKind {
  static let tasks = "FlowplanTaskList"
  static let journal = "FlowplanJournal"
  static let time = "FlowplanTime"
  static let myDay = "FlowplanMyDay"

  /// The widget kind of an answer's kind (a button reloads it first).
  static func of(_ kind: String) -> String {
    switch kind {
    case "tasks": return tasks
    case "journal": return journal
    case "time": return time
    case "myday": return myDay
    default: return ""
    }
  }
}

@available(iOS 17.0, *)
struct FPCompleteTaskIntent: AppIntent {
  static var title: LocalizedStringResource = "Mark as done"
  static var isDiscoverable = false

  @Parameter(title: "Source", default: "doc") var source: String
  @Parameter(title: "Page", default: "") var pageId: String
  @Parameter(title: "Record", default: "") var rowId: String
  @Parameter(title: "Position", default: -1) var index: Int
  @Parameter(title: "Key", default: "") var key: String
  @Parameter(title: "Text", default: "") var text: String
  // The widget's profile ("": the active one).
  @Parameter(title: "Profile", default: "") var profile: String
  // The widget kind it was tapped in ("": the tasks widget).
  @Parameter(title: "Widget", default: "") var widget: String

  init() {}
  init(source: String, pageId: String, rowId: String, index: Int, key: String, text: String, profile: String?, widget: String = "") {
    self.source = source
    self.pageId = pageId
    self.rowId = rowId
    self.index = index
    self.key = key
    self.text = text
    self.profile = profile ?? ""
    self.widget = widget
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPCompleteTaskIntent")
    var fields: [String: Any] = ["source": source, "pageId": pageId, "done": true]
    if !rowId.isEmpty { fields["rowId"] = rowId }
    if index >= 0 { fields["index"] = index }
    // The key identifies a document task; the text (as shown) is for
    // instances that do not know the key yet.
    if !key.isEmpty { fields["key"] = key }
    if !text.isEmpty { fields["text"] = text }
    let item: String = FPActions.taskID(source: source, pageId: pageId, rowId: rowId, index: index)
    await FPWidgets.run("task.complete", fields, item: item, kind: widget.isEmpty ? FPWidgetKind.tasks : widget, profile: profile.isEmpty ? nil : profile)
    return .result()
  }
}

@available(iOS 17.0, *)
struct FPCheckHabitIntent: AppIntent {
  static var title: LocalizedStringResource = "Check off habit"
  static var isDiscoverable = false

  @Parameter(title: "Habits", default: "") var pageId: String
  @Parameter(title: "Habit", default: "") var fieldId: String
  @Parameter(title: "Done", default: true) var done: Bool
  @Parameter(title: "Profile", default: "") var profile: String
  @Parameter(title: "Widget", default: "") var widget: String

  init() {}
  init(pageId: String, fieldId: String, done: Bool, profile: String?, widget: String = "") {
    self.pageId = pageId
    self.fieldId = fieldId
    self.done = done
    self.profile = profile ?? ""
    self.widget = widget
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPCheckHabitIntent")
    let fields: [String: Any] = ["pageId": pageId, "fieldId": fieldId, "done": done, "today": FPAPI.today()]
    let item: String = FPActions.habitID(pageId: pageId, fieldId: fieldId)
    await FPWidgets.run("habit.check", fields, item: item, kind: widget.isEmpty ? FPWidgetKind.journal : widget, profile: profile.isEmpty ? nil : profile)
    return .result()
  }
}

@available(iOS 17.0, *)
struct FPStartTimerIntent: AppIntent {
  static var title: LocalizedStringResource = "Start timer"
  static var isDiscoverable = false

  @Parameter(title: "Page", default: "") var pageId: String
  @Parameter(title: "Record", default: "") var rowId: String
  @Parameter(title: "Property", default: "") var fieldId: String
  @Parameter(title: "Profile", default: "") var profile: String

  init() {}
  init(pageId: String, rowId: String, fieldId: String, profile: String?) {
    self.pageId = pageId
    self.rowId = rowId
    self.fieldId = fieldId
    self.profile = profile ?? ""
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPStartTimerIntent")
    let fields: [String: Any] = ["pageId": pageId, "rowId": rowId, "fieldId": fieldId]
    await FPWidgets.run("timer.start", fields, item: FPActions.timerStartID, kind: FPWidgetKind.time, profile: profile.isEmpty ? nil : profile)
    return .result()
  }
}

@available(iOS 17.0, *)
struct FPStopTimerIntent: AppIntent {
  static var title: LocalizedStringResource = "Stop timer"
  static var isDiscoverable = false

  @Parameter(title: "Profile", default: "") var profile: String

  init() {}
  init(profile: String?) {
    self.profile = profile ?? ""
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPStopTimerIntent")
    await FPWidgets.run("timer.stop", [:], item: FPActions.timerStopID, kind: FPWidgetKind.time, profile: profile.isEmpty ? nil : profile)
    return .result()
  }
}

// MARK: - Controls (iOS 18): Control Center, lock screen, Action button

/// Opens the app's capture screen or a step of the app (focus).
@available(iOS 18.0, *)
struct FPOpenAppIntent: AppIntent {
  static var title: LocalizedStringResource = "Open Flowplan"
  static var isDiscoverable = false

  @Parameter(title: "Link") var link: String

  init() {}
  init(link: String) {
    self.link = link
  }

  func perform() async throws -> some IntentResult & OpensIntent {
    // Only the app's own links.
    let url = link.hasPrefix("flowplan://") ? URL(string: link) : nil
    return .result(opensIntent: OpenURLIntent(url ?? URL(string: "flowplan://open?path=%2F")!))
  }
}

/// "Join" in a small widget (no links there): opens the video call. Only
/// https addresses the instance named (FPExternal.join).
@available(iOS 18.0, *)
struct FPJoinIntent: AppIntent {
  static var title: LocalizedStringResource = "Join"
  static var isDiscoverable = false

  @Parameter(title: "Link") var link: String

  init() {}
  init(link: String) {
    self.link = link
  }

  func perform() async throws -> some IntentResult & OpensIntent {
    let url: URL = FPExternal.join(link) ?? URL(string: "flowplan://open?path=%2F")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}

/// The timer as a switch: on starts the most recent timer, off stops it.
@available(iOS 18.0, *)
struct FPToggleTimerIntent: SetValueIntent {
  static var title: LocalizedStringResource = "Timer"
  static var isDiscoverable = false

  @Parameter(title: "Running") var value: Bool

  init() {}

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPToggleTimerIntent")
    if value {
      let time = try await FPWidgets.fresh("time")
      guard let recent = time["recent"].array.first,
            let pageId = recent["pageId"].string, let rowId = recent["rowId"].string, let fieldId = recent["fieldId"].string else {
        return .result()
      }
      try await FPWidgets.act("timer.start", ["pageId": pageId, "rowId": rowId, "fieldId": fieldId])
    } else {
      try await FPWidgets.act("timer.stop")
    }
    return .result()
  }
}

@available(iOS 18.0, *)
struct FPTimerValue: ControlValueProvider {
  var previewValue: Bool { false }

  func currentValue() async throws -> Bool {
    let time = try await FPWidgets.fresh("time")
    return !time["timer"].isNull
  }
}
