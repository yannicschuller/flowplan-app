import AppIntents
import Charts
import SwiftUI
import WidgetKit

// How the configurable widgets look: one thing per widget, small sizes show
// less. Brand colour only as an accent (header, the one big number); in the
// tinted and clear home screens (iOS 18) the accents follow the tint
// (widgetAccentable). Buttons run in the extension (iOS 17); links open the
// page in the app (flowplan://open?path=…).

enum FPStyle {
  static let brand = Color(red: 0.255, green: 0.275, blue: 0.902)
  static let brandOnDark = Color(red: 0.561, green: 0.576, blue: 1)
  static let late = Color(red: 0.82, green: 0.26, blue: 0.26)
  static let background = Color(UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0.086, green: 0.082, blue: 0.106, alpha: 1)
      : UIColor(red: 0.988, green: 0.984, blue: 0.973, alpha: 1)
  })
  static func accent(_ scheme: ColorScheme) -> Color { scheme == .dark ? brandOnDark : brand }
}

enum FPLink {
  private static let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

  /// A path of the instance; anything else opens the start page.
  static func page(_ path: String?) -> URL {
    var safe = "/"
    if let path, path.hasPrefix("/"), !path.hasPrefix("//"), path.rangeOfCharacter(from: .whitespacesAndNewlines) == nil, !path.contains("\\") {
      safe = path
    }
    let encoded = safe.addingPercentEncoding(withAllowedCharacters: allowed) ?? "%2F"
    return URL(string: "flowplan://open?path=\(encoded)") ?? URL(string: "flowplan://open?path=%2F")!
  }

  static func capture(_ mode: String, target: String?) -> URL {
    var link = "flowplan://capture?mode=\(mode)"
    if let target, target.range(of: "^[0-9a-fA-F-]{36}$", options: .regularExpression) != nil { link += "&target=\(target)" }
    return URL(string: link)!
  }
}

enum FPFormat {
  private static let dayFormat: DateFormatter = {
    let format = DateFormatter()
    format.calendar = Calendar(identifier: .gregorian)
    format.locale = Locale(identifier: "en_US_POSIX")
    format.timeZone = .current
    format.dateFormat = "yyyy-MM-dd"
    return format
  }()

  static func day(_ text: String?) -> Date? {
    text.flatMap { dayFormat.date(from: String($0.prefix(10))) }
  }

  /// "Today", "Tomorrow", "Yesterday" or "21 Oct"; late: before today.
  static func due(_ text: String?) -> (label: String, late: Bool) {
    guard let date = day(text) else { return ("", false) }
    let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: date).day ?? 0
    switch days {
    case 0: return (L("Today"), false)
    case 1: return (L("Tomorrow"), false)
    case -1: return (L("Yesterday"), true)
    default: return (date.formatted(.dateTime.day().month(.abbreviated)), days < 0)
    }
  }

  static func weekday(_ text: String?) -> String {
    guard let date = day(text) else { return "" }
    if Calendar.current.isDateInToday(date) { return L("Today") }
    if Calendar.current.isDateInTomorrow(date) { return L("Tomorrow") }
    return date.formatted(.dateTime.weekday(.wide))
  }

  static func hours(_ value: Double?) -> String {
    let minutes = max(0, Int(((value ?? 0) * 60).rounded()))
    return String(format: "%d:%02d h", minutes / 60, minutes % 60)
  }

  static func ago(_ value: FPJSON) -> String {
    value.date.map { $0.formatted(.relative(presentation: .named)) } ?? ""
  }

  static func count(_ key: String, _ count: Int) -> String {
    String(format: L(key), count)
  }
}

/// What a kind is called and its symbol (closed states, the gallery).
enum FPKind {
  static func icon(_ kind: String) -> String {
    switch kind {
    case "capture": return "square.and.pencil"
    case "tasks": return "checklist"
    case "calendar": return "calendar"
    case "pinned": return "star"
    case "counter": return "number"
    case "journal": return "book.closed"
    case "time": return "timer"
    case "mentions": return "at"
    case "forms": return "tray.and.arrow.down"
    default: return "square.grid.2x2"
    }
  }

  static func title(_ kind: String) -> String {
    switch kind {
    case "capture": return L("Quick capture")
    case "tasks": return L("Tasks")
    case "calendar": return L("Today")
    case "pinned": return L("Page and favorites")
    case "counter": return L("Database counter")
    case "journal": return L("Journal and habits")
    case "time": return L("Time this week")
    case "mentions": return L("Mentions")
    case "forms": return L("Form responses")
    default: return "Flowplan"
    }
  }
}

