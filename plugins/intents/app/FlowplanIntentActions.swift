import AppIntents
import SwiftUI

// Siri and Shortcuts beyond the widget suite's (FlowplanAppIntents.swift,
// whose App Shortcuts provider lists these too): add a task with a due date
// to a list or database, what is due today (spoken, with a list), open a
// page, search. Writing goes through the widgets' actions
// (POST /api/mobile/widgets/action), reading through the intents API of the
// instance (FlowplanIntentEntities.swift).

struct FPAddTaskIntent: AppIntent {
  static var title: LocalizedStringResource = "Add a task"
  static var description = IntentDescription("Adds a task to a list or database in Flowplan.")

  @Parameter(title: "Task", requestValueDialog: "What's the task?")
  var text: String

  @Parameter(title: "Due")
  var due: Date?

  // Empty: the capture target the person chose in Flowplan.
  @Parameter(title: "List")
  var list: FPIntentList?

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let title = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
    if title.isEmpty { throw $text.needsValueError("What's the task?") }
    do {
      var targetId: String? = list?.id
      var name: String = list?.name ?? ""
      if targetId == nil {
        let capture = try await FPWidgets.fresh("capture")
        targetId = capture["target"]["id"].string
        name = capture["target"]["name"].text
      }
      guard let target = targetId else { throw FPIntentError.failed(L("Nowhere to capture to. Create a database in Flowplan.")) }
      var fields: [String: Any] = ["targetId": target, "title": title]
      if let due {
        fields["due"] = FPAPI.today(due)
      }
      try await FPWidgets.act("capture.task", fields)
      guard let due else { return .result(dialog: "Added to \(name)") }
      let day = DateFormatter()
      day.dateStyle = .medium
      day.timeStyle = .none
      day.doesRelativeDateFormatting = true
      return .result(dialog: "Added to \(name), due \(day.string(from: due))")
    } catch let error as FPIntentError {
      throw error
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

/// One task of "What's due today?".
struct FPDueTask: Identifiable, Sendable {
  let id: Int
  let text: String
  let page: String
  let overdue: Bool
}

struct FPDueTodayIntent: AppIntent {
  static var title: LocalizedStringResource = "What's due today?"
  static var description = IntentDescription("Your tasks due today and the overdue ones.")

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
    do {
      guard let session = FPKeychain.load() else { throw FPError.noSession }
      let today = FPRequest(kind: "tasks", config: ["source": "mine", "filter": "today", "max": 10])
      let overdue = FPRequest(kind: "tasks", config: ["source": "mine", "filter": "overdue", "max": 10])
      let results = try await FPAPI.data([today, overdue], session: session)
      guard let todayResult = results[today.key] else { throw FPError.network }
      guard todayResult.ok else { throw FPError.http(todayResult.status, todayResult.error) }
      let due: [FPJSON] = todayResult.data["items"].array
      let dueTotal: Int = todayResult.data["total"].int ?? due.count
      var late: [FPJSON] = []
      var lateTotal: Int = 0
      if let lateResult = results[overdue.key], lateResult.ok {
        late = lateResult.data["items"].array
        lateTotal = lateResult.data["total"].int ?? late.count
      }
      var tasks: [FPDueTask] = []
      for item in late + due {
        let isLate: Bool = tasks.count < late.count
        tasks.append(FPDueTask(id: tasks.count, text: item["text"].text, page: item["page"].text, overdue: isLate))
      }
      if tasks.isEmpty {
        return .result(dialog: "Nothing due today", view: FPDueTodayView(tasks: [], heading: L("Nothing due today")))
      }
      var counts: [String] = []
      if dueTotal > 0 { counts.append(String(format: L("%d due today"), dueTotal)) }
      if lateTotal > 0 { counts.append(String(format: L("%d overdue"), lateTotal)) }
      let heading: String = counts.joined(separator: " · ")
      // Spoken: the counts and the first three tasks.
      let first: String = tasks.prefix(3).map(\.text).joined(separator: ", ")
      let spoken: String = String(format: L("%@: %@"), counts.joined(separator: ", "), first)
      return .result(dialog: "\(spoken)", view: FPDueTodayView(tasks: Array(tasks.prefix(8)), heading: heading))
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPDueTodayView: View {
  let tasks: [FPDueTask]
  let heading: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(heading)
        .font(.headline)
      ForEach(tasks) { task in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Image(systemName: "circle")
            .foregroundStyle(task.overdue ? Color.red : Color.secondary)
          VStack(alignment: .leading, spacing: 2) {
            Text(task.text)
              .lineLimit(2)
            if !task.page.isEmpty {
              Text(task.page)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }
        }
      }
    }
    .padding()
  }
}

struct FPOpenPageIntent: AppIntent {
  static var title: LocalizedStringResource = "Open a page"
  static var description = IntentDescription("Opens a page or database in Flowplan.")
  static var openAppWhenRun = true

  @Parameter(title: "Page", requestValueDialog: "Which page?")
  var page: FPIntentPage

  init() {}
  init(page: FPIntentPage) {
    self.page = page
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    FPAppLink.open(FPIntentLinks.open(page.path))
    return .result()
  }
}

/// One hit of "Search Flowplan".
struct FPSearchHit: Identifiable, Sendable {
  let id: Int
  let title: String
  let place: String
  let snippet: String
}

struct FPSearchIntent: AppIntent {
  static var title: LocalizedStringResource = "Search Flowplan"
  static var description = IntentDescription("Searches your pages, records and comments.")

  @Parameter(title: "Search for", requestValueDialog: "What are you looking for?")
  var query: String

  init() {}

  func perform() async throws -> some IntentResult & ReturnsValue<[FPIntentPage]> & ProvidesDialog & ShowsSnippetView {
    let text = String(query.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    if text.isEmpty { throw $query.needsValueError("What are you looking for?") }
    do {
      let answer = try await FPIntentAPI.get("search", ["q": text])
      var pages: [FPIntentPage] = []
      var hits: [FPSearchHit] = []
      for result in answer["results"].array {
        guard let page = FPIntentPage(result: result) else { continue }
        pages.append(page)
        if hits.count < 8 {
          hits.append(FPSearchHit(id: hits.count, title: page.name, place: page.place, snippet: result["snippet"].text))
        }
      }
      if pages.isEmpty {
        return .result(value: pages, dialog: "Nothing found for “\(text)”", view: FPSearchView(hits: []))
      }
      let count = String(pages.count)
      return .result(value: pages, dialog: "\(count) results for “\(text)”", view: FPSearchView(hits: hits))
    } catch {
      throw FPIntentError.from(error)
    }
  }
}

struct FPSearchView: View {
  let hits: [FPSearchHit]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(hits) { hit in
        VStack(alignment: .leading, spacing: 2) {
          Text(hit.title)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
          if !hit.snippet.isEmpty {
            Text(hit.snippet)
              .font(.caption)
              .lineLimit(2)
          }
          Text(hit.place)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
    }
    .padding()
  }
}

/// The app's own search with this text (#search=… of the web app).
struct FPOpenSearchIntent: AppIntent {
  static var title: LocalizedStringResource = "Search in the app"
  static var description = IntentDescription("Opens Flowplan's search with this text.")
  static var openAppWhenRun = true

  @Parameter(title: "Search for", requestValueDialog: "What are you looking for?")
  var query: String

  init() {}

  @MainActor
  func perform() async throws -> some IntentResult {
    FPAppLink.open(FPIntentLinks.search(String(query.prefix(200))))
    return .result()
  }
}
