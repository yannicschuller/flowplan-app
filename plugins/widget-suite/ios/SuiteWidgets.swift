import AppIntents
import os
import SwiftUI
import WidgetKit

// The configurable widgets (iOS 17: settings per widget, buttons) and the
// controls (iOS 18: Control Center, lock screen, Action button), added to
// the widget extension's bundle by plugins/with-widget-suite.js. Names and
// descriptions are keys of Localizable.strings.
//
// Where they appear (fpPlatform): iPhone widgets also show on the Mac
// (macOS 14+, same Apple Account) and – the small ones, iOS 26 – in CarPlay.
// Widgets that make sense in the car (today, tasks, next appointment,
// deadline) stay there; the others are marked "not for the car" (CarPlay
// lists them under "Other", without buttons). Quick capture opens the
// iPhone's camera and microphone and is not offered on the Mac. On iOS 26
// every widget takes WidgetKit pushes (FPWidgetPushHandler).
//
// Fewer widgets (2026): "Key figure" takes a database or a dashboard as its
// source, "Pages" shows the favorites, what was opened last or one page,
// "Today" is the next appointment in its small size, "My day" brings
// appointments, tasks and habits together. WidgetKit cannot move a widget on
// someone's screen to another kind, and it has no way to keep a kind out of
// the gallery while its widgets on screens keep working (a kind that is no
// longer in the bundle disappears from every screen). So the merged ones
// stay as they were – kind, settings (intent type) and sizes – marked "old"
// in the gallery and drawn like the widget they were merged into:
// FlowplanCounter (→ Key figure), FlowplanReading (→ Pages), FlowplanNextEvent
// (→ Today). Form responses and Mentions are gone; "Today" counts the unread
// mentions instead. Android hides the old ones from its picker
// (hide_from_picker) and keeps those on screens working.

/// WidgetKit's push token for the widgets (iOS 26): kept in the App Group;
/// the app registers it with the push relay for every profile's instance
/// (src/native/widget-push.ts), which then pushes a reload when something
/// changes. The push carries nothing: the widgets ask the instance as on any
/// reload.
@available(iOS 26.0, *)
struct FPWidgetPushHandler: WidgetPushHandler {
  func pushTokenDidChange(_ pushInfo: WidgetPushInfo, widgets: [WidgetInfo]) {
    FPWidgetPush.save(pushInfo.token)
    os_log("Widget push token changed (%ld widgets)", log: FPLog.widgets, type: .default, widgets.count)
  }
}

/// Where a widget is offered besides the Home and Lock Screen.
struct FPPlaces {
  var carPlay = false
  var mac = true

  @available(iOS 17.0, *)
  var notOnMac: [WidgetLocation] { mac ? [] : [.iPhoneWidgetsOnMac] }

  /// Small widgets: also CarPlay (iOS 26), unless the widget is for the car.
  @available(iOS 26.0, *)
  var awaySmall: [WidgetLocation] { notOnMac + (carPlay ? [] : [.carPlay]) }

  static func small(_ families: [WidgetFamily]) -> [WidgetFamily] { families.filter { $0 == .systemSmall } }
  static func others(_ families: [WidgetFamily]) -> [WidgetFamily] { families.filter { $0 != .systemSmall } }
}

@available(iOS 17.0, *)
extension WidgetConfiguration {
  /// The Mac and CarPlay (iOS 26: also the push handler). The configuration
  /// type differs per iOS version: an opaque result may depend on #available
  /// (SE-0360), with one return per branch.
  func fpPlatform(_ places: FPPlaces, families: [WidgetFamily]) -> some WidgetConfiguration {
    if #available(iOS 26.0, *) {
      return self
        .disfavoredLocations(places.notOnMac, for: FPPlaces.others(families))
        .disfavoredLocations(places.awaySmall, for: FPPlaces.small(families))
        .pushHandler(FPWidgetPushHandler.self)
    } else {
      return self
        .disfavoredLocations(places.notOnMac, for: families)
    }
  }
}