extension WidgetFamily {
  var isAccessory: Bool { self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline }
}

// MARK: - Building blocks

@available(iOS 17.0, *)
struct FPHeader: View {
  let icon: String
  let title: String
  var trailing = ""
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: icon)
        .font(.caption.weight(.semibold))
        .foregroundStyle(FPStyle.accent(scheme))
        .widgetAccentable()
        .accessibilityHidden(true)
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(FPStyle.accent(scheme))
        .lineLimit(1)
        .widgetAccentable()
      Spacer(minLength: 4)
      if !trailing.isEmpty {
        Text(trailing)
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// No content: signed out, not set up, gone, offline, locked, encrypted.
@available(iOS 17.0, *)
struct FPClosedView: View {
  let kind: String
  let icon: String
  let title: String
  let message: String
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Label(message, systemImage: icon)
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: icon).font(.title3)
      }
      .accessibilityLabel(message)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Label(title, systemImage: FPKind.icon(kind)).font(.caption).lineLimit(1)
        Text(message).font(.headline).lineLimit(2).minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      VStack(alignment: .leading, spacing: 6) {
        FPHeader(icon: FPKind.icon(kind), title: title)
        Spacer(minLength: 0)
        Image(systemName: icon)
          .font(.title2)
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
        Text(message)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(.secondary)
          .lineLimit(3)
          .minimumScaleFactor(0.8)
      }
    }
  }
}

/// The big number of a widget.
@available(iOS 17.0, *)
struct FPBigNumber: View {
  let value: String
  var size: CGFloat = 40
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Text(value)
      .font(.system(size: size, weight: .bold, design: .rounded))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .foregroundStyle(.primary)
      .widgetAccentable()
      .contentTransition(.numericText())
  }
}

// MARK: - The widget

@available(iOS 17.0, *)
struct FPSuiteView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  private var link: URL {
    switch entry.state {
    case .signedOut, .offline, .gone, .setup: return FPLink.page("/")
    default:
      if entry.kind == "capture" {
        return FPLink.capture(entry.settings.buttons.first ?? "note", target: entry.data["target"]["id"].string)
      }
      if entry.kind == "mentions" { return FPLink.page("/#inbox") }
      if entry.kind == "tasks" && entry.data["url"].isNull { return FPLink.page("/#tasks") }
      if entry.kind == "journal" {
        let journal = entry.data["journal"]
        return FPLink.page(journal["today"].string ?? journal["url"].string ?? entry.data["habits"]["url"].string)
      }
      return FPLink.page(entry.data["url"].string ?? "/#home")
    }
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .containerBackground(for: .widget) {
        family.isAccessory ? Color.clear : FPStyle.background
      }
      .widgetURL(link)
  }

  @ViewBuilder private var content: some View {
    switch entry.state {
    case .signedOut:
      FPClosedView(kind: entry.kind, icon: "person.crop.circle.badge.exclamationmark", title: FPKind.title(entry.kind), message: L("Open Flowplan to sign in"))
    case .setup:
      FPClosedView(kind: entry.kind, icon: "slider.horizontal.3", title: FPKind.title(entry.kind), message: L("Edit the widget and choose a page"))
    case .gone:
      FPClosedView(kind: entry.kind, icon: "exclamationmark.triangle", title: FPKind.title(entry.kind), message: L("No longer available – edit the widget"))
    case .offline:
      FPClosedView(kind: entry.kind, icon: "wifi.slash", title: FPKind.title(entry.kind), message: L("Can’t be reached right now"))
    case .data, .sample:
      if entry.locked {
        FPClosedView(kind: entry.kind, icon: "lock.fill", title: entry.data["title"].string ?? FPKind.title(entry.kind), message: L("Protected by the journal PIN – unlock it in Flowplan"))
      } else if entry.encrypted {
        FPClosedView(kind: entry.kind, icon: "lock.shield", title: FPKind.title(entry.kind), message: L("End-to-end encrypted – readable in Flowplan only"))
      } else {
        switch entry.kind {
        case "capture": FPCaptureView(entry: entry)
        case "tasks": FPTasksView(entry: entry)
        case "calendar": FPCalendarView(entry: entry)
        case "pinned": FPPinnedView(entry: entry)
        case "counter": FPCounterView(entry: entry)
        case "journal": FPJournalView(entry: entry)
        case "time": FPTimeView(entry: entry)
        case "mentions": FPMentionsView(entry: entry)
        case "forms": FPFormsView(entry: entry)
        default: EmptyView()
        }
      }
    }
  }
}

