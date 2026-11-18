// iOS: the home screen and lock screen widgets and the running timer as Live
// Activity (lock screen, Dynamic Island), written with Expo UI (SwiftUI) and
// rendered by expo-widgets. The functions marked 'widget' are stored as text
// and run in the widget's own small runtime: they may only use their props,
// the environment and Expo UI – no other code of the app. The texts come
// finished from summary.ts.
import { Button, Chart, Gauge, HStack, Image, Link, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, createWidget, type WidgetEnvironment } from "expo-widgets";
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
import type { FocusProps, IncidentProps, JobsProps, MeetingProps, RecordingProps } from "../activities";
import { inboxWidget as inboxProps, sampleSummary, tasksWidget as tasksProps, widgetProps, type InboxWidgetProps, type TasksWidgetProps, type TimerProps } from "../summary";

// Settings of the widgets below (iOS 17: long press → Edit Widget; the
// values come in environment.configuration, app.config.ts declares them).
export type TasksConfig = { show?: string; timer?: boolean };
export type InstanceConfig = { show?: string };
export type LiveConfig = { metric?: string };
export type StorageConfig = { metric?: string };
// The overview ("Übersicht"; kind FlowplanTasks so placed widgets stay): tasks
// due – and, if chosen, the inbox and the running timer. Checking off is the
// suite's "Tasks" widget (plugins/widget-suite/ios).
function FlowplanTasks(props: TasksWidgetProps, environment: WidgetEnvironment<TasksConfig>) {
  "widget";
  const family = environment.widgetFamily || "systemMedium";
  const dark = environment.colorScheme === "dark";
  const accented = environment.widgetRenderingMode === "accented";
  const brand = accented ? { type: "hierarchical" as const, style: "primary" as const } : dark ? "#8f93ff" : "#4146e6";
  const late = accented ? { type: "hierarchical" as const, style: "primary" as const } : "#d14343";
  const secondary = { type: "hierarchical" as const, style: "secondary" as const };
  const background = dark ? "#16151b" : "#fcfbf8";
  const inbox = environment.configuration?.show !== "tasks";
  const timer = environment.configuration?.timer !== false;
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="rectangle.grid.1x2" modifiers={[foregroundStyle(brand), font({ size: 15, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  if (family === "accessoryInline")
    return <Text modifiers={[widgetURL(props.url)]}>{props.signedIn && inbox ? `${props.headline} · ${props.unreadLabel}` : props.headline}</Text>;
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
  // Signed out (or the session ended): say so, and where to go.
  if (!props.signedIn)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
        <HStack spacing={5}>
          <Image systemName="rectangle.grid.1x2" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
        </HStack>
        <Spacer />
        <Image systemName="person.crop.circle.badge.exclamationmark" modifiers={[font({ size: 22 }), foregroundStyle(secondary)]} />
        <Text modifiers={[font({ size: 14, weight: "medium" }), foregroundStyle(secondary), lineLimit(3)]}>{props.headline}</Text>
      </VStack>
    );
  // Each row starts with a dot, not a circle: the rows open their task's
  // page, they do not check off (the suite's "Tasks" widget does). Links per
  // row from medium up; a small widget opens only its one link.
  const rows = family === "systemExtraLarge" ? 8 : family === "systemLarge" ? 7 : family === "systemMedium" ? 3 : 2;
  const items = props.items.slice(0, rows);
  const small = family === "systemSmall";
  // Explicit colours: a link would tint its text otherwise.
  const row = (item: TasksWidgetProps["items"][number], index: number) => (
    <HStack key={index} spacing={6}>
      <Image systemName="circle.fill" modifiers={[font({ size: 5 }), foregroundStyle({ type: "hierarchical", style: "tertiary" })]} />
      <Text modifiers={[font({ size: 13 }), foregroundStyle({ type: "hierarchical", style: "primary" }), lineLimit(1)]}>{item.text}</Text>
      <Spacer />
      {item.due && !small ? (
        <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(item.late ? late : secondary), lineLimit(1)]}>{item.due}</Text>
      ) : null}
    </HStack>
  );
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={5}>
        <Image systemName="rectangle.grid.1x2" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand), lineLimit(1)]}>{props.title}</Text>
        <Spacer />
        {inbox && !small ? (
          <HStack spacing={3}>
            <Image systemName="tray" modifiers={[font({ size: 11 }), foregroundStyle(secondary)]} />
            <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(secondary), monospacedDigit()]}>{String(props.unread)}</Text>
          </HStack>
        ) : null}
      </HStack>
      <Text modifiers={[font({ size: small ? 22 : 18, weight: "bold", design: "rounded" }), lineLimit(1), minimumScaleFactor(0.7)]}>{props.headline}</Text>
      {props.detail ? <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(late), lineLimit(1)]}>{props.detail}</Text> : null}
      {!items.length ? <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{props.empty}</Text> : null}
      {items.map((item, index) =>
        !small && item.url ? (
          <Link key={index} destination={item.url}>
            {row(item, index)}
          </Link>
        ) : (
          row(item, index)
        ),
      )}
      <Spacer />
      {timer && props.timer && !small ? (
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

// Unread notifications: one number.
function FlowplanInbox(props: InboxWidgetProps, environment: WidgetEnvironment) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const dark = environment.colorScheme === "dark";
  const brand = environment.widgetRenderingMode === "accented" ? { type: "hierarchical" as const, style: "primary" as const } : dark ? "#8f93ff" : "#4146e6";
  const secondary = { type: "hierarchical" as const, style: "secondary" as const };
  const background = dark ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="tray.fill" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  if (family === "accessoryInline") return <Text modifiers={[widgetURL(props.url)]}>{props.label}</Text>;
  if (family === "accessoryCircular")
    return (
      <VStack spacing={0} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget"), accessibilityLabel(props.label)]}>
        <Image systemName={props.signedIn ? "tray" : "person.crop.circle.badge.exclamationmark"} modifiers={[font({ size: 12 })]} />
        {props.signedIn ? <Text modifiers={[font({ size: 20, weight: "bold" }), monospacedDigit()]}>{String(props.count)}</Text> : null}
      </VStack>
    );
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={5}>
        <Image systemName="tray.fill" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand)]}>{props.title}</Text>
      </HStack>
      <Spacer />
      {props.signedIn ? (
        <Text modifiers={[font({ size: 44, weight: "bold", design: "rounded" }), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.5)]}>{String(props.count)}</Text>
      ) : (
        <Image systemName="person.crop.circle.badge.exclamationmark" modifiers={[font({ size: 22 }), foregroundStyle(secondary)]} />
      )}
      <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(2)]}>{props.label}</Text>
    </VStack>
  );
}

