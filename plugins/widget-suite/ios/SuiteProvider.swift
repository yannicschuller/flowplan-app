import AppIntents
import SwiftUI
import WidgetKit

// The timelines of the configurable widgets: the answer for a widget's
// settings, from the App Group while it is fresh, otherwise from one
// request for every widget of the same profile on a screen (FPRefresher).
// The refresh budget is spent where it matters: lists every 30 minutes, the
// counters hourly, the capture widget (no live content) every six hours. The
// app reloads all of them when something changes (and that does not count
// against the budget); on iOS 26 the instance can also push a reload
// (WidgetKit push, SuiteWidgets.swift → FPWidgetPushHandler).
//
// Smart Stack: entries say how relevant they are (TimelineEntryRelevance –
// on iOS the system reads that; RelevanceKit's relevance() only acts on
// watchOS): an appointment soon, cards due, a deadline close or past.

enum FPState: Sendable {
  case data
  case sample
  case signedOut
  case setup
  case gone
  case offline
  // The instance does not know this kind of widget yet (older Flowplan).
  case outdated
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
  // The profile the widget shows (nil: the active one) – its buttons act
  // there – and the colours it takes.
  var profile: String? = nil
  var palette = FPPalette.flowplan
  var relevance: TimelineEntryRelevance? = nil

  var locked: Bool { data["locked"].bool }
  var encrypted: Bool { data["encrypted"].bool }
}

/// Kinds that older instances refuse (400): their widgets ask for an update.
enum FPNewKinds {
  static let all: Set<String> = ["event", "reading", "metric", "deadline"]
}

@available(iOS 17.0, *)
struct FPProvider<Configuration: FPSuiteConfiguration>: AppIntentTimelineProvider {
  typealias Entry = FPEntry
  typealias Intent = Configuration

  private var maxAge: TimeInterval {
    switch Configuration.kind {
    case "capture": return 6 * 3600
    case "counter", "forms", "pinned", "metric", "deadline": return 3600
    default: return 1800
    }
  }

  func placeholder(in context: Context) -> FPEntry {
    FPSamples.entry(Configuration.kind, settings: FPSettings())
  }

  func snapshot(for configuration: Configuration, in context: Context) async -> FPEntry {
    // The widget gallery shows made-up content in the person's language.
    if context.isPreview {
      var entry = FPSamples.entry(Configuration.kind, settings: configuration.settings)
      entry.palette = FPPalette.resolve(configuration.color, theme: FPJSON(nil), profile: configuration.profileId)
      return entry
    }
    return await entry(for: configuration)
  }

  func timeline(for configuration: Configuration, in context: Context) async -> Timeline<FPEntry> {
    let entry = await entry(for: configuration)
    var next: TimeInterval = entry.state == .data && !entry.stale ? maxAge : 900
    // A hint after a refusal goes with the next refresh; an action that
    // never answered is forgotten soon.
    if !entry.marks.failed.isEmpty { next = min(next, FPActions.failedFor) }
    if !entry.marks.pending.isEmpty { next = min(next, FPActions.pendingFor + 10) }
    var entries: [FPEntry] = [entry]
    // An appointment starts or ends before the next refresh: the widget
    // shows "Now" at its start and the next one after its end, without
    // asking the instance (the countdown itself is a live Text).
    if entry.state == .data, Configuration.kind == "event" {
      let changes = FPRelevance.eventChanges(entry.data).filter { $0 > Date() && $0 < Date().addingTimeInterval(next) }
      for at in changes.prefix(4) {
        var later = FPEntry(date: at, kind: entry.kind, state: entry.state, data: entry.data, settings: entry.settings, stale: entry.stale, marks: entry.marks, profile: entry.profile, palette: entry.palette)
        later.relevance = FPRelevance.of(kind: entry.kind, data: entry.data, at: at)
        entries.append(later)
      }
    }
    return Timeline(entries: entries, policy: .after(Date().addingTimeInterval(next)))
  }

  private func entry(for configuration: Configuration) async -> FPEntry {
    let kind = Configuration.kind
    let settings = configuration.settings
    let profile = configuration.profileId
    let palette = FPPalette.resolve(configuration.color, theme: FPJSON(nil), profile: profile)
    func closed(_ state: FPState) -> FPEntry {
      FPEntry(date: Date(), kind: kind, state: state, data: FPJSON(nil), settings: settings, profile: profile, palette: palette)
    }
    if configuration.needsSetup {
      return closed(FPKeychain.session(for: profile)?.token == nil ? .signedOut : .setup)
    }
    switch await FPRefresher.shared.load(configuration.profiledRequest, maxAge: maxAge) {
    case .signedOut:
      return closed(.signedOut)
    case .unavailable:
      return closed(.offline)
    case .answer(let result, let stale):
      if !result.ok {
        if FPNewKinds.all.contains(kind) && (result.status == 400 || result.status == 501) { return closed(.outdated) }
        return closed(result.status == 403 || result.status == 404 ? .gone : .offline)
      }
      var entry = FPEntry(date: Date(), kind: kind, state: .data, data: result.data, settings: settings, stale: stale, marks: FPActions.marks(), profile: profile)
      entry.palette = FPPalette.resolve(configuration.color, theme: result.theme, profile: profile)
      entry.relevance = FPRelevance.of(kind: kind, data: result.data, at: Date())
      return entry
    }
  }
}