// MARK: - 1. Quick capture

@available(iOS 17.0, *)
struct FPCaptureView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  private var buttons: [String] {
    entry.settings.buttons.filter { $0 != "voice" || entry.data["voice"].raw == nil || entry.data["voice"].bool }
  }
  private var target: String? { entry.data["target"]["id"].string }

  static func icon(_ button: String) -> String {
    switch button {
    case "task": return "checkmark.circle"
    case "voice": return "mic.fill"
    case "photo": return "camera.fill"
    default: return "square.and.pencil"
    }
  }
  static func label(_ button: String) -> String {
    switch button {
    case "task": return L("Task")
    case "voice": return L("Voice memo")
    case "photo": return L("Photo")
    default: return L("Note")
    }
  }

  var body: some View {
    let first = buttons.first ?? "note"
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: Self.icon(first)).font(.title2)
      }
      .accessibilityLabel(Self.label(first))
    case .systemSmall:
      // Small widgets open one link: the first button.
      VStack(alignment: .leading, spacing: 6) {
        FPHeader(icon: "square.and.pencil", title: L("Quick capture"))
        Spacer(minLength: 0)
        Image(systemName: Self.icon(first))
          .font(.system(size: 30, weight: .semibold))
          .foregroundStyle(FPStyle.accent(scheme))
          .widgetAccentable()
        Text(Self.label(first)).font(.headline).lineLimit(1)
        Text(entry.data["target"]["name"].text).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      .accessibilityElement(children: .combine)
    default:
      VStack(alignment: .leading, spacing: 8) {
        FPHeader(icon: "square.and.pencil", title: L("Quick capture"), trailing: entry.data["target"]["name"].text)
        Spacer(minLength: 0)
        HStack(spacing: 8) {
          ForEach(buttons, id: \.self) { button in
            Link(destination: FPLink.capture(button, target: target)) {
              VStack(spacing: 6) {
                Image(systemName: Self.icon(button))
                  .font(.title3.weight(.semibold))
                  .foregroundStyle(FPStyle.accent(scheme))
                  .widgetAccentable()
                Text(Self.label(button)).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8)
              }
              .frame(maxWidth: .infinity, minHeight: 64)
              .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .accessibilityLabel(Self.label(button))
          }
        }
      }
    }
  }
}

// MARK: - 2. Tasks (check off right here)

@available(iOS 17.0, *)
struct FPTaskRow: View {
  let item: FPJSON
  let compact: Bool