// ---- Administrators (admin.ts): the instance's state, a live number and
// storage – one thing each, chosen in the widget's settings. Everyone else
// sees "Administrators only". Status colours only as accents.

// The instance: its state with the first problem, the last backup, or the
// version and update (setting "Show").
function FlowplanInstance(props: AdminStatusProps, environment: WidgetEnvironment<InstanceConfig>) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const dark = environment.colorScheme === "dark";
  const accented = environment.widgetRenderingMode === "accented";
  const brand = accented ? { type: "hierarchical" as const, style: "primary" as const } : dark ? "#8f93ff" : "#4146e6";
  const secondary = { type: "hierarchical" as const, style: "secondary" as const };
  const background = dark ? "#16151b" : "#fcfbf8";
  const show = environment.configuration?.show || "state";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="server.rack" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const closed = props.state === "signedOut" || props.state === "notAdmin" || props.state === "pending";
  const tone = accented
    ? brand
    : props.state === "problem"
      ? "#d14343"
      : props.state === "notice"
        ? "#c27c0e"
        : props.state === "ok"
          ? "#2f9e6e"
          : brand;
  const icon =
    props.state === "problem"
      ? "xmark.octagon.fill"
      : props.state === "notice"
        ? "exclamationmark.triangle.fill"
        : props.state === "ok"
          ? "checkmark.seal.fill"
          : props.state === "notAdmin"
            ? "lock.fill"
            : props.state === "pending"
              ? "arrow.clockwise"
              : "person.crop.circle.badge.exclamationmark";
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
  const small = family === "systemSmall";
  const header = (
    <HStack spacing={5}>
      <Image systemName="server.rack" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
      <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand), lineLimit(1)]}>{props.title}</Text>
      <Spacer />
      {!closed && !small && show === "state" ? <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary)]}>{props.version}</Text> : null}
    </HStack>
  );
  if (closed)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
        {header}
        <Spacer />
        <Image systemName={icon} modifiers={[font({ size: 22 }), foregroundStyle(secondary)]} />
        <Text modifiers={[font({ size: 14, weight: "medium" }), foregroundStyle(secondary), lineLimit(3)]}>{props.message}</Text>
      </VStack>
    );
  // One big value with its label; the rest small and muted.
  const big = show === "backup" ? props.backupTime : show === "version" ? props.version : props.headline;
  const label = show === "backup" ? props.backupShort : show === "version" ? props.update || props.headline : props.detail;
  const footer = show === "state" ? (props.update ? props.update : props.backup) : props.headline;
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      {header}
      <Spacer />
      <HStack spacing={6}>
        {show === "state" ? <Image systemName={icon} modifiers={[foregroundStyle(tone), font({ size: small ? 18 : 20, weight: "semibold" })]} /> : null}
        <Text modifiers={[font({ size: show === "state" ? (small ? 20 : 24) : 32, weight: "bold", design: "rounded" }), lineLimit(1), minimumScaleFactor(0.6)]}>{big}</Text>
      </HStack>
      {label ? (
        <HStack spacing={4}>
          {show === "backup" && props.backupLate ? <Image systemName="exclamationmark.triangle.fill" modifiers={[font({ size: 11 }), foregroundStyle(tone)]} /> : null}
          <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(small ? 2 : 1)]}>{label}</Text>
        </HStack>
      ) : null}
      {!small && footer ? <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>{footer}</Text> : null}
    </VStack>
  );
}

