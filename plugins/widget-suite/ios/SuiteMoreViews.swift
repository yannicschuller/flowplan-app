import Charts
import SwiftUI
import WidgetKit

// The other widgets: "My day", "Pages" (favorites, recently opened, one
// page), "Key figure" (a database's or a dashboard's number with its trend),
// a deadline's countdown and the next appointment (now the small size of
// "Today"; the old widget of its own stays for the screens it is on).
// SuiteViews.swift has the building blocks. Countdowns are live Texts
// (style .relative): the system keeps them current between refreshes.

enum FPExternal {
  /// A video call's address from the instance ("Join"): https only, no
  /// credentials – the instance names known meeting hosts only.
  static func join(_ value: String?) -> URL? {
    guard let value, value.count <= 2000, let url = URL(string: value), url.scheme == "https",
          url.user == nil, url.password == nil, let host = url.host, host.contains(".") else { return nil }
    return url
  }
}

/// One appointment of a next-appointment answer.
struct FPEvent {
  let title: String
  let start: Date
  let end: Date
  let allDay: Bool
  let location: String
  let calendar: String
  let join: URL?
  let url: String?

  static func list(_ data: FPJSON?, showJoin: Bool = true, now: Date = Date()) -> [FPEvent] {
    guard let data else { return [] }
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

  func running(at now: Date) -> Bool { !allDay && start <= now && now < end }

  /// "14:00–15:00", "Tomorrow 09:30", "Friday 09:30", "All day".
  var when: String {
    let calendar = Calendar.current
    let offset = FPWhen.days(from: Date(), to: start)
    let prefix: String = offset == 0 ? "" : FPWhen.name(start, offset: offset)
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
  var now = Date()
  var font: Font = .caption.weight(.semibold)
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  var body: some View {
    if event.running(at: now) {
      Text(L("Now")).font(font).foregroundStyle(palette.accent(scheme)).widgetAccentable()
    } else if !event.allDay {
      let key: LocalizedStringKey = "in \(Text(event.start, style: .relative))"
      Text(key).font(font).monospacedDigit().foregroundStyle(palette.accent(scheme)).widgetAccentable().lineLimit(1)
    }
  }
}

// MARK: - Next appointment (the old widget of its own)

@available(iOS 17.0, *)
struct FPEventView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let events = FPEvent.list(entry.data, now: entry.date)
    let title = entry.data["title"].string ?? L("Next appointment")
    if let next = events.first {
      switch family {
      case .accessoryInline:
        Label(next.title, systemImage: "calendar.badge.clock")
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          FPCountdown(event: next, now: entry.date, font: .caption)
          Text(next.title).font(.headline).lineLimit(1).widgetAccentable()
          Text(next.when).font(.caption2).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      case .systemSmall:
        VStack(alignment: .leading, spacing: 3) {
          FPHeader(icon: "calendar.badge.clock", title: title)
          Spacer(minLength: 0)
          FPCountdown(event: next, now: entry.date, font: .title3.weight(.bold))
          Text(next.title).font(.headline).lineLimit(2).minimumScaleFactor(0.85)
          Text(next.when).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          if let join = next.join {
            FPJoinButton(url: join, compact: true, inSmall: true).padding(.top, 2)
          }
        }
      default:
        FPCard(FPHeader(icon: "calendar.badge.clock", title: title)) { height in
          VStack(alignment: .leading, spacing: FPGrid.section) {
            HStack(alignment: .top, spacing: 10) {
              VStack(alignment: .leading, spacing: 3) {
                FPCountdown(event: next, now: entry.date, font: .subheadline.weight(.bold))
                Link(destination: FPLink.page(next.url)) {
                  Text(next.title).font(.headline).lineLimit(2)
                }
                Text([next.when, next.location.isEmpty ? next.calendar : next.location].filter { !$0.isEmpty }.joined(separator: " · "))
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
              }
              Spacer(minLength: 4)
              if let join = next.join { FPJoinButton(url: join) }
            }
            if events.count > 1 {
              Divider()
              ForEach(Array(events.dropFirst().prefix(max(1, FPGrid.rows(height - 70, row: FPGrid.tallRow))).enumerated()), id: \.offset) { _, event in
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
          }
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
        FPCard(FPHeader(icon: "calendar.badge.clock", title: title)) { _ in
          FPEmpty(icon: "calendar", text: L("No appointments coming up"))
        }
      }
    }
  }
}

// MARK: - Pages: favorites, recently opened, one page or database view

@available(iOS 17.0, *)
struct FPPagesView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  static func icon(_ kind: String) -> String {
    switch kind {
    case "database": return "tablecells"
    case "record": return "rectangle.portrait.on.rectangle.portrait"
    case "whiteboard": return "scribble.variable"
    case "journal": return "book.closed"
    case "form": return "list.bullet.rectangle"
    case "book": return "book"
    default: return "doc.text"
    }
  }

  /// Recently opened (a "reading" answer), the favorites or one page.
  private var recent: Bool { entry.dataKind == "reading" }
  private var favorites: Bool { !recent && entry.data["properties"].isNull && entry.data["url"].isNull }

  private func row(_ item: FPJSON, tall: Bool) -> some View {
    let closed: String = item["locked"].bool ? L("Locked") : item["encrypted"].bool ? L("Encrypted") : ""
    let progress: Double? = closed.isEmpty ? item["progress"].double.map { min(1, max(0, $0)) } : nil
    let values: String = item["values"].array.compactMap(\.string).filter { !$0.isEmpty }.prefix(2).joined(separator: " · ")
    let detail: String = closed.isEmpty ? (values.isEmpty ? item["detail"].text : values) : ""
    let opened: Date? = closed.isEmpty ? item["lastOpened"].date : nil
    return Link(destination: FPLink.page(item["url"].string)) {
      HStack(spacing: 8) {
        Image(systemName: closed.isEmpty ? Self.icon(item["kind"].text) : "lock.fill")
          .font(.subheadline)
          .foregroundStyle(palette.accent(scheme))
          .widgetAccentable()
          .frame(width: 20)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(closed.isEmpty ? item["title"].text : closed).font(.subheadline).lineLimit(1)
          if tall {
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
            } else if let opened {
              Text(FPWhen.moment(opened, now: entry.date)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
          }
        }
        Spacer(minLength: 0)
      }
      .frame(height: tall ? FPGrid.tallRow : FPGrid.row)
    }
    .accessibilityElement(children: .combine)
  }

  var body: some View {
    let items = entry.data["items"].array
    let title: String = entry.data["title"].string ?? (recent ? L("Recently opened") : L("Favorites"))
    let icon: String = recent ? "clock.arrow.circlepath" : favorites ? "star" : "tablecells"
    let tall: Bool = family != .systemSmall
    FPCard(FPHeader(icon: icon, title: title)) { height in
      if items.isEmpty {
        FPEmpty(icon: recent ? "clock" : "star", text: recent ? L("Nothing opened lately") : favorites ? L("No favorites yet – star a page in Flowplan") : L("Nothing here yet"))
      } else {
        let rows: Int = min(items.count, FPGrid.rows(height, row: tall ? FPGrid.tallRow : FPGrid.row))
        VStack(alignment: .leading, spacing: FPGrid.gap) {
          ForEach(0..<rows, id: \.self) { index in
            row(items[index], tall: tall)
          }
        }
      }
    }
  }
}

// MARK: - Key figure: a database's number or a dashboard's, with its trend

/// The number of a "counter" or a "metric" answer, as one shape.
struct FPFigure {
  let title: String
  let value: String
  let label: String
  let series: [Double]
  // Days before the first refresh (counter): drawn lighter and dashed.
  let estimated: Int
  let delta: Double?
  let percent: Bool
  // What the change compares with ("last 14 days"), or nothing.
  let period: String

  init(_ data: FPJSON, kind: String) {
    title = data["title"].string ?? L("Key figure")
    if kind == "counter" {
      value = data["formatted"].string ?? "–"
      label = [data["label"].text, data["group"].text].filter { !$0.isEmpty }.joined(separator: " · ")
      let history = data["history"].array
      series = history.map { $0["value"].double ?? 0 }
      estimated = (history.lastIndex { $0["estimated"].bool } ?? -1) + 1
      // The trend of the history: its last day against its first.
      if let first = series.first, let last = series.last, series.count > 1 {
        delta = last - first
        period = FPFormat.count("last %d days", series.count)
      } else {
        delta = nil
        period = ""
      }
      percent = false
    } else {
      if let formatted = data["formatted"].string, !formatted.isEmpty {
        value = formatted
      } else if let number = data["value"].double {
        value = number.formatted()
      } else {
        value = "–"
      }
      label = data["label"].text
      series = data["series"].array.compactMap(\.double).suffix(30).map { $0 }
      estimated = 0
      delta = data["delta"].double
      percent = data["unit"].text == "%"
      period = ""
    }
  }

  /// "+3.4", "−12", "±0" (and " %" for a percentage); up: nil when flat.
  var change: (text: String, up: Bool?)? {
    guard let delta else { return nil }
    let sign: String = delta > 0 ? "+" : delta < 0 ? "−" : "±"
    let number: String = abs(delta).formatted(.number.precision(.fractionLength(0...2)))
    return (sign + number + (percent ? " %" : ""), delta == 0 ? nil : delta > 0)
  }
}

@available(iOS 17.0, *)
struct FPTrendChart: View {
  let values: [Double]
  var estimated = 0
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  private struct Point: Identifiable {
    let id: Int
    let x: Int
    let value: Double
    let series: String
  }

  var body: some View {
    if values.count > 1 {
      let low: Double = values.min() ?? 0
      let high: Double = values.max() ?? 1
      // Estimated days lighter and dashed; the measured line starts where
      // they end.
      let points: [Point] = values.enumerated().flatMap { index, value -> [Point] in
        if index < estimated - 1 { return [Point(id: index, x: index, value: value, series: "estimated")] }
        if index == estimated - 1 {
          return [Point(id: index, x: index, value: value, series: "estimated"), Point(id: index + 1000, x: index, value: value, series: "measured")]
        }
        return [Point(id: index, x: index, value: value, series: "measured")]
      }
      Chart(points) { point in
        if point.series == "measured" {
          AreaMark(x: .value("Day", point.x), yStart: .value("Low", low), yEnd: .value("Value", point.value))
            .foregroundStyle(palette.accent(scheme).opacity(0.15))
        }
        LineMark(x: .value("Day", point.x), y: .value("Value", point.value), series: .value("Series", point.series))
          .foregroundStyle(palette.accent(scheme).opacity(point.series == "estimated" ? 0.35 : 1))
          .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, dash: point.series == "estimated" ? [3, 3] : []))
          .interpolationMethod(.monotone)
      }
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartLegend(.hidden)
      .chartYScale(domain: low...(high > low ? high : low + 1))
      .widgetAccentable()
      .accessibilityHidden(true)
    }
  }
}

