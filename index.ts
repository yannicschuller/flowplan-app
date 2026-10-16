import { Platform } from "react-native";
import { registerRootComponent } from "expo";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import App from "./src/App";
import { defineBackgroundRefresh } from "./src/native/background";
import { widgetTaskHandler } from "./src/native/widget-task";

// Background work is defined before the UI: the system may start the app
// only for it (widget refresh, background refresh).
defineBackgroundRefresh();
if (Platform.OS === "android") registerWidgetTaskHandler(widgetTaskHandler);

registerRootComponent(App);
