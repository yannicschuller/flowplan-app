// iOS: the home screen and lock screen widgets and the running timer as Live
// Activity (lock screen, Dynamic Island), written with Expo UI (SwiftUI) and
// rendered by expo-widgets. The functions marked 'widget' are stored as text
// and run in the widget's own small runtime: they may only use their props,
// the environment and Expo UI – no other code of the app. The texts come
// finished from summary.ts.
import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, createWidget, type LiveActivityEnvironment, type WidgetEnvironment } from "expo-widgets";
import type { Locale } from "../i18n";
import { inboxWidget as inboxProps, sampleSummary, tasksWidget as tasksProps, widgetProps, type InboxWidgetProps, type TasksWidgetProps, type TimerProps } from "../summary";

// Tasks due, the inbox and the running timer.
function FlowplanTasks(props: TasksWidgetProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemMedium";
  const brand = "#4146e6";
  const late = "#d14343";
  const background = environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8";
  // Nothing stored yet (the app has not run since it was installed): the
  // name instead of an empty widget or an error.
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="checklist" modifiers={[foregroundStyle(brand), font({ size: 15, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  if (family === "accessoryInline")
    return <Text modifiers={[widgetURL(props.url)]}>{props.signedIn ? `${props.headline} · ${props.unreadLabel}` : props.headline}</Text>;
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{props.headline}</Text>
        {props.items.slice(0, 2).map((item, index) => (
          <Text key={index} modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>
            {item.text}
          </Text>
        ))}
      </VStack>
    );
  const rows = family === "systemExtraLarge" ? 8 : family === "systemLarge" ? 7 : family === "systemMedium" ? 3 : 2;
  const items = props.items.slice(0, rows);
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={6}>
        <Image systemName="checklist" modifiers={[foregroundStyle(brand), font({ size: 13, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
        <Spacer />
        {props.signedIn && family !== "systemSmall" ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.unreadLabel}</Text>
        ) : null}
      </HStack>
      <Text modifiers={[font({ size: family === "systemSmall" ? 20 : 17, weight: "bold" }), lineLimit(1)]}>{props.headline}</Text>
      {props.detail ? <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(late)]}>{props.detail}</Text> : null}
      {props.signedIn && !items.length ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.empty}</Text>
      ) : null}
      {items.map((item, index) => (
        <HStack key={index} spacing={6}>
          <Image systemName="circle" modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "tertiary" })]} />
          <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{item.text}</Text>
          <Spacer />
          {item.due && family !== "systemSmall" ? (
            <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(item.late ? late : { type: "hierarchical", style: "secondary" })]}>{item.due}</Text>
          ) : null}
        </HStack>
      ))}
      <Spacer />
      {props.timer && family !== "systemSmall" ? (
        <HStack spacing={6}>
          <Image systemName="timer" modifiers={[foregroundStyle(brand), font({ size: 12 })]} />
          <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{props.timer.title}</Text>
          <Spacer />
          <Text date={new Date(props.timer.start)} dateStyle="timer" modifiers={[font({ size: 12, weight: "semibold" }), monospacedDigit(), foregroundStyle(brand)]} />
        </HStack>
      ) : null}
    </VStack>
  );
}

// Unread notifications.
function FlowplanInbox(props: InboxWidgetProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const brand = "#4146e6";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8", "widget")]}>
        <Image systemName="tray.fill" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  if (family === "accessoryInline") return <Text modifiers={[widgetURL(props.url)]}>{props.label}</Text>;
  if (family === "accessoryCircular")
    return (
      <VStack spacing={0} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Image systemName="tray" modifiers={[font({ size: 12 })]} />
        <Text modifiers={[font({ size: 20, weight: "bold" }), monospacedDigit()]}>{String(props.count)}</Text>
      </VStack>
    );
  const background = environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8";
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={6}>
        <Image systemName="tray.fill" modifiers={[foregroundStyle(brand), font({ size: 13 })]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
      </HStack>
      <Spacer />
      {props.signedIn ? (
        <Text modifiers={[font({ size: 44, weight: "bold", design: "rounded" }), monospacedDigit()]}>{String(props.count)}</Text>
      ) : null}
      <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(2)]}>{props.label}</Text>
    </VStack>
  );
}

// The running timer on the lock screen and in the Dynamic Island.
function FlowplanTimer(props: TimerProps, environment: LiveActivityEnvironment) {
  "widget";
  const brand = "#6f74ff";
  const since = new Date(props.start);
  const clock = (size: number) => (
    <Text
      date={since}
      dateStyle="timer"
      modifiers={[font({ size, weight: "semibold" }), monospacedDigit(), foregroundStyle(brand), frame({ maxWidth: 76 })]}
    />
  );
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 }), activityBackgroundTint(environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8")]}>
        <Image systemName="timer" modifiers={[font({ size: 22 }), foregroundStyle(brand)]} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
            {props.database || props.label}
          </Text>
        </VStack>
        <Spacer />
        {clock(26)}
      </HStack>
    ),
    compactLeading: <Image systemName="timer" modifiers={[foregroundStyle(brand)]} />,
    compactTrailing: clock(14),
    minimal: <Image systemName="timer" modifiers={[foregroundStyle(brand)]} />,
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName="timer" modifiers={[foregroundStyle(brand)]} />
        <Text modifiers={[font({ size: 13, weight: "medium" })]}>{props.label}</Text>
      </HStack>
    ),
    expandedTrailing: clock(18),
    expandedBottom: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
        {props.database ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>{props.database}</Text>
        ) : null}
      </VStack>
    ),
  };
}

// The widget gallery and the placeholder show made-up tasks (initial props;
// the real timeline replaces them once the app has written one). Created
// again in the person's language once the app knows it (samples below).
const samples = (lang: Locale) => {
  const summary = sampleSummary(lang);
  return { tasks: widgetProps(tasksProps(summary, lang)), inbox: widgetProps(inboxProps(summary, lang)) };
};
export let tasksWidget = createWidget<TasksWidgetProps>("FlowplanTasks", FlowplanTasks, samples("en").tasks);
export let inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, samples("en").inbox);
let samplesLocale: Locale = "en";
export function localizeSamples(lang: Locale) {
  if (lang === samplesLocale) return;
  samplesLocale = lang;
  const { tasks, inbox } = samples(lang);
  tasksWidget = createWidget<TasksWidgetProps>("FlowplanTasks", FlowplanTasks, tasks);
  inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, inbox);
}
export const timerActivity = createLiveActivity<TimerProps>("FlowplanTimer", FlowplanTimer);