// One live number (setting "Metric": active people, requests per minute,
// error rate, sign-ins today) big; from medium up the requests of the last
// 24 hours as a clean line and the other numbers small.
function FlowplanLive(props: AdminLiveProps, environment: WidgetEnvironment<LiveConfig>) {
  "widget";
  const family = environment.widgetFamily || "systemMedium";
  const dark = environment.colorScheme === "dark";
  const accented = environment.widgetRenderingMode === "accented";
  const brand = accented ? { type: "hierarchical" as const, style: "primary" as const } : dark ? "#8f93ff" : "#4146e6";
  const secondary = { type: "hierarchical" as const, style: "secondary" as const };
  const background = dark ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="waveform.path.ecg" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const open = props.state === "data";
  const metric = environment.configuration?.metric || "active";
  const main = (open && (props.tiles.find((tile) => tile.id === metric) || props.tiles[0])) || null;
  const others = open ? props.tiles.filter((tile) => tile !== main) : [];
  const icon =
    !main ? "waveform.path.ecg" : main.id === "requests" ? "arrow.left.arrow.right" : main.id === "errors" ? "exclamationmark.triangle" : main.id === "signins" ? "person.badge.key.fill" : "person.2.fill";
  const alert = accented ? brand : "#d14343";
  if (family === "accessoryCircular")
    return main && main.id === "errors" ? (
      <Gauge
        value={Math.min(props.errorRate, 0.1)}
        max={0.1}
        currentValueLabel={<Text modifiers={[monospacedDigit()]}>{main.value.replace(/\s?%/, "")}</Text>}
        modifiers={[widgetURL(props.url), gaugeStyle("circularCapacity"), containerBackground({ type: "material", material: "thin" }, "widget"), accessibilityLabel(`${main.label}: ${main.value}`)]}
      >
        <Image systemName="exclamationmark.triangle" />
      </Gauge>
    ) : (
      <VStack spacing={0} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget"), accessibilityLabel(main ? `${main.label}: ${main.value}` : props.message)]}>
        <Image systemName={main ? icon : props.state === "pending" ? "arrow.clockwise" : "lock.fill"} modifiers={[font({ size: 12 })]} />
        {main ? <Text modifiers={[font({ size: 18, weight: "bold" }), monospacedDigit(), minimumScaleFactor(0.5), lineLimit(1)]}>{main.value}</Text> : null}
      </VStack>
    );
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ textStyle: "title2", weight: "bold" }), monospacedDigit(), lineLimit(1)]}>{main ? main.value : props.message}</Text>
        {main ? <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{main.label}</Text> : null}
      </VStack>
    );
  const small = family === "systemSmall";
  const large = family === "systemLarge";
  const chart = open && !small && props.spark.length > 0;
  return (
    <VStack alignment="leading" spacing={6} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={5}>
        <Image systemName="waveform.path.ecg" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand), lineLimit(1)]}>{props.title}</Text>
      </HStack>
      {!main ? <Spacer /> : null}
      {!main ? <Image systemName={props.state === "off" ? "chart.line.downtrend.xyaxis" : props.state === "pending" ? "arrow.clockwise" : "lock.fill"} modifiers={[font({ size: 22 }), foregroundStyle(secondary)]} /> : null}
      {!main ? <Text modifiers={[font({ size: 14, weight: "medium" }), foregroundStyle(secondary), lineLimit(3)]}>{props.message}</Text> : null}
      {main && small ? <Spacer /> : null}
      {main ? (
        <HStack spacing={12}>
          <VStack alignment="leading" spacing={0}>
            <Text modifiers={[font({ size: large ? 48 : 40, weight: "bold", design: "rounded" }), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.5)]}>{main.value}</Text>
            <HStack spacing={4}>
              {main.alert ? <Image systemName="exclamationmark.triangle.fill" modifiers={[font({ size: 11 }), foregroundStyle(alert)]} /> : null}
              <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(small ? 2 : 1)]}>{main.label}</Text>
            </HStack>
          </VStack>
          {chart && !large ? (
            <Chart
              type="line"
              data={props.spark.map((y, x) => ({ x, y }))}
              showGrid={false}
              animate={false}
              lineStyle={{ color: dark ? "#8f93ff" : "#4146e6", width: 2 }}
              modifiers={[frame({ height: 52 }), accessibilityHidden(true)]}
            />
          ) : null}
        </HStack>
      ) : null}
      {chart && large ? (
        <Chart
          type="area"
          data={props.spark.map((y, x) => ({ x, y }))}
          showGrid={false}
          animate={false}
          areaStyle={{ color: dark ? "#8f93ff" : "#4146e6" }}
          modifiers={[frame({ height: 120 }), accessibilityHidden(true)]}
        />
      ) : null}
      {chart && large ? <Text modifiers={[font({ size: 10 }), foregroundStyle(secondary)]}>{props.sparkLabel}</Text> : null}
      {main && !small ? <Spacer /> : null}
      {main && !small
        ? (large ? others : others.slice(0, 2)).map((tile, index) => (
            <HStack key={index} spacing={6}>
              <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>{tile.label}</Text>
              <Spacer />
              {tile.alert ? <Image systemName="exclamationmark.triangle.fill" modifiers={[font({ size: 10 }), foregroundStyle(alert)]} /> : null}
              <Text modifiers={[font({ size: 11, weight: "semibold" }), monospacedDigit()]}>{tile.value}</Text>
            </HStack>
          ))
        : null}
    </VStack>
  );
}