/// How relevant a widget is right now, for the Smart Stack.
enum FPRelevance {
  /// The start (all-day: none) and end of the appointments shown.
  static func eventChanges(_ data: FPJSON) -> [Date] {
    data["items"].array.prefix(3).flatMap { item -> [Date] in
      if item["allDay"].bool { return [] }
      return [item["start"].date, item["end"].date].compactMap { $0 }
    }.sorted()
  }

  static func of(kind: String, data: FPJSON, at now: Date) -> TimelineEntryRelevance? {
    switch kind {
    case "event", "calendar":
      // The next timed appointment: most relevant from 30 minutes before it
      // until it ends.
      for item in data["items"].array where !item["allDay"].bool && item["type"].string != "task" {
        guard let start = item["start"].date else { continue }
        let end: Date = item["end"].date ?? start.addingTimeInterval(1800)
        if end < now { continue }
        let until = start.timeIntervalSince(now)
        if until <= 1800 { return TimelineEntryRelevance(score: 90, duration: max(60, end.timeIntervalSince(now))) }
        if until <= 3 * 3600 { return TimelineEntryRelevance(score: 40, duration: until - 1800) }
        return TimelineEntryRelevance(score: 5, duration: min(until - 1800, 4 * 3600))
      }
      return TimelineEntryRelevance(score: 0)
    case "study":
      let due: Int = data["due"].int ?? 0
      return TimelineEntryRelevance(score: due > 0 ? Float(min(60, 20 + due)) : 0)
    case "deadline":
      if data["done"].bool { return TimelineEntryRelevance(score: 0) }
      if data["overdue"].bool { return TimelineEntryRelevance(score: 70) }
      guard let due = FPDeadline.dueDate(data) else { return nil }
      let left = due.timeIntervalSince(now)
      return TimelineEntryRelevance(score: left < 86_400 ? 80 : left < 3 * 86_400 ? 30 : 5)
    case "tasks":
      let overdue: Bool = data["items"].array.contains { FPFormat.due($0["due"].string).late }
      return TimelineEntryRelevance(score: overdue ? 30 : 10)
    default:
      return nil
    }
  }
}

/// When a deadline is due: a day at its end (on the phone), a time as it is.
enum FPDeadline {
  static func dueDate(_ data: FPJSON) -> Date? {
    guard let text = data["due"].string else { return nil }
    if data["allDay"].bool || text.count == 10 {
      guard let day = FPFormat.day(text) else { return nil }
      return Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: day)
    }
    return data["due"].date
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
  private static func later(_ seconds: TimeInterval) -> String {
    ISO8601DateFormatter().string(from: Date().addingTimeInterval(seconds))
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
    case "study":
      return ["title": L("Cards due"), "due": 12, "new": 5, "streak": 4, "url": "/#study", "more": 0, "decks": [
        ["pageId": "sample", "title": L("Spanish A1"), "due": 8, "new": 3, "url": "/"],
        ["pageId": "sample", "title": L("Anatomy"), "due": 4, "new": 2, "url": "/"],
      ]]
    case "event":
      return ["title": L("Next appointment"), "total": 2, "items": [
        ["id": "1", "title": L("Client meeting Miller"), "start": later(25 * 60), "end": later(85 * 60), "allDay": false, "location": "Zoom", "joinUrl": "https://zoom.us/j/0000000000", "calendarName": L("Sales"), "url": "/"],
        ["id": "2", "title": L("Retro"), "start": later(4 * 3600), "end": later(5 * 3600), "allDay": false, "calendarName": L("Team"), "url": "/"],
      ]]
    case "reading":
      return ["title": L("Continue reading"), "source": "recent", "items": [
        ["id": "1", "title": L("Handbook for new colleagues"), "icon": "", "kind": "book", "progress": 0.4, "lastOpened": later(-3600), "url": "/"],
        ["id": "2", "title": L("Weekly plan"), "icon": "", "kind": "document", "lastOpened": later(-5 * 3600), "url": "/"],
        ["id": "3", "title": "Roadmap", "icon": "", "kind": "database", "lastOpened": later(-26 * 3600), "url": "/"],
      ]]
    case "metric":
      return ["title": L("Revenue"), "label": L("This month"), "value": 48200, "formatted": "48,200 €", "series": [31, 33, 32, 35, 36, 38, 37, 40, 41, 43, 44, 46, 47, 48.2], "delta": 3.4, "url": "/"]
    case "deadline":
      return ["title": L("Offer to Miller"), "page": L("Sales"), "due": later(2 * 86_400 + 3 * 3600), "allDay": false, "done": false, "overdue": false, "url": "/"]
    default:
      return [:]
    }
  }
}
