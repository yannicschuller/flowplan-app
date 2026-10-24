import AppIntents
import Foundation

// App Shortcuts and Siri (German, English, French phrases in
// AppShortcuts.strings, written by plugins/with-widget-suite.js), also for
// the Action button and Spotlight. They use the session the app keeps for
// its widgets (WidgetShared.swift): a note is saved without opening the app,
// "What's on today?" answers right away; voice memos and focus open the app.

/// Hands a link to the app (FlowplanNative passes it to the JavaScript side,
/// which opens the capture screen or starts focus).
enum FPAppLink {
  static func open(_ link: String) {
    guard link.hasPrefix("flowplan://") else { return }
    FPShared.defaults?.set(link, forKey: "flowplan.pendingLink")
    FPShared.defaults?.set(Date().timeIntervalSince1970, forKey: "flowplan.pendingLinkAt")
    NotificationCenter.default.post(name: Notification.Name("FlowplanAppLink"), object: nil)
  }
}

enum FPIntentError: Error, CustomLocalizedStringResourceConvertible {
  case signedOut
  case failed(String)

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .signedOut: return "Open Flowplan to sign in"
    case .failed(let message): return "\(message)"
    }
  }

  static func from(_ error: Error) -> FPIntentError {
    switch error {
    case FPError.signedOut, FPError.noSession: return .signedOut
    case FPError.http(_, let message) where !message.isEmpty: return .failed(message)
    default: return .failed(L("Can’t be reached right now"))
    }
  }
}

struct FPAddNoteIntent: AppIntent {
  static var title: LocalizedStringResource = "Add a note"
  static var description = IntentDescription("Saves a note to your Flowplan capture inbox.")

