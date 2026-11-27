import AppIntents
import Charts
import SwiftUI
import UIKit
import WidgetKit

// How the configurable widgets look. Every widget is built from the same
// pieces (FPCard: header with a clear counter, the body, the quiet footer
// with the last update; FPGrid: one row height, one gap, rows computed from
// the height the family really has), so spacing and typography are the same
// everywhere. Brand colour (the workspace's accent where the instance sends
// it) only as an accent; in the tinted and clear home screens (iOS 18, iOS
// 26's Liquid Glass) the system draws accentable parts (widgetAccentable) in
// its tint, the rest stays legible in primary and secondary. Buttons run in
// the extension (iOS 17); links open the page in the app
// (flowplan://open?path=…). SuiteMoreViews.swift has the remaining widgets.

/// The colours a widget takes (its "Colors" setting, FPColorChoice): the
/// workspace's accent from the instance's answer (theme), the profile's dot,
/// the system's tint or Flowplan's own. In the tinted and clear looks (iOS
/// 18, iOS 26's Liquid Glass) the system draws accentable parts in its tint
/// instead; the rest stays legible in primary and secondary.
struct FPPalette: Sendable {
  let light: Color
  let dark: Color
  let system: Bool

  static let flowplan = FPPalette(light: FPStyle.brand, dark: FPStyle.brandOnDark, system: false)

  func accent(_ scheme: ColorScheme) -> Color {
    if system { return Color.accentColor }
    return scheme == .dark ? dark : light
  }

  static func hex(_ value: String?) -> Color? {
    guard let value, value.count == 7, value.hasPrefix("#"), let rgb = UInt32(value.dropFirst(), radix: 16) else { return nil }
    return Color(red: Double((rgb >> 16) & 0xff) / 255, green: Double((rgb >> 8) & 0xff) / 255, blue: Double(rgb & 0xff) / 255)
  }

  @available(iOS 17.0, *)
  static func resolve(_ choice: FPColorChoice, theme: FPJSON, profile: String?) -> FPPalette {
    switch choice {
    case .system:
      return FPPalette(light: Color.accentColor, dark: Color.accentColor, system: true)
    case .flowplan:
      return .flowplan
    case .profile:
      let info = FPProfiles.info(profile)
      guard let light = hex(info?.color), let dark = hex(info?.colorDark) else { return .flowplan }
      return FPPalette(light: light, dark: dark, system: false)
    case .accent:
      guard let light = hex(theme["accent"].string), let dark = hex(theme["accentDark"].string) else { return .flowplan }
      return FPPalette(light: light, dark: dark, system: false)
    }
  }
}

private struct FPPaletteKey: EnvironmentKey {
  static let defaultValue = FPPalette.flowplan
}
private struct FPProfileKey: EnvironmentKey {
  static let defaultValue: String? = nil
}
private struct FPReloadKindKey: EnvironmentKey {
  static let defaultValue: String = ""
}

extension EnvironmentValues {
  var fpPalette: FPPalette {
    get { self[FPPaletteKey.self] }
    set { self[FPPaletteKey.self] = newValue }
  }
  /// The profile a widget shows (nil: the active one): its buttons act there.
  var fpProfile: String? {
    get { self[FPProfileKey.self] }
    set { self[FPProfileKey.self] = newValue }
  }
  /// The widget kind (SuiteWidgets.swift) whose timelines a button reloads
  /// first, so the tapped item is drawn done at once.
  var fpReloadKind: String {
    get { self[FPReloadKindKey.self] }
    set { self[FPReloadKindKey.self] = newValue }
  }
}

enum FPStyle {
  static let brand = Color(red: 0.255, green: 0.275, blue: 0.902)
  static let brandOnDark = Color(red: 0.561, green: 0.576, blue: 1)
  static let late = Color(red: 0.82, green: 0.26, blue: 0.26)
  static let good = Color(red: 0.18, green: 0.52, blue: 0.35)
  static let warn = Color(red: 0.76, green: 0.49, blue: 0.05)
  static let background = Color(UIColor { traits in
    traits.userInterfaceStyle == .dark
      ? UIColor(red: 0.086, green: 0.082, blue: 0.106, alpha: 1)
      : UIColor(red: 0.988, green: 0.984, blue: 0.973, alpha: 1)
  })
  static func accent(_ scheme: ColorScheme) -> Color { scheme == .dark ? brandOnDark : brand }
}

/// One grid for every widget: a list row is 20 pt high with 4 pt between
/// rows, a group heading 15 pt; header, body and footer are 6 pt apart.
/// Lists ask how many rows fit into the height their family really has
/// (GeometryReader in FPCard), so a large widget shows 9–10 rows instead of
/// five and half the widget empty.
enum FPGrid {
  static let row: CGFloat = 20
  static let tallRow: CGFloat = 32
  static let gap: CGFloat = 4
  static let heading: CGFloat = 15
  static let section: CGFloat = 6

  /// Rows of one height that fit.
  static func rows(_ height: CGFloat, row: CGFloat = FPGrid.row) -> Int {
    max(1, Int((height + gap) / (row + gap)))
  }

  /// How many items fit when each starts a heading where its group changes
  /// (groups: the group of every item, in order).
  static func fit(_ groups: [Int], height: CGFloat, row: CGFloat = FPGrid.row, headings: Bool) -> Int {
    var used: CGFloat = 0
    var count = 0
    var last: Int? = nil
    for group in groups {
      var need: CGFloat = row + (count > 0 ? gap : 0)
      if headings && group != last { need += heading + gap }
      if used + need > height + 0.5 { break }
      used += need
      count += 1
      last = group
    }
    return count
  }
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

