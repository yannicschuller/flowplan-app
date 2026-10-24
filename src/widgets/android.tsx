// Android: the home screen widgets, drawn from React into RemoteViews by
// react-native-android-widget. Android asks for them in the background (when
// a widget is added, every 30 minutes, on resize); the handler then reads the
// summary fresh from the instance when it can.
import { FlexWidget, TextWidget, type WidgetTaskHandlerProps } from "react-native-android-widget";
import type { InboxWidgetProps, TasksWidgetProps } from "../summary";
import type { AdminLiveProps, AdminStatusProps, AdminStorageProps } from "../admin";
import { materialColors } from "../../modules/flowplan-android/src";
import { materialThemes } from "../android/theme";

export type Theme = { background: string; text: string; muted: string; brand: string; late: string; line: string; warn: string; ok: string };
export const LIGHT: Theme = { background: "#fcfbf8", text: "#1d1b22", muted: "#6b6876", brand: "#4146e6", late: "#c23b3b", line: "#ebe8f2", warn: "#b7791f", ok: "#2f855a" };
export const DARK: Theme = { background: "#16151b", text: "#f2f0f7", muted: "#a19dad", brand: "#8f93ff", late: "#ff7a7a", line: "#2a2832", warn: "#f6c25b", ok: "#68d391" };
// Android 12+: the system's Material You colours instead (android/theme.ts).
export const widgetThemes = () => materialThemes(materialColors(), { light: LIGHT, dark: DARK });
type Hex = `#${string}`;
export const hex = (value: string) => value as Hex;

function TasksView({ props, theme, rows }: { props: TasksWidgetProps; theme: Theme; rows: number }) {
  const items = props.items.slice(0, rows);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.url }}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        padding: 14,
        backgroundColor: hex(theme.background),
        borderRadius: 22,
      }}
    >
      <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center" }}>
        <TextWidget text={props.title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
        <FlexWidget style={{ flex: 1 }} />
        {props.signedIn ? (
          <TextWidget
            text={props.unreadLabel}
            clickAction="OPEN_URI"
            clickActionData={{ uri: props.inboxUrl }}
            style={{ fontSize: 12, color: hex(theme.muted) }}
          />
        ) : null}
      </FlexWidget>
      <TextWidget text={props.headline} maxLines={1} truncate="END" style={{ fontSize: 18, fontWeight: "700", color: hex(theme.text), marginTop: 4 }} />
      {props.detail ? <TextWidget text={props.detail} style={{ fontSize: 12, fontWeight: "500", color: hex(theme.late) }} /> : null}
      {props.signedIn && !items.length ? (
        <TextWidget text={props.empty} style={{ fontSize: 13, color: hex(theme.muted), marginTop: 6 }} />
      ) : null}
      {items.map((item, index) => (
        <FlexWidget
          key={index}
          clickAction="OPEN_URI"
          clickActionData={{ uri: item.url }}
          style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginTop: 6 }}
        >
          <TextWidget text="○" style={{ fontSize: 12, color: hex(theme.muted), marginRight: 6 }} />
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={item.text} maxLines={1} truncate="END" style={{ fontSize: 13, color: hex(theme.text) }} />
          </FlexWidget>
          {item.due ? (
            <TextWidget text={item.due} style={{ fontSize: 11, fontWeight: "500", color: hex(item.late ? theme.late : theme.muted), marginLeft: 6 }} />
          ) : null}
        </FlexWidget>
      ))}
      <FlexWidget style={{ flex: 1 }} />
      {props.timer ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: props.timer.url }}
          style={{ flexDirection: "row", width: "match_parent", alignItems: "center", borderTopWidth: 1, borderColor: hex(theme.line), paddingTop: 6 }}
        >
          <TextWidget text="⏱" style={{ fontSize: 12, color: hex(theme.brand), marginRight: 6 }} />
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={props.timer.title} maxLines={1} truncate="END" style={{ fontSize: 12, color: hex(theme.text) }} />
          </FlexWidget>
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

function InboxView({ props, theme }: { props: InboxWidgetProps; theme: Theme }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.url }}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        padding: 14,
        backgroundColor: hex(theme.background),
        borderRadius: 22,
      }}
    >
      <TextWidget text={props.title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      <FlexWidget style={{ flex: 1 }} />
      {props.signedIn ? <TextWidget text={String(props.count)} style={{ fontSize: 40, fontWeight: "700", color: hex(theme.text) }} /> : null}
      <TextWidget text={props.label} maxLines={2} style={{ fontSize: 13, color: hex(theme.muted) }} />
    </FlexWidget>
  );
}

// ---- Administrators' widgets (admin.ts): simpler than on iOS ----

const frame = (theme: Theme) =>
  ({ height: "match_parent", width: "match_parent", flexDirection: "column", padding: 14, backgroundColor: hex(theme.background), borderRadius: 22 }) as const;

function Closed({ title, message, url, theme }: { title: string; message: string; url: string; theme: Theme }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: url }} style={frame(theme)}>
      <TextWidget text={title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={message} maxLines={2} style={{ fontSize: 14, color: hex(theme.muted) }} />
    </FlexWidget>
  );
}

// A bar from 0 to 1 (two parts that share the width).
function Meter({ share, color, theme }: { share: number; color: string; theme: Theme }) {
  const filled = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 6, borderRadius: 3, backgroundColor: hex(theme.line), marginTop: 4 }}>
      {filled > 0 ? <FlexWidget style={{ flex: filled, height: 6, borderRadius: 3, backgroundColor: hex(color) }} /> : null}
      {filled < 100 ? <FlexWidget style={{ flex: 100 - filled, height: 6 }} /> : null}
    </FlexWidget>
  );
}