@available(iOS 17.0, *)
struct FPCaptureWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .accessoryCircular]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanCapture", intent: FPCaptureConfiguration.self, provider: FPProvider<FPCaptureConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Quick capture")
    .description("Notes, tasks, voice memos and photos in one tap.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(carPlay: false, mac: false), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPTasksWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanTaskList", intent: FPTasksConfiguration.self, provider: FPProvider<FPTasksConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Tasks")
    .description("Check off tasks right on the home screen.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(carPlay: true), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPCalendarWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanAgenda", intent: FPCalendarConfiguration.self, provider: FPProvider<FPCalendarConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Your appointments and what is due; small: the next one with a countdown.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(carPlay: true), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPPinnedWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanPinned", intent: FPPinnedConfiguration.self, provider: FPProvider<FPPinnedConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Pages")
    .description("Your favorites, what you opened last, or one page or database view.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPCounterWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanCounter", intent: FPCounterConfiguration.self, provider: FPProvider<FPCounterConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Database counter (old)")
    .description("Now part of “Key figure”. Widgets already added keep working.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPJournalWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanJournal", intent: FPJournalConfiguration.self, provider: FPProvider<FPJournalConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Journal and habits")
    .description("Today's entry and your habits to check off.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPTimeWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanTime", intent: FPTimeConfiguration.self, provider: FPProvider<FPTimeConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Time this week")
    .description("Hours this week; start and stop the timer.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

// "Karten fällig" (#352): was an expo-widgets widget of the same kind
// without settings; widgets already on a screen keep their place and count
// all decks until decks are chosen.
@available(iOS 17.0, *)
struct FPStudyWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanStudy", intent: FPStudyConfiguration.self, provider: FPProvider<FPStudyConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Flowplan Cards due")
    .description("Flashcards to study today.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

// Widgets 2026: key figure, deadline; the next appointment and continue
// reading are old ones now (see the top).

@available(iOS 17.0, *)
struct FPEventWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanNextEvent", intent: FPEventConfiguration.self, provider: FPProvider<FPEventConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Next appointment (old)")
    .description("Now the small “Today”. Widgets already added keep working.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(carPlay: true), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPReadingWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanReading", intent: FPReadingConfiguration.self, provider: FPProvider<FPReadingConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Continue reading (old)")
    .description("Now part of “Pages”. Widgets already added keep working.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPMetricWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanMetric", intent: FPMetricConfiguration.self, provider: FPProvider<FPMetricConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Key figure")
    .description("A number of a database or dashboard, with its trend.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPDeadlineWidget: Widget {
  static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanDeadline", intent: FPDeadlineConfiguration.self, provider: FPProvider<FPDeadlineConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Deadline")
    .description("Counts down to one task or record.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(carPlay: true), families: Self.families)
  }
}

@available(iOS 17.0, *)
struct FPMyDayWidget: Widget {
  static let families: [WidgetFamily] = [.systemMedium, .systemLarge]

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanMyDay", intent: FPMyDayConfiguration.self, provider: FPProvider<FPMyDayConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("My day")
    .description("Today's appointments, what is due and your habits – check off right here.")
    .supportedFamilies(Self.families)
    .fpPlatform(FPPlaces(), families: Self.families)
  }
}

// MARK: - Controls

@available(iOS 18.0, *)
struct FPNoteControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.note") {
      ControlWidgetButton(action: FPOpenAppIntent(link: "flowplan://capture?mode=note")) {
        Label("New note", systemImage: "square.and.pencil")
      }
    }
    .displayName("New note")
    .description("Opens Flowplan to write a note.")
  }
}

@available(iOS 18.0, *)
struct FPVoiceControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.voice") {
      ControlWidgetButton(action: FPOpenAppIntent(link: "flowplan://capture?mode=voice")) {
        Label("Voice memo", systemImage: "mic.fill")
      }
    }
    .displayName("Voice memo")
    .description("Records a voice memo into Flowplan.")
  }
}

@available(iOS 18.0, *)
struct FPFocusControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.focus") {
      ControlWidgetButton(action: FPOpenAppIntent(link: "flowplan://do?action=focus.start")) {
        Label("Start focus", systemImage: "scope")
      }
    }
    .displayName("Start focus")
    .description("25 minutes of focus, then a break.")
  }
}

@available(iOS 18.0, *)
struct FPTimerControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.timer", provider: FPTimerValue()) { running in
      ControlWidgetToggle("Timer", isOn: running, action: FPToggleTimerIntent()) { isOn in
        Label(isOn ? LocalizedStringKey("Running") : LocalizedStringKey("Stopped"), systemImage: "timer")
      }
    }
    .displayName("Timer")
    .description("Starts your most recent timer or stops the running one.")
  }
}

/// Added to the bundle of expo-widgets' extension (index.swift).
struct FlowplanSuiteWidgets: WidgetBundle {
  var body: some Widget {
    if #available(iOS 17.0, *) {
      FPMyDayWidget()
      FPTasksWidget()
      FPCalendarWidget()
      FPPinnedWidget()
      FPMetricWidget()
      FPJournalWidget()
      FPTimeWidget()
      FPStudyWidget()
      FPDeadlineWidget()
      FPCaptureWidget()
      // The old ones, for the screens they are on (see the top).
      FPCounterWidget()
      FPReadingWidget()
      FPEventWidget()
    }
    if #available(iOS 18.0, *) {
      FPNoteControl()
      FPVoiceControl()
      FPFocusControl()
      FPTimerControl()
    }
  }
}