  var body: some View {
    let due = FPFormat.due(item["due"].string)
    HStack(spacing: 8) {
      if item["canEdit"].bool, let pageId = item["pageId"].string {
        Button(intent: FPCompleteTaskIntent(source: item["source"].string ?? "doc", pageId: pageId, rowId: item["rowId"].string, index: item["index"].int, text: item["text"].text)) {
          Image(systemName: "circle")
            .font(.body)
            .foregroundStyle(.secondary)
            .frame(width: 22, height: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(L("Mark as done")): \(item["text"].text)")
      } else {
        Image(systemName: "circle.dotted").font(.body).foregroundStyle(.tertiary).frame(width: 22, height: 22).accessibilityHidden(true)
      }
      Link(destination: FPLink.page(item["url"].string)) {
        HStack(spacing: 6) {
          VStack(alignment: .leading, spacing: 0) {
            Text(item["text"].text).font(.subheadline).lineLimit(1)
            if !compact, !item["page"].text.isEmpty {
              Text(item["page"].text).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
          Spacer(minLength: 2)
          if !compact, !due.label.isEmpty {
            Text(due.label)
              .font(.caption2.weight(.medium))
              .foregroundStyle(due.late ? FPStyle.late : .secondary)
              .lineLimit(1)
          }
        }
      }
      .accessibilityElement(children: .combine)
    }
    .invalidatableContent()
  }
}

@available(iOS 17.0, *)
struct FPTasksView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let items = entry.data["items"].array
    let total = entry.data["total"].int ?? items.count
    let headline = total == 0 ? L("All done") : FPFormat.count("%d open", total)
    switch family {
    case .accessoryInline:
      Text(items.first.map { "\(headline) · \($0["text"].text)" } ?? headline)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text(headline).font(.headline).lineLimit(1).widgetAccentable()
        ForEach(Array(items.prefix(2).enumerated()), id: \.offset) { _, item in
          Text(item["text"].text).font(.caption).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      let rows = min(entry.settings.max, family == .systemLarge ? 8 : family == .systemExtraLarge ? 8 : 3)
      VStack(alignment: .leading, spacing: family == .systemSmall ? 5 : 7) {
        FPHeader(icon: "checklist", title: entry.data["title"].string ?? L("Tasks"), trailing: total > 0 ? "\(total)" : "")
        if items.isEmpty {
          Spacer(minLength: 0)
          Label(L("All done"), systemImage: "checkmark.circle").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
          Spacer(minLength: 0)
        } else {
          ForEach(Array(items.prefix(rows).enumerated()), id: \.offset) { _, item in
            FPTaskRow(item: item, compact: family == .systemSmall)
          }
          Spacer(minLength: 0)
        }
      }
    }
  }
}

// MARK: - 3. Today / calendar

@available(iOS 17.0, *)
struct FPCalendarRow: View {
  let item: FPJSON
  let compact: Bool
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let task = item["type"].string == "task"
    Link(destination: FPLink.page(item["url"].string)) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Group {
          if task {
            Image(systemName: "checklist")
          } else if item["timed"].bool, let start = item["start"].date {
            Text(start, style: .time)
          } else {
            Text(L("All day"))
          }
        }
        .font(.caption.weight(.medium))
        .monospacedDigit()
        .foregroundStyle(.secondary)
        .frame(width: compact ? 40 : 48, alignment: .leading)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        RoundedRectangle(cornerRadius: 1.5)
          .fill(task ? Color.secondary : FPStyle.accent(scheme))
          .frame(width: 3, height: 14)
          .widgetAccentable()
        VStack(alignment: .leading, spacing: 0) {
          Text(item["title"].text).font(.subheadline).lineLimit(1)
          if !compact, !item["calendar"].text.isEmpty {
            Text(item["calendar"].text).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

@available(iOS 17.0, *)
struct FPCalendarView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let items = entry.data["items"].array
    let next = items.first { item in (item["end"].date ?? item["start"].date ?? .distantFuture) >= Date() || !item["timed"].bool } ?? items.first
    switch family {
    case .accessoryInline:
      if let next, next["timed"].bool, let start = next["start"].date {
        Text("\(start, style: .time) \(next["title"].text)")
      } else {
        Text(next?["title"].text ?? L("Nothing scheduled"))
      }
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        if let next {
          if next["timed"].bool, let start = next["start"].date {
            Text(start, style: .time).font(.caption).monospacedDigit()
          } else {
            Text(L("All day")).font(.caption)
          }
          Text(next["title"].text).font(.headline).lineLimit(2).widgetAccentable()
        } else {
          Label(L("Nothing scheduled"), systemImage: "calendar").font(.headline)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      let rows = family == .systemSmall ? 3 : family == .systemMedium ? 3 : 8
      let shown = Array(items.prefix(rows))
      VStack(alignment: .leading, spacing: 6) {
        FPHeader(icon: "calendar", title: entry.data["title"].string ?? L("Today"), trailing: family == .systemSmall ? "" : Date().formatted(.dateTime.weekday(.abbreviated).day()))
        if shown.isEmpty {
          Spacer(minLength: 0)
          Label(L("Nothing scheduled"), systemImage: "calendar").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
        ForEach(Array(shown.enumerated()), id: \.offset) { index, item in
          // Several days: the day above its first entry.
          if family == .systemLarge, index == 0 || shown[index - 1]["day"].text != item["day"].text, items.contains(where: { $0["day"].text != items[0]["day"].text }) {
            Text(FPFormat.weekday(item["day"].string)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).textCase(.uppercase)
          }
          FPCalendarRow(item: item, compact: family == .systemSmall)
        }
        Spacer(minLength: 0)
      }
    }
  }
}

// MARK: - 4. Page or favorites

@available(iOS 17.0, *)
struct FPPinnedView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  static func icon(_ kind: String) -> String {
    switch kind {
    case "database": return "tablecells"
    case "record": return "rectangle.portrait.on.rectangle.portrait"
    case "whiteboard": return "scribble.variable"
    case "journal": return "book.closed"
    case "form": return "list.bullet.rectangle"
    default: return "doc.text"
    }
  }

  var body: some View {
    let items = entry.data["items"].array
    let rows = family == .systemSmall ? 4 : family == .systemMedium ? 3 : 8
    VStack(alignment: .leading, spacing: 7) {
      FPHeader(icon: entry.data["properties"].isNull ? "star" : "tablecells", title: entry.data["title"].string ?? L("Favorites"))
      if items.isEmpty {
        Spacer(minLength: 0)
        Text(L("Nothing here yet")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
      }
      ForEach(Array(items.prefix(rows).enumerated()), id: \.offset) { _, item in
        let closed = item["locked"].bool || item["encrypted"].bool
        let values = item["values"].array.compactMap(\.string).filter { !$0.isEmpty }.prefix(2).joined(separator: " · ")
        let detail = values.isEmpty ? item["detail"].text : values
        Link(destination: FPLink.page(item["url"].string)) {
          HStack(spacing: 8) {
            Image(systemName: closed ? "lock.fill" : Self.icon(item["kind"].text))
              .font(.caption)
              .foregroundStyle(.secondary)
              .frame(width: 16)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
              Text(closed ? L(item["locked"].bool ? "Locked" : "Encrypted") : item["title"].text).font(.subheadline).lineLimit(1)
              if family != .systemSmall, !closed, !detail.isEmpty {
                Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
              }
            }
          }
        }
        .accessibilityElement(children: .combine)
      }
      Spacer(minLength: 0)
    }
  }
}

// MARK: - 5. Database counter

@available(iOS 17.0, *)
struct FPSparkline: View {
  let history: [FPJSON]
  @Environment(\.colorScheme) private var scheme

  private struct Point: Identifiable {
    let id: Int
    let value: Double
    let series: String
  }

  var body: some View {
    // Estimated days (before the first refresh) drawn lighter and dashed;
    // the measured line starts where they end.
    let lastEstimated = history.lastIndex { $0["estimated"].bool } ?? -1
    let points: [Point] = history.enumerated().flatMap { index, day -> [Point] in
      let value = day["value"].double ?? 0
      if index <= lastEstimated { return [Point(id: index, value: value, series: "estimated")] }
      if index == lastEstimated + 1, lastEstimated >= 0 {
        return [Point(id: index, value: value, series: "estimated"), Point(id: index + 100, value: value, series: "measured")]
      }
      return [Point(id: index, value: value, series: "measured")]
    }
    Chart(points) { point in
      LineMark(x: .value("Day", point.id % 100), y: .value("Value", point.value), series: .value("Series", point.series))
        .foregroundStyle(FPStyle.accent(scheme).opacity(point.series == "estimated" ? 0.35 : 1))
        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, dash: point.series == "estimated" ? [3, 3] : []))
        .interpolationMethod(.monotone)
    }
    .chartXAxis(.hidden)
    .chartYAxis(.hidden)
    .chartLegend(.hidden)
    .chartYScale(domain: .automatic(includesZero: false))
    .widgetAccentable()
    .accessibilityHidden(true)
  }
}

@available(iOS 17.0, *)
struct FPCounterView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let value = entry.data["formatted"].string ?? "–"
    let label = [entry.data["label"].text, entry.data["group"].text].filter { !$0.isEmpty }.joined(separator: " · ")
    let history = entry.data["history"].array
    let estimated = history.contains { $0["estimated"].bool }
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Text(value).font(.system(size: 20, weight: .bold, design: .rounded)).minimumScaleFactor(0.4).lineLimit(1).padding(4)
      }
      .accessibilityLabel("\(entry.data["title"].text): \(value)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        Text(entry.data["title"].text).font(.caption).lineLimit(1)
        Text(value).font(.title2.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).widgetAccentable()
        Text(label).font(.caption2).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 2) {
        FPHeader(icon: "number", title: entry.data["title"].text)
        Spacer(minLength: 0)
        FPBigNumber(value: value)
        Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
      .accessibilityElement(children: .combine)
    default:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "number", title: entry.data["title"].text, trailing: entry.data["view"].text)
        HStack(alignment: .bottom, spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            FPBigNumber(value: value, size: family == .systemLarge ? 52 : 40)
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
          }
          .accessibilityElement(children: .combine)
          if family == .systemMedium, history.count > 1 {
            FPSparkline(history: history).frame(maxWidth: .infinity, maxHeight: 56)
          }
        }
        if family != .systemMedium, history.count > 1 {
          FPSparkline(history: history).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        if estimated, family != .systemSmall {
          Text(L("History partly estimated")).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
        }
        Spacer(minLength: 0)
      }
    }
  }
}