  @Parameter(title: "Note", requestValueDialog: "What should the note say?")
  var text: String

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    do {
      // The capture target the person chose in Flowplan (or the first one).
      let capture = try await FPWidgets.fresh("capture")
      guard let target = capture["target"]["id"].string else { throw FPIntentError.failed(L("Nowhere to capture to. Create a database in Flowplan.")) }
      let lines = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
      let title = String((lines.first ?? "").prefix(300)).trimmingCharacters(in: .whitespaces)
      var fields: [String: Any] = ["targetId": target, "title": title.isEmpty ? String(text.prefix(300)) : title]
      if lines.count > 1 { fields["text"] = String(lines[1]) }
      try await FPWidgets.act("capture.note", fields)
      return .result(dialog: "Saved to \(capture["target"]["name"].text)")
    } catch let error as FPIntentError {
      throw error
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPTodayIntent: AppIntent {
  static var title: LocalizedStringResource = "What's on today?"
  static var description = IntentDescription("Today's appointments and tasks due.")

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    do {
      let calendar = try await FPWidgets.fresh("calendar", ["range": "today", "tasks": true, "max": 10])
      let items = calendar["items"].array
      if items.isEmpty { return .result(dialog: "Nothing scheduled") }
      let time = DateFormatter()
      time.timeStyle = .short
      time.dateStyle = .none
      let lines = items.prefix(5).map { item -> String in
        if item["timed"].bool, let start = item["start"].date { return "\(time.string(from: start)) \(item["title"].text)" }
        return item["title"].text
      }
      let more = items.count > 5 ? "\n…" : ""
      return .result(dialog: "\(lines.joined(separator: "\n"))\(more)")
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPStartTimerShortcut: AppIntent {
  static var title: LocalizedStringResource = "Start timer"
  static var description = IntentDescription("Starts your most recent timer again.")

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    do {
      let time = try await FPWidgets.fresh("time")
      guard let recent = time["recent"].array.first,
            let pageId = recent["pageId"].string, let rowId = recent["rowId"].string, let fieldId = recent["fieldId"].string else {
        return .result(dialog: "Start a timer in Flowplan")
      }
      try await FPWidgets.act("timer.start", ["pageId": pageId, "rowId": rowId, "fieldId": fieldId])
      return .result(dialog: "Timer started: \(recent["title"].string ?? recent["database"].text)")
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPStopTimerShortcut: AppIntent {
  static var title: LocalizedStringResource = "Stop timer"
  static var description = IntentDescription("Stops the running timer.")

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    do {
      try await FPWidgets.act("timer.stop")
      return .result(dialog: "Timer stopped")
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPVoiceMemoIntent: AppIntent {
  static var title: LocalizedStringResource = "Record a voice memo"
  static var description = IntentDescription("Opens Flowplan and starts recording.")
  static var openAppWhenRun = true

  init() {}

  @MainActor
  func perform() async throws -> some IntentResult {
    FPAppLink.open("flowplan://capture?mode=voice&record=1")
    return .result()
  }
}

struct FPStartFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "Start focus"
  static var description = IntentDescription("25 minutes of focus, then a break.")
  static var openAppWhenRun = true

  @Parameter(title: "Minutes", default: 25, inclusiveRange: (5, 180))
  var minutes: Int

  init() {}

  @MainActor
  func perform() async throws -> some IntentResult {
    FPAppLink.open("flowplan://do?action=focus.start&minutes=\(minutes)")
    return .result()
  }
}

struct FlowplanShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: FPAddNoteIntent(),
      phrases: ["Add a note to \(.applicationName)", "New \(.applicationName) note"],
      shortTitle: "Add a note",
      systemImageName: "square.and.pencil"
    )
    AppShortcut(
      intent: FPTodayIntent(),
      phrases: ["What's on today in \(.applicationName)", "What's on today with \(.applicationName)"],
      shortTitle: "What's on today?",
      systemImageName: "calendar"
    )
    AppShortcut(
      intent: FPStartTimerShortcut(),
      phrases: ["Start the timer in \(.applicationName)", "Start a \(.applicationName) timer"],
      shortTitle: "Start timer",
      systemImageName: "timer"
    )
    AppShortcut(
      intent: FPStopTimerShortcut(),
      phrases: ["Stop the timer in \(.applicationName)"],
      shortTitle: "Stop timer",
      systemImageName: "stop.circle"
    )
    AppShortcut(
      intent: FPVoiceMemoIntent(),
      phrases: ["Record a voice memo in \(.applicationName)"],
      shortTitle: "Voice memo",
      systemImageName: "mic"
    )
    AppShortcut(
      intent: FPStartFocusIntent(),
      phrases: ["Start focus in \(.applicationName)"],
      shortTitle: "Start focus",
      systemImageName: "scope"
    )
    // plugins/intents (its phrases: plugins/intents/strings.js). An app has
    // at most 10 App Shortcuts – this is the tenth.
    AppShortcut(
      intent: FPAddTaskIntent(),
      phrases: ["Add a task to \(.applicationName)", "New \(.applicationName) task"],
      shortTitle: "Add a task",
      systemImageName: "checklist"
    )
    AppShortcut(
      intent: FPDueTodayIntent(),
      phrases: ["What's due today in \(.applicationName)", "My \(.applicationName) tasks for today"],
      shortTitle: "What's due today?",
      systemImageName: "checkmark.circle"
    )
    AppShortcut(
      intent: FPOpenPageIntent(),
      phrases: ["Open a page in \(.applicationName)"],
      shortTitle: "Open a page",
      systemImageName: "doc.text"
    )
    AppShortcut(
      intent: FPSearchIntent(),
      phrases: ["Search \(.applicationName)", "Search in \(.applicationName)"],
      shortTitle: "Search Flowplan",
      systemImageName: "magnifyingglass"
    )
  }
}

/// Siri suggestions: the app tells which shortcut the person just used in
/// the app (FlowplanNative → donateShortcut).
@objc(FlowplanIntentDonor)
final class FlowplanIntentDonor: NSObject {
  @objc func donate(_ name: String) {
    Task {
      switch name {
      case "today": _ = try? await IntentDonationManager.shared.donate(intent: FPTodayIntent())
      case "timer": _ = try? await IntentDonationManager.shared.donate(intent: FPStartTimerShortcut())
      case "voice": _ = try? await IntentDonationManager.shared.donate(intent: FPVoiceMemoIntent())
      case "focus": _ = try? await IntentDonationManager.shared.donate(intent: FPStartFocusIntent())
      case "note": _ = try? await IntentDonationManager.shared.donate(intent: FPAddNoteIntent())
      default: break
      }
    }
  }
}

/// A text in the person's language (Localizable.strings of the app).
func L(_ key: String) -> String {
  NSLocalizedString(key, comment: "")
}
