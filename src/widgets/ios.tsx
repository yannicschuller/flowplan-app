// iOS: the home screen and lock screen widgets and the running timer as Live
// Activity (lock screen, Dynamic Island), written with Expo UI (SwiftUI) and
// rendered by expo-widgets. The functions marked 'widget' are stored as text
// and run in the widget's own small runtime: they may only use their props,
// the environment and Expo UI – no other code of the app. The texts come
// finished from summary.ts.
import { Chart, Gauge, HStack, Image, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, createWidget, type LiveActivityEnvironment, type WidgetEnvironment } from "expo-widgets";
import type { Locale } from "../i18n";
import {
  adminLiveWidget as liveProps,
  adminStatusWidget as statusProps,
  adminStorageWidget as storageProps,
  sampleAdminSummary,
  type AdminLiveProps,
  type AdminStatusProps,
  type AdminStorageProps,
} from "../admin";
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


// ---- Administrators (admin.ts): the instance's state, live numbers and
// storage. Everyone else sees "Administrators only".

// State: all fine / notices / problems with the first one, version and
// update, the last backup.
function FlowplanInstance(props: AdminStatusProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const brand = "#4146e6";
  const background = environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="server.rack" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const closed = props.state === "signedOut" || props.state === "notAdmin";
  const tone = props.state === "problem" ? "#d14343" : props.state === "notice" ? "#c27c0e" : props.state === "ok" ? "#2f855a" : brand;
  const icon =
    props.state === "problem" ? "xmark.octagon.fill" : props.state === "notice" ? "exclamationmark.triangle.fill" : props.state === "ok" ? "checkmark.seal.fill" : "lock.fill";
  if (family === "accessoryInline")
    return <Text modifiers={[widgetURL(props.url)]}>{closed ? props.message : props.detail ? `${props.headline} · ${props.detail}` : props.headline}</Text>;
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <HStack spacing={4}>
          <Image systemName={icon} modifiers={[font({ textStyle: "caption" })]} />
          <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.title}</Text>
        </HStack>
        <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{closed ? props.message : props.headline}</Text>
        {!closed ? <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.detail || props.backup}</Text> : null}
      </VStack>
    );
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={6}>
        <Image systemName="server.rack" modifiers={[foregroundStyle(brand), font({ size: 13, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
        <Spacer />
        {!closed && family !== "systemSmall" ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.version}</Text>
        ) : null}
      </HStack>
      {closed ? <Spacer /> : null}
      {closed ? (
        <Text modifiers={[font({ size: 15, weight: "medium" }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(3)]}>{props.message}</Text>
      ) : (
        <HStack spacing={6}>
          <Image systemName={icon} modifiers={[foregroundStyle(tone), font({ size: 17, weight: "semibold" })]} />
          <Text modifiers={[font({ size: family === "systemSmall" ? 16 : 18, weight: "bold" }), lineLimit(1)]}>{props.headline}</Text>
        </HStack>
      )}
      {!closed && props.detail ? <Text modifiers={[font({ size: 12 }), lineLimit(2)]}>{props.detail}</Text> : null}
      {!closed && props.more && family !== "systemSmall" ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.more}</Text>
      ) : null}
      {!closed ? <Spacer /> : null}
      {!closed && props.update ? <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(brand), lineLimit(1)]}>{props.update}</Text> : null}
      {!closed ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(props.backupLate ? "#d14343" : { type: "hierarchical", style: "secondary" }), lineLimit(1)]}>{props.backup}</Text>
      ) : null}
    </VStack>
  );
}