// MARK: - 6. Journal and habits

@available(iOS 17.0, *)
struct FPHabitRow: View {
  let habits: FPJSON
  let item: FPJSON
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let done = item["done"].bool
    let label = HStack(spacing: 6) {
      Image(systemName: done ? "checkmark.circle.fill" : "circle")
        .font(.body)
        .foregroundStyle(done ? AnyShapeStyle(FPStyle.accent(scheme)) : AnyShapeStyle(.secondary))
        .widgetAccentable()
      Text(item["name"].text).font(.subheadline).lineLimit(1)
      Spacer(minLength: 0)
    }
    if habits["canWrite"].bool, let pageId = habits["id"].string, let fieldId = item["fieldId"].string {
      Button(intent: FPCheckHabitIntent(pageId: pageId, fieldId: fieldId, done: !done)) { label }
        .buttonStyle(.plain)
        .accessibilityLabel(item["name"].text)
        .accessibilityValue(done ? L("Done") : L("Open"))
        .invalidatableContent()
    } else {
      label
    }
  }
}

@available(iOS 17.0, *)
struct FPJournalView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  private var journalLine: String {
    let journal = entry.data["journal"]
    if journal["locked"].bool { return L("Locked") }
    let streak = journal["streak"].int ?? 0
    if journal["written"].bool { return streak > 1 ? FPFormat.count("%d-day streak", streak) : L("Written today") }
    return L("Write today")
  }

  @ViewBuilder private var journal: some View {
    let journal = entry.data["journal"]
    let name = journal["encrypted"].bool ? L("Journal") : journal["name"].text
    Link(destination: FPLink.page(journal["today"].string ?? journal["url"].string)) {
      VStack(alignment: .leading, spacing: 4) {
        Image(systemName: journal["locked"].bool ? "lock.fill" : journal["written"].bool ? "checkmark.seal.fill" : "square.and.pencil")
          .font(.title2)
          .foregroundStyle(FPStyle.accent(scheme))
          .widgetAccentable()
          .accessibilityHidden(true)
        Text(name).font(.headline).lineLimit(1)
        Text(journalLine).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
    }
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private func habits(_ rows: Int) -> some View {
    let habits = entry.data["habits"]
    let closed = habits["locked"].bool || habits["encrypted"].bool
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(closed ? L("Habits") : habits["name"].text).font(.caption.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
        Spacer(minLength: 4)
        if !closed {
          Text("\(habits["done"].int ?? 0)/\(habits["total"].int ?? 0)").font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary)
        }
      }
      if closed {
        Label(L(habits["locked"].bool ? "Locked" : "Encrypted"), systemImage: "lock.fill").font(.caption).foregroundStyle(.secondary)
      } else {
        ForEach(Array(habits["items"].array.prefix(rows).enumerated()), id: \.offset) { _, item in
          FPHabitRow(habits: habits, item: item)
        }
      }
    }
  }

  var body: some View {
    let hasJournal = !entry.data["journal"].isNull
    let hasHabits = !entry.data["habits"].isNull
    switch family {
    case .systemSmall:
      VStack(alignment: .leading, spacing: 6) {
        FPHeader(icon: "book.closed", title: hasHabits ? L("Habits") : L("Journal"))
        if hasHabits {
          habits(3)
        } else if hasJournal {
          Spacer(minLength: 0)
          journal
        }
        Spacer(minLength: 0)
      }
    default:
      VStack(alignment: .leading, spacing: 8) {
        FPHeader(icon: "book.closed", title: entry.data["title"].string ?? L("Journal"))
        HStack(alignment: .top, spacing: 14) {
          if hasJournal { journal.frame(maxWidth: hasHabits ? 120 : .infinity, alignment: .leading) }
          if hasHabits { habits(family == .systemLarge ? 8 : 3) }
        }
        Spacer(minLength: 0)
      }
    }
  }
}