// Storage (setting "Metric"): the disk, database and files, or the fullest
// workspace's quota – one value big, a bar where it is a share.
function FlowplanStorage(props: AdminStorageProps, environment: WidgetEnvironment<StorageConfig>) {
  "widget";
  const family = environment.widgetFamily || "systemSmall";
  const dark = environment.colorScheme === "dark";
  const accented = environment.widgetRenderingMode === "accented";
  const brand = accented ? { type: "hierarchical" as const, style: "primary" as const } : dark ? "#8f93ff" : "#4146e6";
  const secondary = { type: "hierarchical" as const, style: "secondary" as const };
  const background = dark ? "#16151b" : "#fcfbf8";
  if (!props || !props.title)
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(background, "widget")]}>
        <Image systemName="internaldrive" modifiers={[foregroundStyle(brand), font({ size: 15 })]} />
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>Flowplan</Text>
      </VStack>
    );
  const open = props.state === "data";
  const metric = environment.configuration?.metric || (props.disk >= 0 ? "disk" : "database");
  const share = metric === "disk" ? props.disk : metric === "quota" ? props.quota : -1;
  const value = metric === "disk" ? props.diskValue : metric === "quota" ? props.quotaValue : props.used;
  const label = metric === "disk" ? props.diskShort : metric === "quota" ? props.quotaShort : props.usedLabel;
  const full = share >= 0.9;
  const barTint = accented ? "#ffffff" : full ? "#d14343" : dark ? "#8f93ff" : "#4146e6";
  if (family === "accessoryCircular")
    return open && share >= 0 ? (
      <Gauge
        value={share}
        currentValueLabel={<Text modifiers={[monospacedDigit()]}>{String(Math.round(share * 100))}</Text>}
        modifiers={[widgetURL(props.url), gaugeStyle("circularCapacity"), containerBackground({ type: "material", material: "thin" }, "widget"), accessibilityLabel(`${label}: ${value}`)]}
      >
        <Image systemName="internaldrive" />
      </Gauge>
    ) : (
      <VStack spacing={0} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Image systemName={open ? "internaldrive" : props.state === "pending" ? "arrow.clockwise" : "lock.fill"} modifiers={[font({ size: 18 })]} />
      </VStack>
    );
  if (family === "accessoryRectangular")
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), containerBackground({ type: "material", material: "thin" }, "widget")]}>
        <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ textStyle: "title2", weight: "bold" }), lineLimit(1)]}>{open ? value : props.message}</Text>
        {open ? <Text modifiers={[font({ textStyle: "caption" }), lineLimit(1)]}>{label}</Text> : null}
      </VStack>
    );
  const small = family === "systemSmall";
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url), containerBackground(background, "widget")]}>
      <HStack spacing={5}>
        <Image systemName="internaldrive" modifiers={[foregroundStyle(brand), font({ size: 12, weight: "semibold" })]} />
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(brand), lineLimit(1)]}>{props.title}</Text>
      </HStack>
      <Spacer />
      {!open ? <Image systemName={props.state === "pending" ? "arrow.clockwise" : "lock.fill"} modifiers={[font({ size: 22 }), foregroundStyle(secondary)]} /> : null}
      {!open ? <Text modifiers={[font({ size: 14, weight: "medium" }), foregroundStyle(secondary), lineLimit(3)]}>{props.message}</Text> : null}
      {open ? <Text modifiers={[font({ size: 34, weight: "bold", design: "rounded" }), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.5)]}>{value}</Text> : null}
      {open ? (
        <HStack spacing={4}>
          {full ? <Image systemName="exclamationmark.triangle.fill" modifiers={[font({ size: 11 }), foregroundStyle(accented ? brand : "#d14343")]} /> : null}
          <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(small ? 2 : 1)]}>{label}</Text>
        </HStack>
      ) : null}
      {open && share >= 0 ? <ProgressView value={share} modifiers={[tint(barTint)]} /> : null}
      {open && !small ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>
          {metric === "database" ? props.diskLabel || props.quotaLabel : `${props.used} · ${props.usedLabel}`}
        </Text>
      ) : null}
    </VStack>
  );
}