@available(iOS 17.0, *)
struct FPFigureView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  @ViewBuilder private func change(_ figure: FPFigure, font: Font) -> some View {
    if let change = figure.change {
      Text(change.text)
        .font(font)
        .monospacedDigit()
        .foregroundStyle(change.up == nil ? AnyShapeStyle(.secondary) : change.up == true ? AnyShapeStyle(FPStyle.good) : AnyShapeStyle(FPStyle.late))
        .lineLimit(1)
    }
  }

  var body: some View {
    let figure = FPFigure(entry.data, kind: entry.dataKind)
    switch family {
    case .accessoryInline:
      Text("\(figure.label.isEmpty ? figure.title : figure.label): \(figure.value)")
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: figure.change?.up == false ? "chart.line.downtrend.xyaxis" : "chart.line.uptrend.xyaxis").font(.caption2)
          Text(figure.value).font(.system(size: 16, weight: .bold, design: .rounded)).minimumScaleFactor(0.4).lineLimit(1).widgetAccentable()
        }
        .padding(4)
      }
      .accessibilityLabel("\(figure.title): \(figure.value)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        Text(figure.title).font(.caption).lineLimit(1)
        Text(figure.value).font(.title3.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).widgetAccentable()
        if let change = figure.change {
          Text([change.text, figure.period].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption2).lineLimit(1)
        } else if !figure.label.isEmpty {
          Text(figure.label).font(.caption2).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 2) {
        FPHeader(icon: "chart.line.uptrend.xyaxis", title: figure.title)
        Spacer(minLength: 0)
        FPBigNumber(value: figure.value, size: 36)
        HStack(spacing: 6) {
          if !figure.label.isEmpty { Text(figure.label).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
          change(figure, font: .caption.weight(.semibold))
        }
      }
      .accessibilityElement(children: .combine)
    default:
      FPCard(FPHeader(icon: "chart.line.uptrend.xyaxis", title: figure.title, trailing: entry.data["view"].text)) { height in
        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
              FPBigNumber(value: figure.value, size: family.isLarge ? 52 : 40)
              HStack(spacing: 6) {
                change(figure, font: .caption.weight(.semibold))
                Text([figure.label, figure.period].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
              }
            }
            .accessibilityElement(children: .combine)
            if family == .systemMedium {
              FPTrendChart(values: figure.series, estimated: figure.estimated).frame(maxWidth: .infinity, maxHeight: min(64, height))
            }
          }
          if family != .systemMedium {
            FPTrendChart(values: figure.series, estimated: figure.estimated).frame(maxWidth: .infinity, maxHeight: .infinity)
          }
          if figure.estimated > 0, family.isLarge {
            Text(L("History partly estimated")).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
          }
        }
      }
    }
  }
}