// Live numbers: active people, requests per minute, error rate, sign-ins
// today; the requests of the last 24 hours as a line from medium up.
function FlowplanLive(props: AdminLiveProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemMedium";
  const brand = "#4146e6";
  const background = environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="waveform.path.ecg" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const open = props.state === "data";
  const tiles = open ? props.tiles : [];
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.title}</Text>
        {open ? (
          tiles.slice(0, 3).map((tile, index) => (
            <Text key={index} modifiers={[font({ textStyle: index === 0 ? "headline" : "caption" }), lineLimit(1), monospacedDigit()]}>{`${tile.value} ${tile.label}`}</Text>
          ))
        ) : (
          <Text modifiers={[font({ textStyle: "headline" }), lineLimit(2)]}>{props.message}</Text>
        )}
      </VStack>
    );
  const shown = family === "systemSmall" ? tiles.slice(0, 2) : tiles;
  const chart = open && family !== "systemSmall" && props.spark.length > 0;
  const tile = (index: number) => (
    <VStack key={index} alignment="leading" spacing={0}>
      <Text
        modifiers={[
          font({ size: family === "systemLarge" ? 26 : 20, weight: "bold", design: "rounded" }),
          monospacedDigit(),
          lineLimit(1),
          ...(index === 2 && props.errorsHigh ? [foregroundStyle("#d14343")] : []),
        ]}
      >
        {shown[index].value}
      </Text>
      <Text modifiers={[font({ size: 10 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>{shown[index].label}</Text>
    </VStack>
  );
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={6}>
        <Image systemName="waveform.path.ecg" modifiers={[foregroundStyle(brand), font({ size: 13, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
      </HStack>
      {!open ? <Spacer /> : null}
      {!open ? (
        <Text modifiers={[font({ size: 15, weight: "medium" }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(3)]}>{props.message}</Text>
      ) : family === "systemLarge" ? (
        <VStack alignment="leading" spacing={10}>
          <HStack spacing={12}>
            {tile(0)}
            <Spacer />
            {tile(1)}
            <Spacer />
          </HStack>
          <HStack spacing={12}>
            {tile(2)}
            <Spacer />
            {tile(3)}
            <Spacer />
          </HStack>
        </VStack>
      ) : (
        <HStack spacing={10}>
          {shown.map((_, index) => tile(index))}
          <Spacer />
        </HStack>
      )}
      {chart ? (
        <Chart
          type="area"
          data={props.spark.map((y, x) => ({ x, y }))}
          showGrid={false}
          animate={false}
          areaStyle={{ color: brand }}
          modifiers={[frame({ height: family === "systemLarge" ? 110 : 40 })]}
        />
      ) : null}
      {chart && family === "systemLarge" ? (
        <Text modifiers={[font({ size: 10 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.sparkLabel}</Text>
      ) : null}
      <Spacer />
    </VStack>
  );
}

// Storage: database and files, the disk, the fullest workspace's quota.
function FlowplanStorage(props: AdminStorageProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const brand = "#4146e6";
  const late = "#d14343";
  const background = environment.colorScheme === "dark" ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="internaldrive" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const open = props.state === "data";
  if (family === "accessoryCircular") {
    const share = props.disk >= 0 ? props.disk : props.quota;
    return share >= 0 && open ? (
      <Gauge
        value={share}
        currentValueLabel={<Text modifiers={[monospacedDigit()]}>{String(Math.round(share * 100))}</Text>}
        modifiers={[widgetURL(props.url), gaugeStyle("circularCapacity"), containerBackground({ type: "material", material: "thin" }, "widget")]}
      >
        <Image systemName="internaldrive" />
      </Gauge>
    ) : (
      <VStack spacing={0} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Image systemName={open ? "internaldrive" : "lock.fill"} modifiers={[font({ size: 18 })]} />
      </VStack>
    );
  }
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{open ? props.used : props.message}</Text>
        {open ? <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.diskLabel || props.quotaLabel}</Text> : null}
      </VStack>
    );
  const meter = (share: number, label: string) => (
    <VStack alignment="leading" spacing={3}>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(share >= 0.9 ? late : { type: "hierarchical", style: "secondary" }), lineLimit(1)]}>{label}</Text>
      {share >= 0 ? <ProgressView value={share} modifiers={[tint(share >= 0.9 ? late : brand)]} /> : null}
    </VStack>
  );
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={6}>
        <Image systemName="internaldrive" modifiers={[foregroundStyle(brand), font({ size: 13, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
      </HStack>
      {!open ? <Spacer /> : null}
      {!open ? (
        <Text modifiers={[font({ size: 15, weight: "medium" }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(3)]}>{props.message}</Text>
      ) : null}
      {open ? <Text modifiers={[font({ size: 24, weight: "bold", design: "rounded" }), lineLimit(1)]}>{props.used}</Text> : null}
      {open ? <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.usedLabel}</Text> : null}
      {open ? <Spacer /> : null}
      {open && props.disk >= 0 ? meter(props.disk, props.diskLabel) : null}
      {open ? meter(family === "systemSmall" && props.disk >= 0 ? -1 : props.quota, props.quotaLabel) : null}
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
  const admin = { kind: "data" as const, data: sampleAdminSummary() };
  return {
    tasks: widgetProps(tasksProps(summary, lang)),
    inbox: widgetProps(inboxProps(summary, lang)),
    status: widgetProps(statusProps(admin, lang)),
    live: widgetProps(liveProps(admin, lang)),
    storage: widgetProps(storageProps(admin, lang)),
  };
};
const english = samples("en");
export let tasksWidget = createWidget<TasksWidgetProps>("FlowplanTasks", FlowplanTasks, english.tasks);
export let inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, english.inbox);
export let adminStatusWidget = createWidget<AdminStatusProps>("FlowplanInstance", FlowplanInstance, english.status);
export let adminLiveWidget = createWidget<AdminLiveProps>("FlowplanLive", FlowplanLive, english.live);
export let adminStorageWidget = createWidget<AdminStorageProps>("FlowplanStorage", FlowplanStorage, english.storage);
let samplesLocale: Locale = "en";
export function localizeSamples(lang: Locale) {
  if (lang === samplesLocale) return;
  samplesLocale = lang;
  const sample = samples(lang);
  tasksWidget = createWidget<TasksWidgetProps>("FlowplanTasks", FlowplanTasks, sample.tasks);
  inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, sample.inbox);
  adminStatusWidget = createWidget<AdminStatusProps>("FlowplanInstance", FlowplanInstance, sample.status);
  adminLiveWidget = createWidget<AdminLiveProps>("FlowplanLive", FlowplanLive, sample.live);
  adminStorageWidget = createWidget<AdminStorageProps>("FlowplanStorage", FlowplanStorage, sample.storage);
}
export const timerActivity = createLiveActivity<TimerProps>("FlowplanTimer", FlowplanTimer);
