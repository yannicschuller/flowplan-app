// Android: the home screen widgets, drawn from React into RemoteViews by
// react-native-android-widget. Android asks for them in the background (when
// a widget is added, every 30 minutes, on resize); the handler then reads the
// summary fresh from the instance when it can.
import { FlexWidget, TextWidget, type WidgetTaskHandlerProps } from "react-native-android-widget";
import type { InboxWidgetProps, TasksWidgetProps } from "../summary";

type Theme = { background: string; text: string; muted: string; brand: string; late: string; line: string };
const LIGHT: Theme = { background: "#fcfbf8", text: "#1d1b22", muted: "#6b6876", brand: "#4146e6", late: "#c23b3b", line: "#ebe8f2" };
const DARK: Theme = { background: "#16151b", text: "#f2f0f7", muted: "#a19dad", brand: "#8f93ff", late: "#ff7a7a", line: "#2a2832" };
type Hex = `#${string}`;
const hex = (value: string) => value as Hex;

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

export function renderTasks(props: TasksWidgetProps, height = 180) {
  const rows = Math.max(1, Math.min(8, Math.floor((height - 90) / 22)));
  return { light: <TasksView props={props} theme={LIGHT} rows={rows} />, dark: <TasksView props={props} theme={DARK} rows={rows} /> };
}

export function renderInbox(props: InboxWidgetProps) {
  return { light: <InboxView props={props} theme={LIGHT} />, dark: <InboxView props={props} theme={DARK} /> };
}

export type { WidgetTaskHandlerProps };
