import AppIntents
import SwiftUI
import WidgetKit

// The configurable widgets (iOS 17: settings per widget, buttons) and the
// controls (iOS 18: Control Center, lock screen, Action button), added to
// the widget extension's bundle by plugins/with-widget-suite.js. Names and
// descriptions are keys of Localizable.strings.

@available(iOS 17.0, *)
struct FPCaptureWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanCapture", intent: FPCaptureConfiguration.self, provider: FPProvider<FPCaptureConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Quick capture")
    .description("Notes, tasks, voice memos and photos in one tap.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
  }
}

@available(iOS 17.0, *)
struct FPTasksWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanTaskList", intent: FPTasksConfiguration.self, provider: FPProvider<FPTasksConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Tasks")
    .description("Check off tasks right on the home screen.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
  }
}

@available(iOS 17.0, *)
struct FPCalendarWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanAgenda", intent: FPCalendarConfiguration.self, provider: FPProvider<FPCalendarConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Your appointments and what is due.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
  }
}

@available(iOS 17.0, *)
struct FPPinnedWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanPinned", intent: FPPinnedConfiguration.self, provider: FPProvider<FPPinnedConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Page and favorites")
    .description("Your favorites, or one page or database view.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

@available(iOS 17.0, *)
struct FPCounterWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanCounter", intent: FPCounterConfiguration.self, provider: FPProvider<FPCounterConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Database counter")
    .description("One number of a database, with its last 14 days.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
  }
}

@available(iOS 17.0, *)
struct FPJournalWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanJournal", intent: FPJournalConfiguration.self, provider: FPProvider<FPJournalConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Journal and habits")
    .description("Today's entry and your habits to check off.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

@available(iOS 17.0, *)
struct FPTimeWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanTime", intent: FPTimeConfiguration.self, provider: FPProvider<FPTimeConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Time this week")
    .description("Hours this week; start and stop the timer.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}

@available(iOS 17.0, *)
struct FPMentionsWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanMentions", intent: FPMentionsConfiguration.self, provider: FPProvider<FPMentionsConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Mentions")
    .description("Who mentioned you; mark as read right away.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
  }
}

@available(iOS 17.0, *)
struct FPFormsWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "FlowplanForms", intent: FPFormsConfiguration.self, provider: FPProvider<FPFormsConfiguration>()) { entry in
      FPSuiteView(entry: entry)
    }
    .configurationDisplayName("Form responses")
    .description("New responses to one of your forms.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
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
      FPCaptureWidget()
      FPTasksWidget()
      FPCalendarWidget()
      FPPinnedWidget()
      FPCounterWidget()
      FPJournalWidget()
      FPTimeWidget()
      FPMentionsWidget()
      FPFormsWidget()
    }
    if #available(iOS 18.0, *) {
      FPNoteControl()
      FPVoiceControl()
      FPFocusControl()
      FPTimerControl()
    }
  }
}