  /// A due day relative to today (FPWhen.day); late: before today.
  static func due(_ text: String?, now: Date = Date()) -> (label: String, late: Bool) {
    guard let date = day(text) else { return ("", false) }
    return FPWhen.day(date, now: now)
  }

  static func hours(_ value: Double?) -> String {
    let minutes = max(0, Int(((value ?? 0) * 60).rounded()))
    return String(format: "%d:%02d h", minutes / 60, minutes % 60)
  }

  static func count(_ key: String, _ count: Int) -> String {
    String(format: L(key), count)
  }
}

/// Dates the same way in every widget: "Overdue · 10 d", "Today 14:00",
/// "Tomorrow", the weekday within a week, the date only beyond that – never
/// a full date on every row.
enum FPWhen {
  static func days(from now: Date, to date: Date) -> Int {
    let calendar = Calendar.current
    return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
  }

  /// A day without time; late: before today.
  static func day(_ date: Date, now: Date) -> (label: String, late: Bool) {
    let offset = days(from: now, to: date)
    if offset < 0 { return (FPFormat.count("Overdue · %d d", -offset), true) }
    return (name(date, offset: offset), false)
  }

  /// A moment: "Today 14:00", "Tomorrow 09:30", "Friday 14:00", "17 Nov 14:00".
  static func moment(_ date: Date, now: Date, allDay: Bool = false) -> String {
    let offset = days(from: now, to: date)
    let name: String = offset < 0 ? date.formatted(.dateTime.day().month(.abbreviated)) : self.name(date, offset: offset)
    if allDay { return name }
    return name + " " + date.formatted(date: .omitted, time: .shortened)
  }

  /// "Today", "Tomorrow", the weekday within a week, else the date.
  static func name(_ date: Date, offset: Int) -> String {
    switch offset {
    case 0: return L("Today")
    case 1: return L("Tomorrow")
    case 2..<7: return date.formatted(.dateTime.weekday(.wide))
    default:
      let sameYear = Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: Date())
      return sameYear ? date.formatted(.dateTime.day().month(.abbreviated)) : date.formatted(.dateTime.day().month(.abbreviated).year())
    }
  }

  /// The group of a due day in list widgets: 0 overdue, 1 today, 2 later
  /// (and without a date).
  static func group(_ text: String?, now: Date) -> Int {
    guard let date = FPFormat.day(text) else { return 2 }
    let offset = days(from: now, to: date)
    return offset < 0 ? 0 : offset == 0 ? 1 : 2
  }

  static func groupTitle(_ group: Int) -> String {
    switch group {
    case 0: return L("Overdue")
    case 1: return L("Today")
    default: return L("Later")
    }
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
    case "counter", "metric": return "chart.line.uptrend.xyaxis"
    case "journal": return "book.closed"
    case "time": return "timer"
    case "study": return "rectangle.on.rectangle.angled"
    case "event": return "calendar.badge.clock"
    case "reading": return "book"
    case "deadline": return "hourglass"
    case "myday": return "sun.max"
    default: return "square.grid.2x2"
    }
  }

  static func title(_ kind: String) -> String {
    switch kind {
    case "capture": return L("Quick capture")
    case "tasks": return L("Tasks")
    case "calendar": return L("Today")
    case "pinned": return L("Pages")
    case "counter", "metric": return L("Key figure")
    case "journal": return L("Journal and habits")
    case "time": return L("Time this week")
    case "study": return L("Cards due")
    case "event": return L("Next appointment")
    case "reading": return L("Continue reading")
    case "deadline": return L("Deadline")
    case "myday": return L("My day")
    default: return "Flowplan"
    }
  }
}

extension WidgetFamily {
  var isAccessory: Bool { self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline }
  var isLarge: Bool { self == .systemLarge || self == .systemExtraLarge }
}

// MARK: - Building blocks: header, card, footer, empty state

/// The header of every widget: symbol and title in the accent, a clear
/// counter on the right ("24 open · 10 overdue").
@available(iOS 17.0, *)
struct FPHeader: View {
  let icon: String
  let title: String
  let trailing: Text?
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  init(icon: String, title: String, trailing: String = "") {
    self.icon = icon
    self.title = title
    self.trailing = trailing.isEmpty ? nil : Text(trailing)
  }
  init(icon: String, title: String, trailingText: Text?) {
    self.icon = icon
    self.title = title
    self.trailing = trailingText
  }

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: icon)
        .font(.caption.weight(.semibold))
        .foregroundStyle(palette.accent(scheme))
        .widgetAccentable()
        .accessibilityHidden(true)
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(palette.accent(scheme))
        .lineLimit(1)
        .widgetAccentable()
      Spacer(minLength: 4)
      if let trailing {
        trailing
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
          .monospacedDigit()
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
    }
    .frame(height: 16)
    .accessibilityElement(children: .combine)
  }
}

/// "24 open · 10 overdue": the overdue part in the warning colour.
enum FPCounter {
  static func open(_ open: Int, overdue: Int) -> Text {
    let base = Text(FPFormat.count("%d open", open))
    guard overdue > 0 else { return base }
    return base + Text(" · ") + Text(FPFormat.count("%d overdue", overdue)).foregroundColor(FPStyle.late)
  }
}

/// A widget's body under its header: the content gets the height it really
/// has, so lists can fill it (FPGrid).
@available(iOS 17.0, *)
struct FPCard<Content: View>: View {
  let header: FPHeader
  let content: (CGFloat) -> Content

  init(_ header: FPHeader, @ViewBuilder content: @escaping (CGFloat) -> Content) {
    self.header = header
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: FPGrid.section) {
      header
      GeometryReader { proxy in
        content(proxy.size.height)
          .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
      }
    }
  }
}