// The running timer on the lock screen and in the Dynamic Island.
function FlowplanTimer(props: TimerProps) {
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
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
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

// ---- Live Activities of what runs now (activities.ts): focus, the meeting
// now, imports and exports, an incident, a voice memo being recorded. The
// buttons ("End", "Stop") reach the app (native/activities.ts); links open it.

// Focus or break, counting down; "End" stops focus and its timer.
function FlowplanFocus(props: FocusProps) {
  "widget";
  const accent = props.phase === "break" ? "#2f9e6e" : "#6f74ff";
  const icon = props.phase === "break" ? "cup.and.saucer.fill" : "scope";
  const ends = new Date(props.endsAt);
  const countdown = (size: number) => (
    <Text date={ends} dateStyle="timer" modifiers={[font({ size, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent), frame({ maxWidth: 80 })]} />
  );
  const stop = <Button label={props.stopLabel} systemImage="stop.fill" target="stop" modifiers={[tint(accent), accessibilityLabel(props.stopLabel)]} />;
  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), widgetURL(props.url)]}>
        <HStack spacing={12}>
          <Image systemName={icon} modifiers={[font({ size: 22 }), foregroundStyle(accent), accessibilityHidden(true)]} />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>{`${props.label} · ${props.untilLabel}`}</Text>
          </VStack>
          <Spacer />
          {countdown(26)}
        </HStack>
        <HStack spacing={10}>
          <ProgressView timerInterval={{ lower: new Date(props.startedAt), upper: ends }} countsDown={false} modifiers={[tint(accent)]} />
          {stop}
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    compactTrailing: countdown(14),
    minimal: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 13, weight: "medium" })]}>{props.label}</Text>
      </HStack>
    ),
    expandedTrailing: countdown(18),
    expandedBottom: (
      <HStack spacing={10}>
        <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
        <Spacer />
        {stop}
      </HStack>
    ),
  };
}

