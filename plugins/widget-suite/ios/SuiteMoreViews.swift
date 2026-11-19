import Charts
import SwiftUI
import WidgetKit

// The widgets of 2026: next appointment, continue reading, a dashboard's key
// figure and a deadline's countdown (SuiteViews.swift has the building
// blocks). Countdowns are live Texts (style .relative): the system keeps
// them current between refreshes.

enum FPExternal {
  /// A video call's address from the instance ("Join"): https only, no
  /// credentials – the instance names known meeting hosts only.
  static func join(_ value: String?) -> URL? {
    guard let value, value.count <= 2000, let url = URL(string: value), url.scheme == "https",
          url.user == nil, url.password == nil, let host = url.host, host.contains(".") else { return nil }
    return url
  }
}

/// One appointment of an answer.
struct FPEvent {
  let title: String
  let start: Date
  let end: Date
  let allDay: Bool
  let location: String
  let calendar: String
  let join: URL?
  let url: String?

  static func list(_ data: FPJSON, showJoin: Bool = true) -> [FPEvent] {
    let now = Date()
    return data["items"].array.compactMap { item -> FPEvent? in
      let allDay: Bool = item["allDay"].bool
      let start: Date?
      let end: Date?
      if allDay {
        start = FPFormat.day(item["start"].string)
        let last: Date? = FPFormat.day(item["end"].string) ?? start
        end = last.flatMap { Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: $0) }
      } else {
        start = item["start"].date
        end = item["end"].date ?? start
      }
      guard let start, let end, end >= now.addingTimeInterval(-60) else { return nil }
      return FPEvent(
        title: item["title"].text,
        start: start,
        end: end,
        allDay: allDay,
        location: item["location"].text,
        calendar: item["calendarName"].text,
        join: showJoin ? FPExternal.join(item["joinUrl"].string) : nil,
        url: item["url"].string
      )
    }
  }

  var running: Bool { !allDay && start <= Date() && Date() < end }

  /// "14:00–15:00", "Tomorrow 09:30", "Fri 09:30", "All day".
  var when: String {
    let calendar = Calendar.current
    var prefix = ""
    if calendar.isDateInTomorrow(start) { prefix = L("Tomorrow") }
    else if !calendar.isDateInToday(start) { prefix = start.formatted(.dateTime.weekday(.abbreviated)) }
    if allDay { return prefix.isEmpty ? L("All day") : prefix + " · " + L("All day") }
    let time: String = calendar.isDate(start, inSameDayAs: end) && end > start
      ? start.formatted(date: .omitted, time: .shortened) + "–" + end.formatted(date: .omitted, time: .shortened)
      : start.formatted(date: .omitted, time: .shortened)
    return prefix.isEmpty ? time : prefix + " " + time
  }
}

/// "in 25 min" (live), "Now", or nothing for an all-day appointment.
@available(iOS 17.0, *)
struct FPCountdown: View {
  let event: FPEvent
  var font: Font = .caption.weight(.semibold)
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  var body: some View {
    if event.running {
      Text(L("Now")).font(font).foregroundStyle(palette.accent(scheme)).widgetAccentable()
    } else if !event.allDay {
      let key: LocalizedStringKey = "in \(Text(event.start, style: .relative))"
      Text(key).font(font).monospacedDigit().foregroundStyle(palette.accent(scheme)).widgetAccentable().lineLimit(1)
    }
  }
}

// MARK: - 11. Next appointment