/// The last update, quiet and grey at the bottom of every data widget:
/// "12 min ago" as a live text (the system keeps counting without a
/// reload); older than an hour a warning and "As of 01:10". The date is
/// when the answer came from the instance, also when a cached answer is
/// shown again (FPResult.at). Small widgets show only the warning.
@available(iOS 17.0, *)
struct FPFooter: View {
  static let staleAfter: TimeInterval = 3600
  let fetched: Date
  let now: Date

  static func shows(fetched: Date, now: Date, compact: Bool) -> Bool {
    !compact || now.timeIntervalSince(fetched) > staleAfter
  }

  var body: some View {
    if now.timeIntervalSince(fetched) > Self.staleAfter {
      let time: String = Calendar.current.isDate(fetched, inSameDayAs: now)
        ? fetched.formatted(date: .omitted, time: .shortened)
        : fetched.formatted(.dateTime.day().month(.abbreviated).hour().minute())
      HStack(spacing: 3) {
        Image(systemName: "exclamationmark.triangle.fill")
          .foregroundStyle(FPStyle.warn)
          .accessibilityHidden(true)
        Text(String(format: L("As of %@"), time))
          .foregroundStyle(.secondary)
      }
      .font(.caption2)
      .lineLimit(1)
      .frame(height: 12)
    } else {
      let key: LocalizedStringKey = "\(Text(fetched, style: .relative)) ago"
      Text(key)
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .monospacedDigit()
        .lineLimit(1)
        .frame(height: 12)
    }
  }
}

/// An empty list with a purpose: what it means and what to do next.
@available(iOS 17.0, *)
struct FPEmpty: View {
  let icon: String
  let text: String
  var action: (label: String, url: URL)? = nil
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette
  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Spacer(minLength: 0)
      Label(text, systemImage: icon)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
        .lineLimit(2)
      if let action, family != .systemSmall {
        Link(destination: action.url) {
          Label(action.label, systemImage: "plus")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .frame(minHeight: 28)
            .background(.fill.tertiary, in: Capsule())
            .foregroundStyle(palette.accent(scheme))
            .widgetAccentable()
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A heading of a group in a list (Overdue, Today, Later; a day).
@available(iOS 17.0, *)
struct FPGroupHeading: View {
  let title: String
  var late = false

  var body: some View {
    Text(title)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(late ? AnyShapeStyle(FPStyle.late) : AnyShapeStyle(.secondary))
      .textCase(.uppercase)
      .lineLimit(1)
      .frame(height: FPGrid.heading, alignment: .bottomLeading)
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
      VStack(alignment: .leading, spacing: FPGrid.section) {
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

/// The short hint under an item whose action the instance refused.
@available(iOS 17.0, *)
struct FPHint: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption2.weight(.medium))
      .foregroundStyle(FPStyle.late)
      .lineLimit(1)
      .minimumScaleFactor(0.8)
  }
}

// MARK: - The widget

@available(iOS 17.0, *)
struct FPSuiteView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  private var link: URL {
    switch entry.state {
    case .signedOut, .offline, .gone, .setup, .outdated: return FPLink.page("/")
    default:
      switch entry.kind {
      case "event":
        return FPLink.page(entry.data["items"].array.first?["url"].string ?? "/#home")
      case "calendar":
        // The small size is the next appointment.
        if family == .systemSmall, let next = FPEvent.list(entry.extras["event"]).first { return FPLink.page(next.url ?? "/#home") }
        return FPLink.page("/#home")
      case "reading":
        return FPLink.page(entry.data["items"].array.first?["url"].string ?? "/#home")
      case "pinned":
        if entry.dataKind == "reading" { return FPLink.page(entry.data["items"].array.first?["url"].string ?? "/#home") }
        return FPLink.page(entry.data["url"].string ?? (family == .systemSmall ? entry.data["items"].array.first?["url"].string : nil) ?? "/#home")
      case "capture":
        return FPLink.capture(entry.settings.buttons.first ?? "note", target: entry.data["target"]["id"].string)
      case "tasks":
        if entry.data["items"].array.isEmpty { return FPLink.capture("task", target: nil) }
        return FPLink.page(entry.data["url"].string ?? "/#tasks")
      case "myday":
        return FPLink.page("/#home")
      case "journal":
        let journal = entry.data["journal"]
        return FPLink.page(journal["today"].string ?? journal["url"].string ?? entry.data["habits"]["url"].string)
      default:
        return FPLink.page(entry.data["url"].string ?? "/#home")
      }
    }
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      // In the tinted and clear looks (iOS 18, iOS 26's Liquid Glass) the
      // system replaces the background; the accents follow its tint
      // (widgetAccentable).
      .containerBackground(for: .widget) {
        family.isAccessory ? Color.clear : FPStyle.background
      }
      .environment(\.fpPalette, entry.palette)
      .environment(\.fpProfile, entry.profile)
      .environment(\.fpReloadKind, FPWidgetKind.of(entry.kind))
      .widgetURL(link)
  }

  /// The footer on every data widget, not on quick capture (no data) and not
  /// on the lock screen (no room).
  private var footer: Bool { entry.kind != "capture" && !family.isAccessory }

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
    case .outdated:
      FPClosedView(kind: entry.kind, icon: "arrow.up.circle", title: FPKind.title(entry.kind), message: L("This widget needs a newer Flowplan on your instance"))
    case .data, .sample:
      if entry.locked {
        FPClosedView(kind: entry.kind, icon: "lock.fill", title: entry.data["title"].string ?? FPKind.title(entry.kind), message: L("Protected by the journal PIN – unlock it in Flowplan"))
      } else if entry.encrypted {
        FPClosedView(kind: entry.kind, icon: "lock.shield", title: FPKind.title(entry.kind), message: L("End-to-end encrypted – readable in Flowplan only"))
      } else if footer {
        let fetched: Date = entry.fetched ?? entry.date
        VStack(alignment: .leading, spacing: FPGrid.section) {
          kindView
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          if FPFooter.shows(fetched: fetched, now: entry.date, compact: family == .systemSmall) {
            FPFooter(fetched: fetched, now: entry.date)
          }
        }
      } else {
        kindView
      }
    }
  }