// The meeting now: its title, the time left, "Open notes".
function FlowplanMeeting(props: MeetingProps) {
  "widget";
  const accent = "#6f74ff";
  const ends = new Date(props.end);
  const left = (size: number) => (
    <Text date={ends} dateStyle="timer" modifiers={[font({ size, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent), frame({ maxWidth: 80 })]} />
  );
  const notes = (
    <Link destination={props.notesUrl} modifiers={[accessibilityLabel(props.notesLabel)]}>
      <HStack spacing={4}>
        <Image systemName="note.text" modifiers={[font({ size: 13 }), foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(accent)]}>{props.notesLabel}</Text>
      </HStack>
    </Link>
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), widgetURL(props.url)]}>
        <HStack spacing={12}>
          <Image systemName="person.2.fill" modifiers={[font({ size: 20 }), foregroundStyle(accent), accessibilityHidden(true)]} />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
              {props.calendar ? `${props.endsLabel} · ${props.calendar}` : props.endsLabel}
            </Text>
          </VStack>
          <Spacer />
          {left(24)}
        </HStack>
        <HStack>
          <ProgressView timerInterval={{ lower: new Date(props.start), upper: ends }} countsDown={false} modifiers={[tint(accent)]} />
        </HStack>
        {notes}
      </VStack>
    ),
    compactLeading: <Image systemName="person.2.fill" modifiers={[foregroundStyle(accent)]} />,
    compactTrailing: left(14),
    minimal: <Image systemName="person.2.fill" modifiers={[foregroundStyle(accent)]} />,
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName="person.2.fill" modifiers={[foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 13, weight: "medium" })]}>{props.label}</Text>
      </HStack>
    ),
    expandedTrailing: left(18),
    expandedBottom: (
      <VStack alignment="leading" spacing={6}>
        <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.title}</Text>
        {notes}
      </VStack>
    ),
  };
}

// An import or export: name, what, a bar (moving stripes without an estimate).
function FlowplanJobs(props: JobsProps) {
  "widget";
  const accent = props.status === "failed" || props.status === "interrupted" ? "#d14343" : props.status === "done" ? "#2f9e6e" : "#6f74ff";
  const icon = props.status === "done" ? "checkmark.circle.fill" : props.status === "running" ? "arrow.triangle.2.circlepath" : "exclamationmark.triangle.fill";
  const bar = props.progress >= 0 ? <ProgressView value={props.progress} modifiers={[tint(accent)]} /> : <ProgressView modifiers={[tint(accent)]} />;
  const percent = props.progress >= 0 ? `${Math.round(props.progress * 100)} %` : props.statusLabel;
  return {
    banner: (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 16 }), widgetURL(props.url)]}>
        <HStack spacing={12}>
          <Image systemName={icon} modifiers={[font({ size: 20 }), foregroundStyle(accent), accessibilityHidden(true)]} />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(1)]}>{props.label ? `${props.name}: ${props.label}` : props.name}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
              {props.more ? `${props.statusLabel} · +${props.more}` : props.statusLabel}
            </Text>
          </VStack>
          <Spacer />
          <Text modifiers={[font({ size: 15, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent)]}>{percent}</Text>
        </HStack>
        {props.status === "running" ? bar : null}
      </VStack>
    ),
    compactLeading: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    compactTrailing: <Text modifiers={[font({ size: 13, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent)]}>{props.progress >= 0 ? `${Math.round(props.progress * 100)}%` : "…"}</Text>,
    minimal: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 13, weight: "medium" })]}>{props.name}</Text>
      </HStack>
    ),
    expandedTrailing: <Text modifiers={[font({ size: 15, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent)]}>{percent}</Text>,
    expandedBottom: (
      <VStack alignment="leading" spacing={6}>
        <Text modifiers={[font({ size: 14 }), lineLimit(1)]}>{props.label || props.title}</Text>
        {props.status === "running" ? bar : null}
      </VStack>
    ),
  };
}

