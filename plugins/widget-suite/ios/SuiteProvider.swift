import AppIntents
import WidgetKit

// The timelines of the configurable widgets: the answer for a widget's
// settings, from the App Group while it is fresh, otherwise from one
// request for every widget on a screen (FPRefresher). The refresh budget is
// spent where it matters: lists every 30 minutes, the counter hourly, the
// capture widget (no live content) every six hours. The app reloads all of
// them when something changes (and that does not count against the budget).

enum FPState: Sendable {
  case data
  case sample
  case signedOut
  case setup
  case gone
  case offline
}

struct FPEntry: TimelineEntry {
  let date: Date
  let kind: String
  let state: FPState
  let data: FPJSON
  let settings: FPSettings
  // The answer is older than it should be (offline).
  var stale = false
  // Buttons tapped: drawn done, or back with a hint (FPActions).
  var marks = FPMarks()

  var locked: Bool { data["locked"].bool }
  var encrypted: Bool { data["encrypted"].bool }
}

@available(iOS 17.0, *)
struct FPProvider<Configuration: FPSuiteConfiguration>: AppIntentTimelineProvider {
  typealias Entry = FPEntry
  typealias Intent = Configuration

  private var maxAge: TimeInterval {
    switch Configuration.kind {
    case "capture": return 6 * 3600
    case "counter", "forms", "pinned": return 3600
    default: return 1800
    }
  }

  func placeholder(in context: Context) -> FPEntry {
    FPSamples.entry(Configuration.kind, settings: FPSettings())
  }

  func snapshot(for configuration: Configuration, in context: Context) async -> FPEntry {
    // The widget gallery shows made-up content in the person's language.
    if context.isPreview { return FPSamples.entry(Configuration.kind, settings: configuration.settings) }
    return await entry(for: configuration)
  }

  func timeline(for configuration: Configuration, in context: Context) async -> Timeline<FPEntry> {
    let entry = await entry(for: configuration)
    var next: TimeInterval = entry.state == .data && !entry.stale ? maxAge : 900
    // A hint after a refusal goes with the next refresh; an action that
    // never answered is forgotten soon.
    if !entry.marks.failed.isEmpty { next = min(next, FPActions.failedFor) }
    if !entry.marks.pending.isEmpty { next = min(next, FPActions.pendingFor + 10) }
    return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(next)))
  }

  private func entry(for configuration: Configuration) async -> FPEntry {
    let kind = Configuration.kind
    let settings = configuration.settings
    if configuration.needsSetup {
      return FPEntry(date: Date(), kind: kind, state: FPKeychain.load()?.token == nil ? .signedOut : .setup, data: FPJSON(nil), settings: settings)
    }
    switch await FPRefresher.shared.load(configuration.request, maxAge: maxAge) {
    case .signedOut:
      return FPEntry(date: Date(), kind: kind, state: .signedOut, data: FPJSON(nil), settings: settings)
    case .unavailable:
      return FPEntry(date: Date(), kind: kind, state: .offline, data: FPJSON(nil), settings: settings)
    case .answer(let result, let stale):
      if !result.ok {
        let state: FPState = result.status == 403 || result.status == 404 ? .gone : .offline
        return FPEntry(date: Date(), kind: kind, state: state, data: FPJSON(nil), settings: settings)
      }
      return FPEntry(date: Date(), kind: kind, state: .data, data: result.data, settings: settings, stale: stale, marks: FPActions.marks())
    }
  }
}

/// Made-up content for the gallery, in the person's language (the same
/// shapes the instance sends).
enum FPSamples {
  static func entry(_ kind: String, settings: FPSettings) -> FPEntry {
    var settings = settings
    if settings.buttons.isEmpty { settings.buttons = ["note", "task", "voice", "photo"] }
    return FPEntry(date: Date(), kind: kind, state: .sample, data: FPJSON(data(kind)), settings: settings)
  }

  private static func day(_ offset: Int) -> String {
    FPAPI.today(Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date())
  }
  private static func at(hour: Int, minute: Int = 0) -> String {
    let date = Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
    return ISO8601DateFormatter().string(from: date)
  }