function StatusView({ props, theme }: { props: AdminStatusProps; theme: Theme }) {
  if (props.state === "signedOut" || props.state === "notAdmin" || props.state === "pending") return <Closed {...props} theme={theme} />;
  const tone = props.state === "problem" ? theme.late : props.state === "notice" ? theme.warn : theme.ok;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: props.url }} style={frame(theme)}>
      <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center" }}>
        <TextWidget text={props.title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={props.version} style={{ fontSize: 11, color: hex(theme.muted) }} />
      </FlexWidget>
      <TextWidget text={`● ${props.headline}`} maxLines={1} style={{ fontSize: 17, fontWeight: "700", color: hex(tone), marginTop: 6 }} />
      {props.detail ? <TextWidget text={props.more ? `${props.detail} · ${props.more}` : props.detail} maxLines={2} style={{ fontSize: 12, color: hex(theme.text), marginTop: 2 }} /> : null}
      <FlexWidget style={{ flex: 1 }} />
      {props.update ? <TextWidget text={props.update} maxLines={1} style={{ fontSize: 11, fontWeight: "600", color: hex(theme.brand) }} /> : null}
      <TextWidget text={props.backup} maxLines={1} style={{ fontSize: 11, color: hex(props.backupLate ? theme.late : theme.muted) }} />
    </FlexWidget>
  );
}

// One number big (active now, or the error rate when it is high), the
// others small and muted; the requests of the last 24 hours as bars when
// there is room.
function LiveView({ props, theme, chart }: { props: AdminLiveProps; theme: Theme; chart: boolean }) {
  if (props.state !== "data") return <Closed {...props} theme={theme} />;
  const main = props.tiles.find((tile) => tile.alert) ?? props.tiles[0];
  const others = props.tiles.filter((tile) => tile !== main);
  const max = Math.max(1, ...props.spark);
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: props.url }} style={frame(theme)} accessibilityLabel={`${props.title}: ${main.value} ${main.label}`}>
      <TextWidget text={props.title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={main.value} maxLines={1} style={{ fontSize: 34, fontWeight: "700", color: hex(theme.text) }} />
      <TextWidget text={`${main.alert ? "⚠ " : ""}${main.label}`} maxLines={1} style={{ fontSize: 12, color: hex(main.alert ? theme.late : theme.muted) }} />
      {chart && props.spark.length ? (
        <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 30, alignItems: "flex-end", marginTop: 6 }}>
          {props.spark.map((value, index) => (
            <FlexWidget key={index} style={{ flex: 1, height: Math.max(2, Math.round((value / max) * 30)), marginLeft: 1, borderRadius: 1, backgroundColor: hex(theme.brand) }} />
          ))}
        </FlexWidget>
      ) : null}
      {chart ? (
        <TextWidget text={others.map((tile) => `${tile.value} ${tile.label}`).join(" · ")} maxLines={1} truncate="END" style={{ fontSize: 10, color: hex(theme.muted), marginTop: 4 }} />
      ) : null}
    </FlexWidget>
  );
}

// The disk (or the fullest quota) big with its bar; the rest small.
function StorageView({ props, theme }: { props: AdminStorageProps; theme: Theme }) {
  if (props.state !== "data") return <Closed {...props} theme={theme} />;
  const disk = props.disk >= 0;
  const share = disk ? props.disk : props.quota;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: props.url }} style={frame(theme)}>
      <TextWidget text={props.title} style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={disk ? props.diskValue : share >= 0 ? props.quotaValue : props.used} maxLines={1} style={{ fontSize: 30, fontWeight: "700", color: hex(theme.text) }} />
      <TextWidget text={disk ? props.diskShort : share >= 0 ? props.quotaShort : props.usedLabel} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted) }} />
      {share >= 0 ? <Meter share={share} color={share >= 0.9 ? theme.late : theme.brand} theme={theme} /> : null}
      <TextWidget text={`${props.used} · ${props.usedLabel}`} maxLines={1} truncate="END" style={{ fontSize: 10, color: hex(theme.muted), marginTop: 6 }} />
    </FlexWidget>
  );
}

export function renderAdminStatus(props: AdminStatusProps) {
  const themes = widgetThemes();
  return { light: <StatusView props={props} theme={themes.light} />, dark: <StatusView props={props} theme={themes.dark} /> };
}
export function renderAdminLive(props: AdminLiveProps, height = 180) {
  const themes = widgetThemes();
  const chart = height >= 150;
  return { light: <LiveView props={props} theme={themes.light} chart={chart} />, dark: <LiveView props={props} theme={themes.dark} chart={chart} /> };
}
export function renderAdminStorage(props: AdminStorageProps) {
  const themes = widgetThemes();
  return { light: <StorageView props={props} theme={themes.light} />, dark: <StorageView props={props} theme={themes.dark} /> };
}

export function renderTasks(props: TasksWidgetProps, height = 180) {
  const themes = widgetThemes();
  const rows = Math.max(1, Math.min(8, Math.floor((height - 90) / 22)));
  return { light: <TasksView props={props} theme={themes.light} rows={rows} />, dark: <TasksView props={props} theme={themes.dark} rows={rows} /> };
}

export function renderInbox(props: InboxWidgetProps) {
  const themes = widgetThemes();
  return { light: <InboxView props={props} theme={themes.light} />, dark: <InboxView props={props} theme={themes.dark} /> };
}

export type { WidgetTaskHandlerProps };