// MARK: - 7. Time this week

@available(iOS 17.0, *)
struct FPTimeView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  /// The timer "Start" starts: the chosen one, else the most recent.
  private var startTarget: (pageId: String, rowId: String, fieldId: String, title: String)? {
    let recent = entry.data["recent"].array
    if let chosen = entry.settings.timer, let pageId = chosen["pageId"], let rowId = chosen["rowId"], let fieldId = chosen["fieldId"] {
      let match = recent.first { $0["rowId"].string == rowId && $0["fieldId"].string == fieldId }
      return (pageId, rowId, fieldId, match?["title"].string ?? L("Timer"))
    }
    guard let first = recent.first, let pageId = first["pageId"].string, let rowId = first["rowId"].string, let fieldId = first["fieldId"].string else { return nil }
    return (pageId, rowId, fieldId, first["title"].string ?? first["database"].text)
  }

  @ViewBuilder private var timerRow: some View {
    let timer = entry.data["timer"]
    if let start = timer["start"].date {
      HStack(spacing: 8) {
        Link(destination: FPLink.page(timer["url"].string)) {
          VStack(alignment: .leading, spacing: 0) {
            Text(start, style: .timer)
              .font(.headline.weight(.semibold))
              .monospacedDigit()
              .foregroundStyle(FPStyle.accent(scheme))
              .widgetAccentable()
            Text(timer["title"].string ?? timer["database"].text).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
        Spacer(minLength: 4)
        Button(intent: FPStopTimerIntent()) {
          Image(systemName: "stop.fill").font(.caption.weight(.bold)).frame(width: 30, height: 30)
            .background(.fill.secondary, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L("Stop timer"))
      }
    } else if let target = startTarget {
      Button(intent: FPStartTimerIntent(pageId: target.pageId, rowId: target.rowId, fieldId: target.fieldId)) {
        HStack(spacing: 8) {
          Image(systemName: "play.fill").font(.caption.weight(.bold)).frame(width: 30, height: 30)
            .background(.fill.secondary, in: Circle())
          Text(target.title).font(.caption).lineLimit(1)
          Spacer(minLength: 0)
        }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("\(L("Start timer")): \(target.title)")
    } else {
      Text(L("Start a timer in Flowplan")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
    }
  }

  private var bars: some View {
    let days = entry.data["days"].array.prefix(7)
    let top = max(0.01, days.map { $0["hours"].double ?? 0 }.max() ?? 0)
    return HStack(alignment: .bottom, spacing: 5) {
      ForEach(Array(days.enumerated()), id: \.offset) { _, day in
        let today = FPFormat.day(day["day"].string).map(Calendar.current.isDateInToday) ?? false
        VStack(spacing: 3) {
          Capsule()
            .fill(today ? AnyShapeStyle(FPStyle.accent(scheme)) : AnyShapeStyle(.fill.secondary))
            .frame(height: max(3, 44 * CGFloat((day["hours"].double ?? 0) / top)))
            .widgetAccentable(today)
          Text(FPFormat.day(day["day"].string)?.formatted(.dateTime.weekday(.narrow)) ?? "")
            .font(.system(size: 9, weight: .medium))
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .bottom)
      }
    }
    .frame(height: 58, alignment: .bottom)
    .accessibilityHidden(true)
  }

  var body: some View {
    let week = FPFormat.hours(entry.data["week"].double)
    let today = FPFormat.hours(entry.data["today"].double)
    let timer = entry.data["timer"]
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: timer.isNull ? "clock" : "timer").font(.caption)
          Text(today.replacingOccurrences(of: " h", with: "")).font(.system(size: 13, weight: .semibold, design: .rounded)).minimumScaleFactor(0.6)
        }
      }
      .accessibilityLabel("\(L("Today")): \(today)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        if let start = timer["start"].date {
          Text(timer["title"].string ?? L("Timer")).font(.caption).lineLimit(1)
          Text(start, style: .timer).font(.title3.weight(.semibold)).monospacedDigit().widgetAccentable()
        } else {
          Text(L("This week")).font(.caption)
          Text(week).font(.title3.weight(.semibold)).monospacedDigit().widgetAccentable()
          Text("\(L("Today")) \(today)").font(.caption2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "timer", title: L("This week"))
        FPBigNumber(value: week, size: 30)
        Text("\(L("Today")) \(today)").font(.caption).foregroundStyle(.secondary)
        Spacer(minLength: 0)
        timerRow
      }
    default:
      VStack(alignment: .leading, spacing: 8) {
        FPHeader(icon: "timer", title: entry.data["title"].string ?? L("Time this week"))
        HStack(alignment: .bottom, spacing: 14) {
          VStack(alignment: .leading, spacing: 2) {
            FPBigNumber(value: week, size: 32)
            Text("\(L("Today")) \(today)").font(.caption).foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
          bars
        }
        Spacer(minLength: 0)
        timerRow
      }
    }
  }
}

// MARK: - 8. Mentions

@available(iOS 17.0, *)
struct FPMentionsView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let items = entry.data["items"].array
    let unread = (entry.data["unread"]["mentions"].int ?? 0) + (entry.data["unread"]["assignments"].int ?? 0)
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: "at").font(.caption)
          Text("\(unread)").font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit()
        }
      }
      .accessibilityLabel(FPFormat.count("%d unread", unread))
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text(unread > 0 ? FPFormat.count("%d unread", unread) : L("No new mentions")).font(.headline).widgetAccentable()
        if let first = items.first { Text(first["text"].text).font(.caption).lineLimit(2) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "at", title: entry.data["title"].string ?? L("Mentions"))
        Spacer(minLength: 0)
        FPBigNumber(value: "\(unread)")
        Text(items.first?["text"].text ?? L("No new mentions")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
      .accessibilityElement(children: .combine)
    default:
      let rows = family == .systemLarge ? 5 : 2
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          FPHeader(icon: "at", title: entry.data["title"].string ?? L("Mentions"), trailing: unread > 0 ? FPFormat.count("%d unread", unread) : "")
          if unread > 0 {
            Button(intent: FPMarkReadIntent(notificationId: nil)) {
              Image(systemName: "checkmark.circle").font(.caption.weight(.semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .accessibilityLabel(L("Mark all read"))
          }
        }
        if items.isEmpty {
          Spacer(minLength: 0)
          Label(L("No new mentions"), systemImage: "checkmark.circle").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
        ForEach(Array(items.prefix(rows).enumerated()), id: \.offset) { _, item in
          HStack(alignment: .top, spacing: 8) {
            Link(destination: FPLink.page(item["url"].string)) {
              VStack(alignment: .leading, spacing: 1) {
                Text(item["text"].text).font(.subheadline).lineLimit(2).fontWeight(item["read"].bool ? .regular : .medium)
                Text(FPFormat.ago(item["createdAt"])).font(.caption2).foregroundStyle(.secondary)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            if !item["read"].bool, let id = item["id"].string {
              Button(intent: FPMarkReadIntent(notificationId: id)) {
                Image(systemName: "envelope.open").font(.caption).frame(width: 26, height: 26)
                  .background(.fill.tertiary, in: Circle())
              }
              .buttonStyle(.plain)
              .accessibilityLabel(L("Mark as read"))
              .invalidatableContent()
            }
          }
        }
        Spacer(minLength: 0)
      }
    }
  }
}

// MARK: - 9. Form responses

@available(iOS 17.0, *)
struct FPFormsView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let items = entry.data["items"].array
    let fresh = entry.data["new"].int ?? 0
    let headline = fresh > 0 ? FPFormat.count("%d new", fresh) : L("No new responses")
    switch family {
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text(entry.data["title"].text).font(.caption).lineLimit(1)
        Text(headline).font(.headline).widgetAccentable()
        if let first = items.first { Text(first["title"].text).font(.caption2).lineLimit(1) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "tray.and.arrow.down", title: entry.data["title"].text)
        Spacer(minLength: 0)
        FPBigNumber(value: "\(fresh)")
        Text(fresh > 0 ? L("new") : L("No new responses")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        if let first = items.first { Text(first["title"].text).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
      }
      .accessibilityElement(children: .combine)
    default:
      VStack(alignment: .leading, spacing: 7) {
        FPHeader(icon: "tray.and.arrow.down", title: entry.data["title"].text, trailing: headline)
        if items.isEmpty {
          Spacer(minLength: 0)
          Text(L("No new responses")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
        ForEach(Array(items.prefix(family == .systemLarge ? 5 : 3).enumerated()), id: \.offset) { _, item in
          Link(destination: FPLink.page(item["url"].string)) {
            HStack(spacing: 8) {
              Circle()
                .fill(item["new"].bool ? AnyShapeStyle(FPStyle.accent(scheme)) : AnyShapeStyle(.clear))
                .frame(width: 6, height: 6)
                .widgetAccentable()
                .accessibilityHidden(true)
              Text(item["title"].text).font(.subheadline).lineLimit(1)
              Spacer(minLength: 4)
              Text(FPFormat.ago(item["createdAt"])).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
          .accessibilityElement(children: .combine)
        }
        Spacer(minLength: 0)
      }
    }
  }
}