  @ViewBuilder private var kindView: some View {
    switch entry.kind {
    case "capture": FPCaptureView(entry: entry)
    case "tasks": FPTasksView(entry: entry)
    case "calendar": FPCalendarView(entry: entry)
    case "pinned", "reading": FPPagesView(entry: entry)
    case "counter", "metric":
      if entry.data["available"].raw != nil && !entry.data["available"].bool {
        FPClosedView(kind: entry.kind, icon: "eye.slash", title: entry.data["title"].string ?? FPKind.title(entry.kind), message: L("No longer available – edit the widget"))
      } else {
        FPFigureView(entry: entry)
      }
    case "journal": FPJournalView(entry: entry)
    case "time": FPTimeView(entry: entry)
    case "study": FPStudyView(entry: entry)
    case "event": FPEventView(entry: entry)
    case "deadline": FPDeadlineView(entry: entry)
    case "myday": FPMyDayView(entry: entry)
    default: EmptyView()
    }
  }
}

// MARK: - Quick capture

@available(iOS 17.0, *)
struct FPCaptureView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

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
      VStack(alignment: .leading, spacing: FPGrid.section) {
        FPHeader(icon: "square.and.pencil", title: L("Quick capture"))
        Spacer(minLength: 0)
        Image(systemName: Self.icon(first))
          .font(.system(size: 30, weight: .semibold))
          .foregroundStyle(palette.accent(scheme))
          .widgetAccentable()
        Text(Self.label(first)).font(.headline).lineLimit(1)
        Text(entry.data["target"]["name"].text).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
      .accessibilityElement(children: .combine)
    default:
      VStack(alignment: .leading, spacing: FPGrid.section) {
        FPHeader(icon: "square.and.pencil", title: L("Quick capture"), trailing: entry.data["target"]["name"].text)
        Spacer(minLength: 0)
        HStack(spacing: 8) {
          ForEach(buttons, id: \.self) { button in
            Link(destination: FPLink.capture(button, target: target)) {
              VStack(spacing: 6) {
                Image(systemName: Self.icon(button))
                  .font(.title3.weight(.semibold))
                  .foregroundStyle(palette.accent(scheme))
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

// MARK: - Tasks (check off right here)

/// A round checkbox: in a widget the system draws the tapped state at once,
/// before the action runs. With the label (habits) the whole row is the
/// checkbox; without (tasks) only the circle, the text opens the page.
@available(iOS 17.0, *)
struct FPCheckStyle: ToggleStyle {
  let accent: Color
  var showsLabel = false

  func makeBody(configuration: Configuration) -> some View {
    let on: Bool = configuration.isOn
    let symbol: String = on ? "checkmark.circle.fill" : "circle"
    let style: AnyShapeStyle = on ? AnyShapeStyle(accent) : AnyShapeStyle(.secondary)
    return HStack(spacing: 6) {
      Image(systemName: symbol)
        .font(.body)
        .foregroundStyle(style)
        .widgetAccentable()
        .frame(width: 26, height: FPGrid.row)
      if showsLabel {
        configuration.label
          .strikethrough(on)
          .opacity(on ? 0.6 : 1)
      }
    }
    .contentShape(Rectangle())
  }
}

/// The tasks of an answer: in order, with what was just checked off.
struct FPTaskList {
  let items: [FPJSON]
  let open: Int
  let overdue: Int

  init(_ data: FPJSON, marks: FPMarks, now: Date) {
    let all = data["items"].array
    let checked: Int = all.filter { marks.isPending(FPTaskList.id($0)) }.count
    items = all
    open = max(0, (data["total"].int ?? all.count) - checked)
    // The instance's count of overdue tasks where it sends one; otherwise
    // those of the answer (at most ten).
    var late = 0
    var lateChecked = 0
    for item in all where FPWhen.group(item["due"].string, now: now) == 0 {
      if marks.isPending(FPTaskList.id(item)) { lateChecked += 1 } else { late += 1 }
    }
    if let counted = data["overdue"].int {
      overdue = max(0, counted - lateChecked)
    } else {
      overdue = late
    }
  }

  /// The task as FPCompleteTaskIntent names it.
  static func id(_ item: FPJSON) -> String {
    let source: String = item["source"].string ?? "doc"
    let rowId: String = item["rowId"].string ?? ""
    let index: Int = item["index"].int ?? -1
    return FPActions.taskID(source: source, pageId: item["pageId"].text, rowId: rowId, index: index)
  }
}

/// One task in one line: checkbox, text, the due day on the right.
@available(iOS 17.0, *)
struct FPTaskRow: View {
  let item: FPJSON
  let marks: FPMarks
  let now: Date
  var showsDue = true
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette
  @Environment(\.fpProfile) private var profile
  @Environment(\.fpReloadKind) private var reload

  @ViewBuilder private func check(done: Bool) -> some View {
    if done {
      // Checked off (or on its way): drawn done until the instance's next
      // answer no longer lists it.
      Image(systemName: "checkmark.circle.fill")
        .font(.body)
        .foregroundStyle(palette.accent(scheme))
        .widgetAccentable()
        .frame(width: 26, height: FPGrid.row)
        .accessibilityLabel(L("Done"))
    } else if item["canEdit"].bool, let pageId = item["pageId"].string {
      let intent = FPCompleteTaskIntent(
        source: item["source"].string ?? "doc",
        pageId: pageId,
        rowId: item["rowId"].string ?? "",
        index: item["index"].int ?? -1,
        key: item["key"].text,
        text: item["text"].text,
        profile: profile,
        widget: reload
      )
      Toggle(isOn: false, intent: intent) {
        Text(L("Mark as done"))
      }
      .toggleStyle(FPCheckStyle(accent: palette.accent(scheme)))
      .accessibilityLabel("\(L("Mark as done")): \(item["text"].text)")
    } else {
      Image(systemName: "circle.dotted")
        .font(.body)
        .foregroundStyle(.tertiary)
        .frame(width: 26, height: FPGrid.row)
        .accessibilityHidden(true)
    }
  }

  var body: some View {
    let due = FPFormat.due(item["due"].string, now: now)
    let id: String = FPTaskList.id(item)
    let done: Bool = marks.isPending(id)
    let failed: Bool = !done && marks.hasFailed(id)
    let textStyle: HierarchicalShapeStyle = done ? .secondary : .primary
    HStack(spacing: 2) {
      check(done: done)
      Link(destination: FPLink.page(item["url"].string)) {
        HStack(spacing: 6) {
          if failed {
            FPHint(text: L("Couldn’t check off – open in Flowplan"))
          } else {
            Text(item["text"].text)
              .strikethrough(done)
              .font(.subheadline)
              .foregroundStyle(textStyle)
              .lineLimit(1)
          }
          Spacer(minLength: 2)
          if showsDue, !due.label.isEmpty {
            Text(due.label)
              .font(.caption2.weight(.medium))
              .foregroundStyle(due.late ? AnyShapeStyle(FPStyle.late) : AnyShapeStyle(.secondary))
              .lineLimit(1)
          }
        }
      }
      .accessibilityElement(children: .combine)
    }
    .frame(height: FPGrid.row)
    .opacity(done ? 0.6 : 1)
    .invalidatableContent()
  }
}

/// Tasks in the grid: as many rows as fit, grouped (Overdue, Today, Later)
/// where there is room for the headings.
@available(iOS 17.0, *)
struct FPTaskRows: View {
  let items: [FPJSON]
  let marks: FPMarks
  let now: Date
  let height: CGFloat
  let grouped: Bool

  var body: some View {
    let groups: [Int] = items.map { FPWhen.group($0["due"].string, now: now) }
    // Headings only when the tasks fall into more than one group.
    let headings: Bool = grouped && Set(groups).count > 1
    let shown: Int = FPGrid.fit(groups, height: height, headings: headings)
    VStack(alignment: .leading, spacing: FPGrid.gap) {
      ForEach(0..<shown, id: \.self) { index in
        if headings && (index == 0 || groups[index - 1] != groups[index]) {
          FPGroupHeading(title: FPWhen.groupTitle(groups[index]), late: groups[index] == 0)
        }
        // Under "Today" the day says nothing new.
        FPTaskRow(item: items[index], marks: marks, now: now, showsDue: !(headings && groups[index] == 1))
      }
    }
  }
}

@available(iOS 17.0, *)
struct FPTasksView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let list = FPTaskList(entry.data, marks: entry.marks, now: entry.date)
    let headline: String = list.open == 0 ? L("All done") : FPFormat.count("%d open", list.open)
    switch family {
    case .accessoryInline:
      if list.open == 0 {
        Label(L("All done"), systemImage: "checkmark.circle")
      } else if list.overdue > 0 {
        Text("\(headline) · \(FPFormat.count("%d overdue", list.overdue))")
      } else {
        Text(headline)
      }
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Text(String(list.open))
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .monospacedDigit()
            .minimumScaleFactor(0.5)
            .lineLimit(1)
            .widgetAccentable()
          if list.overdue > 0 {
            Label(String(list.overdue), systemImage: "exclamationmark.circle.fill")
              .font(.system(size: 10, weight: .semibold))
              .lineLimit(1)
          } else {
            Image(systemName: "checklist").font(.caption2)
          }
        }
      }
      .accessibilityLabel(list.overdue > 0 ? "\(headline), \(FPFormat.count("%d overdue", list.overdue))" : headline)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        (list.open == 0 ? Text(headline) : FPCounter.open(list.open, overdue: list.overdue))
          .font(.headline)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .widgetAccentable()
        ForEach(Array(list.items.prefix(2).enumerated()), id: \.offset) { _, item in
          Text(item["text"].text).font(.caption).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    default:
      let title: String = entry.data["title"].string ?? L("Tasks")
      FPCard(FPHeader(icon: "checklist", title: title, trailingText: list.open > 0 ? FPCounter.open(list.open, overdue: family == .systemSmall ? 0 : list.overdue) : nil)) { height in
        if list.items.isEmpty {
          FPEmpty(icon: "checkmark.circle", text: L("All done"), action: (L("New task"), FPLink.capture("task", target: nil)))
        } else {
          FPTaskRows(items: list.items, marks: entry.marks, now: entry.date, height: height, grouped: family.isLarge)
        }
      }
    }
  }
}

// MARK: - Today (the small size: the next appointment)

@available(iOS 17.0, *)
struct FPCalendarRow: View {
  let item: FPJSON
  let compact: Bool
  var join: URL? = nil
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  var body: some View {
    let task = item["type"].string == "task"
    HStack(spacing: 6) {
      Link(destination: FPLink.page(item["url"].string)) {
        HStack(spacing: 8) {
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
          .frame(width: compact ? 40 : 46, alignment: .leading)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          RoundedRectangle(cornerRadius: 1.5)
            .fill(task ? Color.secondary : palette.accent(scheme))
            .frame(width: 3, height: 14)
            .widgetAccentable()
          Text(item["title"].text).font(.subheadline).lineLimit(1)
          Spacer(minLength: 2)
          if !compact, join == nil, !item["calendar"].text.isEmpty {
            Text(item["calendar"].text).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
      .accessibilityElement(children: .combine)
      if let join {
        FPJoinButton(url: join, compact: true)
      }
    }
    .frame(height: FPGrid.row)
  }
}

/// "Join" for a video call: a link from medium up; in a small widget (no
/// links there) a button that opens the call on iOS 18 (FPJoinIntent).
@available(iOS 17.0, *)
struct FPJoinButton: View {
  let url: URL
  var compact = false
  var inSmall = false
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

  private var label: some View {
    Label(L("Join"), systemImage: "video.fill")
      .font((compact ? Font.caption : Font.subheadline).weight(.semibold))
      .lineLimit(1)
      .padding(.horizontal, compact ? 8 : 14)
      .frame(minHeight: compact ? FPGrid.row : 36)
      .foregroundStyle(Color.white)
      .background(palette.accent(scheme), in: Capsule())
      .widgetAccentable()
  }

  var body: some View {
    if inSmall {
      if #available(iOS 18.0, *) {
        Button(intent: FPJoinIntent(link: url.absoluteString)) { label }
          .buttonStyle(.plain)
          .accessibilityLabel(L("Join"))
      }
    } else {
      Link(destination: url) { label }
        .accessibilityLabel(L("Join"))
    }
  }
}

@available(iOS 17.0, *)
struct FPCalendarView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.fpProfile) private var profile

  /// Unread mentions (and new tasks for me), where the instance answered.
  private var unread: Int {
    let counts = entry.extras["mentions"]?["unread"] ?? FPJSON(nil)
    return (counts["mentions"].int ?? 0) + (counts["assignments"].int ?? 0)
  }

  /// The day, with the unread mentions in front of it.
  private var headerTrailing: Text {
    let day = Text(entry.date.formatted(.dateTime.weekday(.abbreviated).day()))
    guard unread > 0 else { return day }
    return Text(Image(systemName: "at")) + Text(verbatim: " \(unread)  ·  ") + day
  }

  /// The appointment of the next-appointment answer that is this row.
  private func join(for item: FPJSON, in events: [FPEvent]) -> URL? {
    guard item["timed"].bool, let start = item["start"].date else { return nil }
    return events.first { $0.title == item["title"].text && abs($0.start.timeIntervalSince(start)) < 60 }?.join
  }

  var body: some View {
    let items = entry.data["items"].array
    let events: [FPEvent] = FPEvent.list(entry.extras["event"], now: entry.date)
    let next = items.first { item in (item["end"].date ?? item["start"].date ?? .distantFuture) >= entry.date || !item["timed"].bool } ?? items.first
    switch family {
    case .accessoryInline:
      if let event = events.first, !event.allDay {
        Text("\(event.start, style: .time) \(event.title)")
      } else if let next, next["timed"].bool, let start = next["start"].date {
        Text("\(start, style: .time) \(next["title"].text)")
      } else {
        Text(next?["title"].text ?? L("Nothing scheduled"))
      }
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        if let event = events.first, !event.allDay {
          VStack(spacing: 0) {
            Image(systemName: "calendar").font(.caption2)
            Text(event.start, style: .time)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .monospacedDigit()
              .minimumScaleFactor(0.6)
              .lineLimit(1)
              .widgetAccentable()
          }
        } else {
          Image(systemName: "calendar").font(.title3)
        }
      }
      .accessibilityLabel(events.first.map { "\($0.title), \($0.when)" } ?? L("Nothing scheduled"))
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        if let event = events.first {
          FPCountdown(event: event, now: entry.date, font: .caption)
          Text(event.title).font(.headline).lineLimit(1).widgetAccentable()
          Text(event.when).font(.caption2).lineLimit(1)
        } else if let next {
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
    case .systemSmall:
      FPNextEventSmall(entry: entry, events: events, unread: unread)
    default:
      let header = FPHeader(icon: "calendar", title: entry.data["title"].string ?? L("Today"), trailingText: headerTrailing)
      FPCard(header) { height in
        if items.isEmpty {
          FPEmpty(icon: "sun.max", text: L("Nothing scheduled"))
        } else {
          // Several days: the day above its first entry.
          let days: [String] = items.map { $0["day"].text }
          let multi: Bool = Set(days).count > 1
          let groups: [Int] = days.map { day in days.firstIndex(of: day) ?? 0 }
          let shown: Int = FPGrid.fit(groups, height: height, headings: multi)
          VStack(alignment: .leading, spacing: FPGrid.gap) {
            ForEach(0..<shown, id: \.self) { index in
              if multi && (index == 0 || days[index - 1] != days[index]) {
                FPGroupHeading(title: FPFormat.day(days[index]).map { FPWhen.name($0, offset: FPWhen.days(from: entry.date, to: $0)) } ?? days[index])
              }
              FPCalendarRow(item: items[index], compact: false, join: items[index]["type"].string == "task" ? nil : join(for: items[index], in: events))
            }
          }
        }
      }
    }
  }
}

/// "Today" in small: the next appointment with its countdown and "Join";
/// without one what is still due today.
@available(iOS 17.0, *)
struct FPNextEventSmall: View {
  let entry: FPEntry
  let events: [FPEvent]
  let unread: Int

  var body: some View {
    let header = FPHeader(icon: "calendar.badge.clock", title: entry.data["title"].string ?? L("Today"), trailingText: unread > 0 ? Text(Image(systemName: "at")) + Text(verbatim: " \(unread)") : nil)
    if let next = events.first {
      VStack(alignment: .leading, spacing: 3) {
        header
        Spacer(minLength: 0)
        FPCountdown(event: next, now: entry.date, font: .title3.weight(.bold))
        Text(next.title).font(.headline).lineLimit(2).minimumScaleFactor(0.85)
        Text(next.when).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        if let join = next.join {
          FPJoinButton(url: join, compact: true, inSmall: true).padding(.top, 2)
        }
      }
    } else {
      let rest: Int = entry.data["items"].array.count
      VStack(alignment: .leading, spacing: 3) {
        header
        Spacer(minLength: 0)
        Image(systemName: "sun.max").font(.title2).foregroundStyle(.secondary).accessibilityHidden(true)
        Text(L("No appointments coming up")).font(.subheadline.weight(.medium)).foregroundStyle(.secondary).lineLimit(2)
        if rest > 0 {
          Text(FPFormat.count("%d due today", rest)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      }
    }
  }
}

// MARK: - Journal and habits

@available(iOS 17.0, *)
struct FPHabitRow: View {
  let habits: FPJSON
  let item: FPJSON
  let marks: FPMarks
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette
  @Environment(\.fpProfile) private var profile
  @Environment(\.fpReloadKind) private var reload

  var body: some View {
    let pageId: String = habits["id"].text
    let fieldId: String = item["fieldId"].text
    let id: String = FPActions.habitID(pageId: pageId, fieldId: fieldId)
    let stored: Bool = item["done"].bool
    // Tapped: the other state until the instance's next answer.
    let pending: Bool = marks.isPending(id)
    let done: Bool = pending ? !stored : stored
    let failed: Bool = !pending && marks.hasFailed(id)
    VStack(alignment: .leading, spacing: 0) {
      if habits["canWrite"].bool, !pageId.isEmpty, !fieldId.isEmpty {
        Toggle(isOn: done, intent: FPCheckHabitIntent(pageId: pageId, fieldId: fieldId, done: !done, profile: profile, widget: reload)) {
          HStack(spacing: 0) {
            Text(item["name"].text).font(.subheadline).lineLimit(1)
            Spacer(minLength: 0)
          }
        }
        .toggleStyle(FPCheckStyle(accent: palette.accent(scheme), showsLabel: true))
        .accessibilityLabel(item["name"].text)
        .accessibilityValue(done ? L("Done") : L("Open"))
        .invalidatableContent()
      } else {
        HStack(spacing: 6) {
          Image(systemName: done ? "checkmark.circle.fill" : "circle")
            .font(.body)
            .foregroundStyle(done ? AnyShapeStyle(palette.accent(scheme)) : AnyShapeStyle(.secondary))
            .widgetAccentable()
            .frame(width: 26, height: FPGrid.row)
          Text(item["name"].text).font(.subheadline).lineLimit(1)
          Spacer(minLength: 0)
        }
      }
      if failed {
        FPHint(text: L("Couldn’t check off – open in Flowplan"))
      }
    }
    .frame(minHeight: FPGrid.row)
  }
}

/// Done today, with the habits just tapped.
enum FPHabits {
  static func done(_ habits: FPJSON, marks: FPMarks) -> Int {
    let pageId: String = habits["id"].text
    var count: Int = habits["done"].int ?? 0
    for item in habits["items"].array {
      let id: String = FPActions.habitID(pageId: pageId, fieldId: item["fieldId"].text)
      if marks.isPending(id) { count += item["done"].bool ? -1 : 1 }
    }
    return max(0, count)
  }
}

@available(iOS 17.0, *)
struct FPJournalView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette

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
          .foregroundStyle(palette.accent(scheme))
          .widgetAccentable()
          .accessibilityHidden(true)
        Text(name).font(.headline).lineLimit(1)
        Text(journalLine).font(.caption).foregroundStyle(.secondary).lineLimit(2)
      }
    }
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private func habits(_ height: CGFloat) -> some View {
    let habits = entry.data["habits"]
    let closed = habits["locked"].bool || habits["encrypted"].bool
    if closed {
      Label(L(habits["locked"].bool ? "Locked" : "Encrypted"), systemImage: "lock.fill").font(.caption).foregroundStyle(.secondary)
    } else {
      let items = habits["items"].array
      let rows: Int = min(items.count, FPGrid.rows(height))
      VStack(alignment: .leading, spacing: FPGrid.gap) {
        ForEach(0..<rows, id: \.self) { index in
          FPHabitRow(habits: habits, item: items[index], marks: entry.marks)
        }
      }
    }
  }

  var body: some View {
    let hasJournal = !entry.data["journal"].isNull
    let hasHabits = !entry.data["habits"].isNull
    let habitsData = entry.data["habits"]
    let closed = habitsData["locked"].bool || habitsData["encrypted"].bool
    let counter: String = hasHabits && !closed ? "\(FPHabits.done(habitsData, marks: entry.marks))/\(habitsData["total"].int ?? 0)" : ""
    switch family {
    case .systemSmall:
      FPCard(FPHeader(icon: "book.closed", title: hasHabits ? (closed ? L("Habits") : habitsData["name"].text) : L("Journal"), trailing: counter)) { height in
        if hasHabits {
          habits(height)
        } else if hasJournal {
          VStack(alignment: .leading) {
            Spacer(minLength: 0)
            journal
          }
        }
      }
    default:
      FPCard(FPHeader(icon: "book.closed", title: entry.data["title"].string ?? L("Journal"), trailing: counter)) { height in
        HStack(alignment: .top, spacing: 14) {
          if hasJournal { journal.frame(maxWidth: hasHabits ? 120 : .infinity, alignment: .leading) }
          if hasHabits { habits(height) }
        }
      }
    }
  }
}

// MARK: - Time this week

@available(iOS 17.0, *)
struct FPTimeView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family
  @Environment(\.colorScheme) private var scheme
  @Environment(\.fpPalette) private var palette
  @Environment(\.fpProfile) private var profile

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

  /// When the timer runs: the instance's answer, or the tap on "Start"
  /// (until the next answer); not after a tap on "Stop".
  private var runningSince: Date? {
    if entry.marks.isPending(FPActions.timerStopID) { return nil }
    return entry.data["timer"]["start"].date ?? entry.marks.pending[FPActions.timerStartID]
  }

  @ViewBuilder private var timerRow: some View {
    let failed: Bool = entry.marks.hasFailed(FPActions.timerStartID) || entry.marks.hasFailed(FPActions.timerStopID)
    VStack(alignment: .leading, spacing: 2) {
      timerControls
      if failed {
        FPHint(text: L("Didn’t work – open Flowplan"))
      }
    }
  }

  @ViewBuilder private var timerControls: some View {
    let timer = entry.data["timer"]
    if let start = runningSince {
      let named: String? = timer["title"].string ?? timer["database"].string
      let title: String = named ?? startTarget?.title ?? L("Timer")
      HStack(spacing: 8) {
        Link(destination: FPLink.page(timer["url"].string)) {
          VStack(alignment: .leading, spacing: 0) {
            Text(start, style: .timer)
              .font(.headline.weight(.semibold))
              .monospacedDigit()
              .foregroundStyle(palette.accent(scheme))
              .widgetAccentable()
            Text(title).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
        Spacer(minLength: 4)
        Button(intent: FPStopTimerIntent(profile: profile)) {
          Image(systemName: "stop.fill").font(.caption.weight(.bold)).frame(width: 30, height: 30)
            .background(.fill.secondary, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L("Stop timer"))
      }
    } else if let target = startTarget {
      Button(intent: FPStartTimerIntent(pageId: target.pageId, rowId: target.rowId, fieldId: target.fieldId, profile: profile)) {
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
            .fill(today ? AnyShapeStyle(palette.accent(scheme)) : AnyShapeStyle(.fill.secondary))
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
      VStack(alignment: .leading, spacing: FPGrid.section) {
        FPHeader(icon: "timer", title: entry.data["title"].string ?? L("Time this week"), trailing: "\(L("Today")) \(today)")
        HStack(alignment: .bottom, spacing: 14) {
          VStack(alignment: .leading, spacing: 2) {
            FPBigNumber(value: week, size: 32)
            Text(L("This week")).font(.caption).foregroundStyle(.secondary)
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

// MARK: - Cards due

@available(iOS 17.0, *)
struct FPStudyView: View {
  let entry: FPEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    let due = entry.data["due"].int ?? 0
    let streak = entry.data["streak"].int ?? 0
    let decks = entry.data["decks"].array
    let title = entry.data["title"].string ?? L("Cards due")
    let label = due > 0 ? (decks.first?["title"].string ?? FPFormat.count("%d due", due)) : L("All studied for today")
    let detail = streak > 0 ? FPFormat.count("Streak: %d", streak) : ""
    switch family {
    case .accessoryInline:
      Label(due > 0 ? FPFormat.count("%d due", due) : L("All studied for today"), systemImage: "rectangle.on.rectangle.angled")
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 0) {
          Image(systemName: "rectangle.on.rectangle.angled").font(.caption2)
          Text(String(due)).font(.system(size: 20, weight: .bold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1).widgetAccentable()
        }
      }
      .accessibilityLabel("\(title): \(due)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 0) {
        Text(title).font(.caption).lineLimit(1)
        Text(String(due)).font(.title2.weight(.bold)).monospacedDigit().lineLimit(1).widgetAccentable()
        Text(label).font(.caption2).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    case .systemSmall:
      VStack(alignment: .leading, spacing: 2) {
        FPHeader(icon: "rectangle.on.rectangle.angled", title: title)
        Spacer(minLength: 0)
        FPBigNumber(value: String(due), size: 44)
        Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        if !detail.isEmpty { Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
      }
      .accessibilityElement(children: .combine)
    default:
      // Wider: the number and the decks with cards left (each opens its deck).
      FPCard(FPHeader(icon: "rectangle.on.rectangle.angled", title: title, trailing: detail)) { height in
        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 2) {
            FPBigNumber(value: String(due), size: 44)
            Text(due > 0 ? FPFormat.count("%d due", due) : L("All studied for today")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
          }
          .accessibilityElement(children: .combine)
          VStack(alignment: .leading, spacing: FPGrid.gap) {
            ForEach(Array(decks.prefix(FPGrid.rows(height)).enumerated()), id: \.offset) { _, deck in
              Link(destination: FPLink.page(deck["url"].string)) {
                HStack(spacing: 6) {
                  Text(deck["title"].text).font(.subheadline).lineLimit(1)
                  Spacer(minLength: 4)
                  Text(String(deck["due"].int ?? 0)).font(.caption.weight(.medium)).monospacedDigit().foregroundStyle(.secondary)
                }
                .frame(height: FPGrid.row)
              }
              .accessibilityElement(children: .combine)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }
}