  private static func data(_ kind: String) -> [String: Any] {
    let now = Date().timeIntervalSince1970 * 1000
    switch kind {
    case "capture":
      return ["title": L("Quick capture"), "target": ["id": "sample", "name": L("Inbox"), "kind": "database"], "voice": true]
    case "tasks":
      return ["title": L("My tasks"), "total": 4, "items": [
        ["source": "doc", "pageId": "sample", "text": L("Send offer to Miller"), "due": day(-1), "page": L("Sales"), "url": "/", "canEdit": true],
        ["source": "doc", "pageId": "sample", "text": L("Prepare the retro"), "due": day(0), "page": L("Team"), "url": "/", "canEdit": true],
        ["source": "doc", "pageId": "sample", "text": L("Submit travel expenses"), "due": day(1), "page": L("Finance"), "url": "/", "canEdit": true],
        ["source": "doc", "pageId": "sample", "text": L("Review website copy"), "page": L("Marketing"), "url": "/", "canEdit": true],
      ]]
    case "calendar":
      return ["title": L("Today"), "items": [
        ["type": "event", "title": L("Stand-up"), "day": day(0), "start": at(hour: 9), "end": at(hour: 9, minute: 15), "timed": true, "calendar": L("Team"), "url": "/"],
        ["type": "event", "title": L("Client meeting Miller"), "day": day(0), "start": at(hour: 14), "end": at(hour: 15), "timed": true, "calendar": L("Sales"), "url": "/"],
        ["type": "task", "title": L("Prepare the retro"), "day": day(0), "timed": false, "calendar": L("Team"), "url": "/"],
      ]]
    case "pinned":
      return ["title": L("Favorites"), "items": [
        ["id": "1", "kind": "document", "title": L("Weekly plan"), "url": "/"],
        ["id": "2", "kind": "database", "title": "Roadmap", "url": "/"],
        ["id": "3", "kind": "record", "title": L("Website relaunch"), "detail": "Roadmap", "url": "/"],
        ["id": "4", "kind": "whiteboard", "title": L("Brainstorming"), "url": "/"],
      ]]
    case "counter":
      let values = [28, 29, 29, 31, 30, 32, 33, 33, 35, 36, 38, 39, 41, 42]
      return ["title": L("Applications"), "view": "", "label": L("Records"), "formatted": "42", "value": 42, "url": "/",
              "history": values.enumerated().map { index, value -> [String: Any] in
                var point: [String: Any] = ["day": day(index - 13), "value": value]
                if index < 4 { point["estimated"] = true }
                return point
              }]
    case "journal":
      return ["title": L("Journal"),
              "journal": ["id": "sample", "name": L("My journal"), "written": true, "streak": 6, "today": "/", "canWrite": true],
              "habits": ["id": "sample", "name": L("Habits"), "done": 2, "total": 3, "canWrite": true, "url": "/", "items": [
                ["fieldId": "a", "name": L("Run"), "done": true],
                ["fieldId": "b", "name": L("Read"), "done": true],
                ["fieldId": "c", "name": L("No sugar"), "done": false],
              ]]]
    case "time":
      let monday = Calendar.current.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
      let hours: [Double] = [6.5, 7.25, 3.5, 0, 0, 0, 0]
      return ["title": L("Time this week"), "today": 3.5, "week": 17.25,
              "days": hours.enumerated().map { index, value -> [String: Any] in ["day": FPAPI.today(monday.addingTimeInterval(Double(index) * 86_400 + 43_200)), "hours": value] },
              "timer": ["start": now - 47 * 60_000, "title": L("Write offer"), "database": L("Projects"), "url": "/"],
              "recent": []]
    case "mentions":
      return ["title": L("Mentions"), "unread": ["mentions": 2, "assignments": 1], "items": [
        ["id": "1", "type": "mention", "text": L("Ada mentioned you in “Roadmap”"), "read": false, "createdAt": now - 20 * 60_000, "url": "/"],
        ["id": "2", "type": "assignment", "text": L("Ben gave you “Prepare the retro”"), "read": false, "createdAt": now - 3 * 3_600_000, "url": "/"],
      ]]
    case "forms":
      return ["title": L("Contact form"), "total": 12, "new": 2, "url": "/", "items": [
        ["id": "1", "title": "Clara Weber", "createdAt": now - 35 * 60_000, "new": true, "url": "/"],
        ["id": "2", "title": "Jonas Klein", "createdAt": now - 5 * 3_600_000, "new": true, "url": "/"],
        ["id": "3", "title": "Mia Sommer", "createdAt": now - 30 * 3_600_000, "new": false, "url": "/"],
      ]]
    default:
      return [:]
    }
  }
}