// MARK: - Deadline countdown

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
      if entry.data["overdue"].bool || due < entry.date {
        let key: LocalizedStringKey = "\(Text(due, style: .relative)) overdue"
        Text(key).font(font).monospacedDigit().foregroundStyle(FPStyle.late).lineLimit(1).minimumScaleFactor(0.6)
      } else {
        let key: LocalizedStringKey = "\(Text(due, style: .relative)) left"
        Text(key).font(font).monospacedDigit().foregroundStyle(palette.accent(scheme)).widgetAccentable().lineLimit(1).minimumScaleFactor(0.6)
      }
    }
  }

  /// "due Today 14:00", "due Friday", "due Overdue · 3 d" – the same words
  /// as the lists.
  private var dueLine: String {
    guard let due = FPDeadline.dueDate(entry.data) else { return "" }
    let allDay: Bool = entry.data["allDay"].bool || (entry.data["due"].string?.count ?? 0) == 10
    let text: String = allDay ? FPWhen.day(due, now: entry.date).label : FPWhen.moment(due, now: entry.date)
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

// MARK: - My day: today's appointments, what is due and the habits

@available(iOS 17.0, *)
struct FPMyDayView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  /// Today's appointments still to come (or running), all-day ones first.
  private var events: [FPJSON] {
    entry.data["items"].array.filter { item in
      item["type"].string != "task" && (!item["timed"].bool || (item["end"].date ?? item["start"].date ?? .distantFuture) >= entry.date)
    }
  }

  /// Open tasks due today or overdue.
  private var tasks: [FPJSON] {
    (entry.extras["tasks"]?["items"].array ?? []).filter { FPWhen.group($0["due"].string, now: entry.date) < 2 }
  }

  private var habits: FPJSON { entry.extras["journal"]?["habits"] ?? FPJSON(nil) }
  private var habitItems: [FPJSON] {
    let closed = habits["locked"].bool || habits["encrypted"].bool
    return closed ? [] : habits["items"].array
  }

  @ViewBuilder private func eventRows(_ rows: Int) -> some View {
    let shown = Array(events.prefix(rows))
    VStack(alignment: .leading, spacing: FPGrid.gap) {
      ForEach(0..<shown.count, id: \.self) { index in
        FPCalendarRow(item: shown[index], compact: family != .systemLarge)
      }
    }
  }

  @ViewBuilder private func taskRows(_ rows: Int) -> some View {
    let shown = Array(tasks.prefix(rows))
    VStack(alignment: .leading, spacing: FPGrid.gap) {
      ForEach(0..<shown.count, id: \.self) { index in
        FPTaskRow(item: shown[index], marks: entry.marks, now: entry.date)
      }
    }
  }

  /// The habits as one row of checkboxes (at most four).
  @ViewBuilder private var habitRow: some View {
    HStack(spacing: 6) {
      ForEach(Array(habitItems.prefix(family.isLarge ? 4 : 3).enumerated()), id: \.offset) { _, item in
        FPHabitRow(habits: habits, item: item, marks: entry.marks)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(height: FPGrid.row)
  }

  /// "2 appointments · 5 tasks · 1/3 habits".
  private var counter: String {
    var parts: [String] = []
    if !events.isEmpty { parts.append(FPFormat.count("%d appointments", events.count)) }
    if !tasks.isEmpty {
      let open = tasks.filter { !entry.marks.isPending(FPTaskList.id($0)) }.count
      parts.append(FPFormat.count("%d tasks", open))
    }
    if !habitItems.isEmpty { parts.append("\(FPHabits.done(habits, marks: entry.marks))/\(habits["total"].int ?? habitItems.count)") }
    return parts.joined(separator: " · ")
  }

  var body: some View {
    let header = FPHeader(icon: "sun.max", title: L("My day"), trailing: family == .systemSmall ? "" : counter)
    FPCard(header) { height in
      if events.isEmpty && tasks.isEmpty && habitItems.isEmpty {
        FPEmpty(icon: "sun.max", text: L("Nothing left for today"), action: (L("New task"), FPLink.capture("task", target: nil)))
      } else if family == .systemMedium {
        // Two columns: appointments | tasks; the habits below.
        let space: CGFloat = height - (habitItems.isEmpty ? 0 : FPGrid.row + FPGrid.section)
        let rows: Int = FPGrid.rows(space - FPGrid.heading - FPGrid.gap)
        VStack(alignment: .leading, spacing: FPGrid.section) {
          HStack(alignment: .top, spacing: 12) {
            if !events.isEmpty {
              VStack(alignment: .leading, spacing: FPGrid.gap) {
                FPGroupHeading(title: L("Appointments"))
                eventRows(rows)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !tasks.isEmpty {
              VStack(alignment: .leading, spacing: FPGrid.gap) {
                FPGroupHeading(title: L("Due"))
                taskRows(rows)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
          Spacer(minLength: 0)
          if !habitItems.isEmpty { habitRow }
        }
      } else {
        // One column: appointments (up to four), the tasks in the room left,
        // the habits at the bottom.
        let habitHeight: CGFloat = habitItems.isEmpty ? 0 : FPGrid.heading + FPGrid.gap + FPGrid.row + FPGrid.section
        let headings: CGFloat = (events.isEmpty ? 0 : FPGrid.heading + FPGrid.gap) + (tasks.isEmpty ? 0 : FPGrid.heading + FPGrid.gap + FPGrid.section)
        let total: Int = FPGrid.rows(height - habitHeight - headings)
        let eventCount: Int = min(events.count, tasks.isEmpty ? total : min(4, max(1, total / 2)))
        let taskCount: Int = max(0, total - eventCount)
        VStack(alignment: .leading, spacing: FPGrid.gap) {
          if !events.isEmpty {
            FPGroupHeading(title: L("Appointments"))
            eventRows(eventCount)
          }
          if !tasks.isEmpty, taskCount > 0 {
            FPGroupHeading(title: L("Due")).padding(.top, events.isEmpty ? 0 : FPGrid.section)
            taskRows(taskCount)
          }
          Spacer(minLength: 0)
          if !habitItems.isEmpty {
            FPGroupHeading(title: habits["name"].string ?? L("Habits"))
            habitRow
          }
        }
      }
    }
  }
}