@available(iOS 17.0, *)
struct FPEventView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  private func joinButton(_ url: URL, compact: Bool) -> some View {
    Link(destination: url) {
      Label(L("Join"), systemImage: "video.fill")
        .font((compact ? Font.caption : Font.subheadline).weight(.semibold))
        .lineLimit(1)
        .padding(.horizontal, compact ? 10 : 14)
        .frame(minHeight: compact ? 30 : 36)
        .foregroundStyle(Color.white)
        .background(palette.accent(scheme), in: Capsule())
        .widgetAccentable()
    }
    .accessibilityLabel(L("Join"))
  }

  var body: some View {
    let events = FPEvent.list(entry.data)
    let title = entry.data["title"].string ?? L("Next appointment")
    if let next = events.first {
      switch family {
      case .accessoryInline:
        Label(next.title, systemImage: "calendar.badge.clock")
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          FPCountdown(event: next, font: .caption)
          Text(next.title).font(.headline).lineLimit(1).widgetAccentable()
          Text(next.when).font(.caption2).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      case .systemSmall:
        VStack(alignment: .leading, spacing: 3) {
          FPHeader(icon: "calendar.badge.clock", title: title)
          Spacer(minLength: 0)
          FPCountdown(event: next, font: .title3.weight(.bold))
          Text(next.title).font(.headline).lineLimit(2).minimumScaleFactor(0.85)
          Text(next.when).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          if let join = next.join {
            joinButton(join, compact: true).padding(.top, 2)
          }
        }
      default:
        VStack(alignment: .leading, spacing: 6) {
          FPHeader(icon: "calendar.badge.clock", title: title)
          HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
              FPCountdown(event: next, font: .subheadline.weight(.bold))
              Link(destination: FPLink.page(next.url)) {
                Text(next.title).font(.headline).lineLimit(2)
              }
              Text([next.when, next.location.isEmpty ? next.calendar : next.location].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            Spacer(minLength: 4)
            if let join = next.join { joinButton(join, compact: false) }
          }
          if events.count > 1 {
            Divider().padding(.vertical, 2)
            ForEach(Array(events.dropFirst().prefix(family == .systemLarge ? 2 : 1).enumerated()), id: \.offset) { _, event in
              Link(destination: FPLink.page(event.url)) {
                HStack(spacing: 8) {
                  RoundedRectangle(cornerRadius: 2).fill(.secondary).frame(width: 3, height: 26).accessibilityHidden(true)
                  VStack(alignment: .leading, spacing: 0) {
                    Text(event.title).font(.subheadline).lineLimit(1)
                    Text(event.when).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                  }
                }
              }
              .accessibilityElement(children: .combine)
            }
          }
          Spacer(minLength: 0)
        }
      }
    } else {
      switch family {
      case .accessoryInline:
        Label(L("No appointments coming up"), systemImage: "calendar")
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          Text(title).font(.caption).lineLimit(1)
          Text(L("No appointments coming up")).font(.headline).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      default:
        VStack(alignment: .leading, spacing: 6) {
          FPHeader(icon: "calendar.badge.clock", title: title)
          Spacer(minLength: 0)
          Image(systemName: "calendar").font(.title2).foregroundStyle(.secondary).accessibilityHidden(true)
          Text(L("No appointments coming up")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary).lineLimit(2)
        }
      }
    }
  }
}

// MARK: - 12. Continue reading

