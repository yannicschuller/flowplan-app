import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import { registerWidgetConfigurationScreen, registerWidgetTaskHandler } from "react-native-android-widget";
import App from "./src/App";
import { defineBackgroundRefresh } from "./src/native/background";
import { widgetTaskHandler } from "./src/native/widget-task";
import { WidgetConfigScreen } from "./src/screens/WidgetConfig";

// Background work is defined before the UI: the system may start the app
// only for it (widget refresh, background refresh).
defineBackgroundRefresh();
if (Platform.OS === "android") {
  registerWidgetTaskHandler(widgetTaskHandler);
  // The settings of a configurable widget (added, or "Configure").
  registerWidgetConfigurationScreen(WidgetConfigScreen);
}

registerRootComponent(App);
