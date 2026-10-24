import AppIntents
import SwiftUI
import WidgetKit

// Controls (iOS 18: Control Center, lock screen, Action button) next to the
// widget suite's "New note", "Voice memo", "Start focus" and "Timer": quick
// capture and today's tasks, both opening the app at that screen (the web
// app's #capture and #tasks). plugins/with-intents.js adds the bundle to the
// widget extension's index.swift; FPOpenAppIntent, FPWidgets and L() come
// from the widget suite in the same extension.

@available(iOS 18.0, *)
struct FPCaptureControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.capture") {
      ControlWidgetButton(action: FPOpenAppIntent(link: "flowplan://open?path=%2F%23capture")) {
        Label("Quick capture", systemImage: "tray.and.arrow.down")
      }
    }
    .displayName("Quick capture")
    .description("Opens the quick capture of Flowplan.")
  }
}

/// How many tasks are due today (-1: not known, signed out or offline).
@available(iOS 18.0, *)
struct FPTodayTasksValue: ControlValueProvider {
  var previewValue: Int { 3 }

  func currentValue() async throws -> Int {
    guard let data = try? await FPWidgets.fresh("tasks", ["source": "mine", "filter": "today", "max": 1]) else { return -1 }
    return data["total"].int ?? -1
  }
}

enum FPTodayTasksLabel {
  static func text(_ count: Int) -> String {
    if count > 0 { return String(format: L("%d due today"), count) }
    return L("Today's tasks")
  }
}

@available(iOS 18.0, *)
struct FPTodayControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "app.flowplan.control.today", provider: FPTodayTasksValue()) { count in
      ControlWidgetButton(action: FPOpenAppIntent(link: "flowplan://open?path=%2F%23tasks")) {
        Label(FPTodayTasksLabel.text(count), systemImage: "checklist")
      }
    }
    .displayName("Today's tasks")
    .description("Opens your tasks in Flowplan.")
  }
}

/// Added to the bundle of expo-widgets' extension (index.swift), after the
/// widget suite's.
struct FlowplanIntentControls: WidgetBundle {
  var body: some Widget {
    if #available(iOS 18.0, *) {
      FPCaptureControl()
      FPTodayControl()
    }
  }
}
