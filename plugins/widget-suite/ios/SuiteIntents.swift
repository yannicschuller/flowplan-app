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
  /// Settings that only the phone uses (buttons, the start timer …).
  var settings: FPSettings { get }
  /// Nothing to show before a page is chosen.
  var needsSetup: Bool { get }
}

struct FPSettings: Sendable {
  var buttons: [String] = []
  var max = 5
  var timer: [String: String]? = nil
}

@available(iOS 17.0, *)
extension FPSuiteConfiguration {
  var settings: FPSettings { FPSettings() }
  var needsSetup: Bool { false }
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
  @Parameter(title: "Number of items", default: 5, inclusiveRange: (1, 10))
  var count: Int

  static var parameterSummary: some ParameterSummary {
    When(\.$source, .equalTo, .view) {
      Summary {
        \.$source
        \.$database
        \.$view
        \.$filter
        \.$count
      }
    } otherwise: {
      When(\.$source, .equalTo, .page) {
        Summary {
          \.$source
          \.$page
          \.$filter
          \.$count
        }
      } otherwise: {
        Summary {
          \.$source
          \.$filter
          \.$count
        }
      }
    }
  }

  var request: FPRequest {
    var config: [String: Any] = ["source": "mine", "filter": filter.rawValue, "max": min(10, max(1, count))]
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
  var settings: FPSettings { FPSettings(max: min(10, max(1, count))) }

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

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 4. Page or favorites

@available(iOS 17.0, *)
enum FPPinnedMode: String, AppEnum {
  case favorites, page
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [FPPinnedMode: DisplayRepresentation] = [
    .favorites: "Favorites",
    .page: "A page or database",
  ]
}

@available(iOS 17.0, *)
struct FPPinnedConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Page and favorites"
  static var description = IntentDescription("Your favorites, or one page or database view.")
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
    When(\.$mode, .equalTo, .page) {
      Summary {
        \.$mode
        \.$page
        \.$view
        \.$first
        \.$second
      }
    } otherwise: {
      Summary {
        \.$mode
      }
    }
  }

  var request: FPRequest {
    guard mode == .page, let page else { return FPRequest(kind: Self.kind, config: ["mode": "favorites", "max": 8]) }
    var config: [String: Any] = ["mode": "page", "pageId": page.id, "max": 8]
    if let view, view.pageId == page.id { config["viewId"] = view.viewId }
    var seen = Set<String>()
    config["properties"] = [first, second].compactMap { $0 }.filter { $0.id.hasPrefix(page.id) }.map(\.fieldId).filter { seen.insert($0).inserted }
    return FPRequest(kind: Self.kind, config: config)
  }

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 5. Database counter

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
    When(\.$aggregate, .equalTo, .count) {
      Summary {
        \.$database
        \.$view
        \.$aggregate
        \.$groupField
        \.$groupValue
        \.$history
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

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 8. Mentions

@available(iOS 17.0, *)
enum FPMentionShow: String, AppEnum {
  case all, mentions, assignments
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static var caseDisplayRepresentations: [FPMentionShow: DisplayRepresentation] = [
    .all: "Mentions and new tasks",
    .mentions: "Mentions",
    .assignments: "New tasks for me",
  ]
}

@available(iOS 17.0, *)
struct FPMentionsConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Mentions"
  static var description = IntentDescription("Who mentioned you; mark as read right away.")
  static let kind = "mentions"

  @Parameter(title: "Show", default: .all)
  var show: FPMentionShow
  @Parameter(title: "Unread only", default: true)
  var unreadOnly: Bool

  var request: FPRequest { FPRequest(kind: Self.kind, config: ["show": show.rawValue, "unreadOnly": unreadOnly, "max": 5]) }

  func perform() async throws -> some IntentResult { .result() }
}

// MARK: - 9. Form responses

@available(iOS 17.0, *)
struct FPFormsConfiguration: FPSuiteConfiguration {
  static var title: LocalizedStringResource = "Form responses"
  static var description = IntentDescription("New responses to one of your forms.")
  static let kind = "forms"

  @Parameter(title: "Form")
  var form: FPFormPage?

  var needsSetup: Bool { form == nil }
  var request: FPRequest { FPRequest(kind: Self.kind, config: form.map { ["pageId": $0.id, "max": 3] } ?? [:]) }

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
  static let mentions = "FlowplanMentions"
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

  init() {}
  init(source: String, pageId: String, rowId: String, index: Int, key: String, text: String) {
    self.source = source
    self.pageId = pageId
    self.rowId = rowId
    self.index = index
    self.key = key
    self.text = text
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
    await FPWidgets.run("task.complete", fields, item: item, kind: FPWidgetKind.tasks)
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

  init() {}
  init(pageId: String, fieldId: String, done: Bool) {
    self.pageId = pageId
    self.fieldId = fieldId
    self.done = done
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPCheckHabitIntent")
    let fields: [String: Any] = ["pageId": pageId, "fieldId": fieldId, "done": done, "today": FPAPI.today()]
    let item: String = FPActions.habitID(pageId: pageId, fieldId: fieldId)
    await FPWidgets.run("habit.check", fields, item: item, kind: FPWidgetKind.journal)
    return .result()
  }
}

@available(iOS 17.0, *)
struct FPMarkReadIntent: AppIntent {
  static var title: LocalizedStringResource = "Mark as read"
  static var isDiscoverable = false

  // "": all of them.
  @Parameter(title: "Notification", default: "") var notificationId: String

  init() {}
  init(notificationId: String?) {
    self.notificationId = notificationId ?? ""
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPMarkReadIntent")
    if notificationId.isEmpty {
      await FPWidgets.run("mention.readAll", [:], item: FPActions.readID(nil), kind: FPWidgetKind.mentions)
    } else {
      let fields: [String: Any] = ["notificationId": notificationId, "read": true]
      await FPWidgets.run("mention.read", fields, item: FPActions.readID(notificationId), kind: FPWidgetKind.mentions)
    }
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

  init() {}
  init(pageId: String, rowId: String, fieldId: String) {
    self.pageId = pageId
    self.rowId = rowId
    self.fieldId = fieldId
  }

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPStartTimerIntent")
    let fields: [String: Any] = ["pageId": pageId, "rowId": rowId, "fieldId": fieldId]
    await FPWidgets.run("timer.start", fields, item: FPActions.timerStartID, kind: FPWidgetKind.time)
    return .result()
  }
}

@available(iOS 17.0, *)
struct FPStopTimerIntent: AppIntent {
  static var title: LocalizedStringResource = "Stop timer"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    FPLog.intent("FPStopTimerIntent")
    await FPWidgets.run("timer.stop", [:], item: FPActions.timerStopID, kind: FPWidgetKind.time)
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