@available(iOS 17.0, *)
struct FPReadingView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  static func icon(_ kind: String) -> String {
    switch kind {
    case "book": return "book.closed"
    case "database": return "tablecells"
    case "whiteboard": return "scribble.variable"
    case "journal": return "book"
    default: return "doc.text"
    }
  }

  private func row(_ item: FPJSON) -> some View {
    let closed: String = item["locked"].bool ? L("Locked") : item["encrypted"].bool ? L("Encrypted") : ""
    let progress: Double? = closed.isEmpty ? item["progress"].double.map { min(1, max(0, $0)) } : nil
    let detail: String = closed.isEmpty ? item["detail"].text : ""
    return Link(destination: FPLink.page(item["url"].string)) {
      HStack(spacing: 8) {
        Image(systemName: closed.isEmpty ? Self.icon(item["kind"].text) : "lock.fill")
          .font(.subheadline)
          .foregroundStyle(palette.accent(scheme))
          .widgetAccentable()
          .frame(width: 22)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(closed.isEmpty ? item["title"].text : closed).font(.subheadline).lineLimit(1)
          if let progress {
            HStack(spacing: 6) {
              ProgressView(value: progress)
                .tint(palette.accent(scheme))
                .widgetAccentable()
              Text(FPFormat.count("%d%% read", Int((progress * 100).rounded())))
                .font(.caption2.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          } else if !detail.isEmpty {
            Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          } else if closed.isEmpty, let opened = item["lastOpened"].date {
            Text(opened, style: .relative).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
    }
    .accessibilityElement(children: .combine)
  }

  var body: some View {
    let items = entry.data["items"].array
    let title = entry.data["title"].string ?? L("Continue reading")
    let shown: Int = family == .systemSmall ? 2 : family == .systemLarge ? min(6, entry.settings.max) : min(3, entry.settings.max)
    VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 8) {
      FPHeader(icon: "book", title: title)
      if items.isEmpty {
        Spacer(minLength: 0)
        Text(L("Nothing opened lately")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary).lineLimit(2)
      }
      ForEach(Array(items.prefix(shown).enumerated()), id: \.offset) { _, item in
        row(item)
      }
      Spacer(minLength: 0)
    }
  }
}

// MARK: - 13. Dashboard key figure

@available(iOS 17.0, *)
struct FPMetricView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  private struct Point: Identifiable {
    let id: Int
    let value: Double
  }

  private var value: String {
    if let formatted = entry.data["formatted"].string, !formatted.isEmpty { return formatted }
    if let number = entry.data["value"].double { return number.formatted() }
    return "–"
  }

  private var delta: (text: String, up: Bool?)? {
    guard let delta = entry.data["delta"].double else { return nil }
    let sign: String = delta > 0 ? "+" : delta < 0 ? "−" : "±"
    let number: String = abs(delta).formatted(.number.precision(.fractionLength(0...2)))
    let unit: String = entry.data["unit"].text
    return (sign + number + (unit == "%" ? " %" : ""), delta == 0 ? nil : delta > 0)
  }

  @ViewBuilder private var chart: some View {
    let series: [Double] = entry.data["series"].array.compactMap(\.double).suffix(30).map { $0 }
    if series.count > 1 {
      let points = series.enumerated().map { Point(id: $0.offset, value: $0.element) }
      let low: Double = series.min() ?? 0
      let high: Double = series.max() ?? 1
      Chart(points) { point in
        AreaMark(x: .value("Day", point.id), yStart: .value("Low", low), yEnd: .value("Value", point.value))
          .foregroundStyle(palette.accent(scheme).opacity(0.15))
        LineMark(x: .value("Day", point.id), y: .value("Value", point.value))
          .foregroundStyle(palette.accent(scheme))
          .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
          .interpolationMethod(.monotone)
      }
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartYScale(domain: low...(high > low ? high : low + 1))
      .widgetAccentable()
      .accessibilityHidden(true)
    }
  }

  var body: some View {
    let title = entry.data["title"].string ?? L("Key figure")
    let label = entry.data["label"].text
    switch family {
    case .accessoryInline:
      Text("\(label.isEmpty ? title : label): \(value)")
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: "chart.line.uptrend.xyaxis").font(.caption2)
          Text(value).font(.system(size: 16, weight: .bold, design: .rounded)).minimumScaleFactor(0.4).lineLimit(1)
        }
        .padding(4)
      }
      .accessibilityLabel("\(label): \(value)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        Text(label.isEmpty ? title : label).font(.caption).lineLimit(1)
        Text(value).font(.title3.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).widgetAccentable()
        if let delta { Text(delta.text).font(.caption2).lineLimit(1) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "chart.line.uptrend.xyaxis", title: title, trailing: family == .systemSmall ? "" : (delta?.text ?? ""))
        Spacer(minLength: 0)
        FPBigNumber(value: value, size: family == .systemSmall ? 34 : 40)
        HStack(spacing: 6) {
          if !label.isEmpty { Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
          if family == .systemSmall, let delta {
            Text(delta.text)
              .font(.caption.weight(.semibold))
              .foregroundStyle(delta.up == nil ? AnyShapeStyle(.secondary) : delta.up == true ? AnyShapeStyle(FPStyle.good) : AnyShapeStyle(FPStyle.late))
          }
        }
        if family != .systemSmall {
          chart.frame(height: family == .systemLarge ? 110 : 38)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }
}

// MARK: - 14. Deadline countdown

@available(iOS 17.0, *)
struct FPDeadlineView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  @ViewBuilder private func countdown(_ font: Font) -> some View {
    let done: Bool = entry.data["done"].bool
    if done {
      Label(L("Done"), systemImage: "checkmark.circle.fill").font(font).foregroundStyle(FPStyle.good).lineLimit(1)
    } else if let due = FPDeadline.dueDate(entry.data) {
      if entry.data["overdue"].bool || due < Date() {
        let key: LocalizedStringKey = "\(Text(due, style: .relative)) overdue"
        Text(key).font(font).monospacedDigit().foregroundStyle(FPStyle.late).lineLimit(1).minimumScaleFactor(0.6)
      } else {
        let key: LocalizedStringKey = "\(Text(due, style: .relative)) left"
        Text(key).font(font).monospacedDigit().foregroundStyle(palette.accent(scheme)).widgetAccentable().lineLimit(1).minimumScaleFactor(0.6)
      }
    }
  }

  private var dueLine: String {
    guard let due = FPDeadline.dueDate(entry.data) else { return "" }
    let text: String = entry.data["allDay"].bool || (entry.data["due"].string?.count ?? 0) == 10
      ? FPFormat.due(entry.data["due"].string).label
      : due.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
    return String(format: L("due %@"), text)
  }

  var body: some View {
    let title = entry.data["title"].string ?? L("Deadline")
    switch family {
    case .accessoryInline:
      Label(title, systemImage: "hourglass")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text(title).font(.caption).lineLimit(1)
        countdown(.headline)
        Text(dueLine).font(.caption2).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      VStack(alignment: .leading, spacing: 4) {
        FPHeader(icon: "hourglass", title: L("Deadline"), trailing: family == .systemSmall ? "" : entry.data["page"].text)
        Spacer(minLength: 0)
        Text(title).font(.headline).lineLimit(2).minimumScaleFactor(0.85)
        countdown(family == .systemSmall ? .title3.weight(.bold) : .title2.weight(.bold))
        if !dueLine.isEmpty { Text(dueLine).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
      }
      .accessibilityElement(children: .combine)
    }
  }
}