// An incident of the instance (administrators), only while it lasts.
function FlowplanIncident(props: IncidentProps) {
  "widget";
  const accent = props.level === "critical" ? "#d14343" : "#c27c0e";
  const icon = props.level === "critical" ? "xmark.octagon.fill" : "exclamationmark.triangle.fill";
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 }), widgetURL(props.url)]}>
        <Image systemName={icon} modifiers={[font({ size: 22 }), foregroundStyle(accent), accessibilityHidden(true)]} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(accent)]}>{`${props.title} · ${props.levelLabel}`}</Text>
          <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(2)]}>{props.headline}</Text>
          {props.detail ? <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.detail}</Text> : null}
        </VStack>
        <Spacer />
      </HStack>
    ),
    compactLeading: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    compactTrailing: <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(accent)]}>{props.levelLabel}</Text>,
    minimal: <Image systemName={icon} modifiers={[foregroundStyle(accent)]} />,
    expandedLeading: <Image systemName={icon} modifiers={[font({ size: 18 }), foregroundStyle(accent)]} />,
    expandedTrailing: <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(accent)]}>{props.levelLabel}</Text>,
    expandedBottom: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: "semibold" }), lineLimit(2)]}>{props.headline}</Text>
        {props.detail ? <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.detail}</Text> : null}
      </VStack>
    ),
  };
}

// A voice memo being recorded in the app: the running time, "Stop".
function FlowplanRecording(props: RecordingProps) {
  "widget";
  const accent = "#e5484d";
  const since = new Date(props.start);
  const clockView = (size: number) => (
    <Text date={since} dateStyle="timer" modifiers={[font({ size, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent), frame({ maxWidth: 80 })]} />
  );
  const stop = <Button label={props.stopLabel} systemImage="stop.fill" target="stop" modifiers={[tint(accent), accessibilityLabel(props.stopLabel)]} />;
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 }), widgetURL(props.url)]}>
        <Image systemName="mic.fill" modifiers={[font({ size: 22 }), foregroundStyle(accent), accessibilityHidden(true)]} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 15, weight: "semibold" })]}>{props.title}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.label}</Text>
        </VStack>
        <Spacer />
        {clockView(24)}
        {stop}
      </HStack>
    ),
    compactLeading: <Image systemName="mic.fill" modifiers={[foregroundStyle(accent)]} />,
    compactTrailing: clockView(14),
    minimal: <Image systemName="mic.fill" modifiers={[foregroundStyle(accent)]} />,
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName="mic.fill" modifiers={[foregroundStyle(accent)]} />
        <Text modifiers={[font({ size: 13, weight: "medium" })]}>{props.label}</Text>
      </HStack>
    ),
    expandedTrailing: clockView(18),
    expandedBottom: (
      <HStack>
        <Text modifiers={[font({ size: 15, weight: "semibold" })]}>{props.title}</Text>
        <Spacer />
        {stop}
      </HStack>
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
export let tasksWidget = createWidget<TasksWidgetProps, TasksConfig>("FlowplanTasks", FlowplanTasks, english.tasks);
export let inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, english.inbox);
export let adminStatusWidget = createWidget<AdminStatusProps, InstanceConfig>("FlowplanInstance", FlowplanInstance, english.status);
export let adminLiveWidget = createWidget<AdminLiveProps, LiveConfig>("FlowplanLive", FlowplanLive, english.live);
export let adminStorageWidget = createWidget<AdminStorageProps, StorageConfig>("FlowplanStorage", FlowplanStorage, english.storage);
let samplesLocale: Locale = "en";
export function localizeSamples(lang: Locale) {
  if (lang === samplesLocale) return;
  samplesLocale = lang;
  const sample = samples(lang);
  tasksWidget = createWidget<TasksWidgetProps, TasksConfig>("FlowplanTasks", FlowplanTasks, sample.tasks);
  inboxWidget = createWidget<InboxWidgetProps>("FlowplanInbox", FlowplanInbox, sample.inbox);
  adminStatusWidget = createWidget<AdminStatusProps, InstanceConfig>("FlowplanInstance", FlowplanInstance, sample.status);
  adminLiveWidget = createWidget<AdminLiveProps, LiveConfig>("FlowplanLive", FlowplanLive, sample.live);
  adminStorageWidget = createWidget<AdminStorageProps, StorageConfig>("FlowplanStorage", FlowplanStorage, sample.storage);
}
export const timerActivity = createLiveActivity<TimerProps>("FlowplanTimer", FlowplanTimer);
export const liveActivities = {
  focus: createLiveActivity<FocusProps>("FlowplanFocus", FlowplanFocus),
  meeting: createLiveActivity<MeetingProps>("FlowplanMeeting", FlowplanMeeting),
  jobs: createLiveActivity<JobsProps>("FlowplanJobs", FlowplanJobs),
  incident: createLiveActivity<IncidentProps>("FlowplanIncident", FlowplanIncident),
  recording: createLiveActivity<RecordingProps>("FlowplanRecording", FlowplanRecording),
};
