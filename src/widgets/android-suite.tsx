// Android: the configurable widgets, drawn from React into RemoteViews
// (react-native-android-widget). Same content as on iOS (present.ts makes
// the texts); small widgets show less. Taps on a checkbox, "read" or the
// timer run the action in the background (widget-task.ts → native/suite.ts),
// everything else opens the page in the app.
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { hex, widgetThemes, type Theme } from "./android";
import type { SuiteView } from "./present";

// What a tap does (clickAction); the data is what the action needs.
export const SUITE_CLICKS = {
  complete: "SUITE_COMPLETE",
  habit: "SUITE_HABIT",
  read: "SUITE_READ",
  readAll: "SUITE_READ_ALL",
  timerStart: "SUITE_TIMER_START",
  timerStop: "SUITE_TIMER_STOP",
} as const;

type Size = { width: number; height: number };
const frame = (theme: Theme) =>
  ({ height: "match_parent", width: "match_parent", flexDirection: "column", padding: 14, backgroundColor: hex(theme.background), borderRadius: 22 }) as const;

function Header({ title, trailing, theme }: { title: string; trailing?: string; theme: Theme }) {
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginBottom: 4 }}>
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget text={title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      </FlexWidget>
      {trailing ? <TextWidget text={trailing} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted), marginLeft: 6 }} /> : null}
    </FlexWidget>
  );
}

function Row({
  text,
  detail,
  right,
  url,
  theme,
  late,
  done,
  alert,
}: {
  text: string;
  detail?: string;
  right?: string;
  url: string;
  theme: Theme;
  late?: boolean;
  done?: boolean;
  alert?: boolean;
}) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: url }} style={{ flex: 1, flexDirection: "row", alignItems: "center" }} accessibilityLabel={[text, detail, right].filter(Boolean).join(", ")}>
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(done ? theme.muted : theme.text) }} />
        {detail ? <TextWidget text={detail} maxLines={1} truncate="END" style={{ fontSize: 11, fontWeight: alert ? "500" : "400", color: hex(alert ? theme.late : theme.muted) }} /> : null}
      </FlexWidget>
      {right ? <TextWidget text={right} maxLines={1} style={{ fontSize: 11, fontWeight: "500", color: hex(late ? theme.late : theme.muted), marginLeft: 6 }} /> : null}
    </FlexWidget>
  );
}

// A round tap target with a glyph (checkbox, read, play, stop).
function Tap({ glyph, action, data, label, theme }: { glyph: string; action: string; data: Record<string, unknown>; label: string; theme: Theme }) {
  return (
    <FlexWidget
      clickAction={action}
      clickActionData={data}
      accessibilityLabel={label}
      style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 6 }}
    >
      <TextWidget text={glyph} style={{ fontSize: 17, color: hex(theme.muted) }} />
    </FlexWidget>
  );
}

// Drawn done: a checked circle that is no longer a tap target.
function Checked({ theme }: { theme: Theme }) {
  return (
    <FlexWidget style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
      <TextWidget text="✓" style={{ fontSize: 17, fontWeight: "700", color: hex(theme.brand) }} />
    </FlexWidget>
  );
}

// Why the last tap did not work (until the next refresh).
function Notice({ text, theme }: { text?: string; theme: Theme }) {
  return text ? <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 11, fontWeight: "500", color: hex(theme.late) }} /> : null;
}

function Message({ text, theme }: { text: string; theme: Theme }) {
  return (
    <FlexWidget style={{ flex: 1, justifyContent: "center", width: "match_parent" }}>
      <TextWidget text={text} maxLines={3} style={{ fontSize: 14, color: hex(theme.muted) }} />
    </FlexWidget>
  );
}

function Big({ value, label, theme }: { value: string; label: string; theme: Theme }) {
  return (
    <FlexWidget style={{ flexDirection: "column" }}>
      <TextWidget text={value} maxLines={1} style={{ fontSize: 34, fontWeight: "700", color: hex(theme.text) }} />
      {label ? <TextWidget text={label} maxLines={2} style={{ fontSize: 12, color: hex(theme.muted) }} /> : null}
    </FlexWidget>
  );
}

function SuiteWidget({ view, size, theme, widgetId }: { view: SuiteView; size: Size; theme: Theme; widgetId: number }) {
  const small = size.width < 200;
  const rows = Math.max(1, Math.min(8, Math.floor((size.height - 50) / 34)));
  switch (view.state) {
    case "closed":
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={frame(theme)} accessibilityLabel={`${view.title}: ${view.message}`}>
          <Header title={view.title} theme={theme} />
          <Message text={view.message} theme={theme} />
        </FlexWidget>
      );
    case "capture": {
      const buttons = small ? view.buttons.slice(0, 1) : view.buttons;
      const glyph = { note: "✎", task: "☑", voice: "🎤", photo: "📷" } as const;
      return (
        <FlexWidget style={frame(theme)}>
          <Header title={view.title} trailing={small ? "" : view.target} theme={theme} />
          <FlexWidget style={{ flex: 1, flexDirection: "row", width: "match_parent", alignItems: "center" }}>
            {buttons.map((button) => (
              <FlexWidget
                key={button.id}
                clickAction="OPEN_URI"
                clickActionData={{ uri: button.url }}
                accessibilityLabel={button.label}
                style={{ flex: 1, height: 64, marginRight: 6, borderRadius: 14, backgroundColor: hex(theme.line), alignItems: "center", justifyContent: "center", flexDirection: "column" }}
              >
                <TextWidget text={glyph[button.id]} style={{ fontSize: 20, color: hex(theme.brand) }} />
                <TextWidget text={button.label} maxLines={1} style={{ fontSize: 11, color: hex(theme.text) }} />
              </FlexWidget>
            ))}
          </FlexWidget>
        </FlexWidget>
      );
    }
    case "tasks":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={view.items.length ? view.headline : ""} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 34 }}>
              {item.done ? (
                <Checked theme={theme} />
              ) : item.complete ? (
                <Tap glyph="○" action={SUITE_CLICKS.complete} data={{ widgetId, ...item.complete }} label={`${item.text}`} theme={theme} />
              ) : (
                <FlexWidget style={{ width: 38 }} />
              )}
              <Row
                text={item.text}
                detail={item.hint || (small ? "" : item.detail)}
                alert={!!item.hint}
                done={item.done}
                right={small ? "" : item.due}
                late={item.late}
                url={item.url}
                theme={theme}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "calendar":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 34 }}>
              <TextWidget text={item.day ? `${item.day} ${item.when}` : item.when} maxLines={1} style={{ fontSize: 11, color: hex(theme.muted), width: small ? 44 : 78 }} />
              <FlexWidget style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: hex(item.task ? theme.muted : theme.brand), marginRight: 8 }} />
              <Row text={item.title} detail={small ? "" : item.calendar} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "list":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={small ? "" : view.columns.join(" · ")} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ width: "match_parent", height: 34, flexDirection: "row" }}>
              <Row text={item.title} detail={small ? "" : item.detail} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "counter": {
      const values = view.history.map((h) => h.value);
      const min = Math.min(...values),
        max = Math.max(...values);
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={frame(theme)} accessibilityLabel={`${view.title}: ${view.value} ${view.label}`}>
          <Header title={view.title} theme={theme} />
          <FlexWidget style={{ flex: 1 }} />
          <Big value={view.value} label={[view.label, view.group].filter(Boolean).join(" · ")} theme={theme} />
          {!small && view.history.length > 1 ? (
            <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 30, alignItems: "flex-end", marginTop: 6 }}>
              {view.history.map((point, index) => (
                <FlexWidget
                  key={index}
                  style={{
                    flex: 1,
                    marginLeft: 1,
                    borderRadius: 1,
                    height: Math.max(2, Math.round(((point.value - min) / Math.max(1e-9, max - min)) * 26) + 2),
                    // Estimated days lighter.
                    backgroundColor: hex(point.estimated ? theme.line : theme.brand),
                  }}
                />
              ))}
            </FlexWidget>
          ) : null}
          {!small && view.estimated ? <TextWidget text={view.estimated} style={{ fontSize: 10, color: hex(theme.muted), marginTop: 2 }} /> : null}
        </FlexWidget>
      );
    }
    case "journal":
      return (
        <FlexWidget style={frame(theme)}>
          <Header title={view.title} theme={theme} />
          {view.journal ? (
            <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.journal.url }} style={{ width: "match_parent", flexDirection: "column", marginBottom: 6 }}>
              <TextWidget text={`${view.journal.protected ? "🔒" : view.journal.written ? "✓" : "✎"} ${view.journal.name}`} maxLines={1} style={{ fontSize: 15, fontWeight: "600", color: hex(theme.text) }} />
              <TextWidget text={view.journal.line} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted) }} />
            </FlexWidget>
          ) : null}
          {view.habits ? (
            <FlexWidget style={{ width: "match_parent", flexDirection: "column" }}>
              <TextWidget text={`${view.habits.name} · ${view.habits.line}`} maxLines={1} style={{ fontSize: 12, fontWeight: "600", color: hex(theme.muted) }} />
              {view.habits.items.slice(0, Math.max(1, rows - (view.journal ? 2 : 0))).map((habit) => (
                <FlexWidget key={habit.fieldId} style={{ flexDirection: "row", alignItems: "center", height: 32, width: "match_parent" }}>
                  {habit.canWrite ? (
                    <Tap
                      glyph={habit.done ? "●" : "○"}
                      action={SUITE_CLICKS.habit}
                      data={{ widgetId, pageId: habit.pageId, fieldId: habit.fieldId, done: !habit.done, today: view.today }}
                      label={habit.name}
                      theme={theme}
                    />
                  ) : null}
                  <TextWidget text={habit.name} maxLines={1} style={{ fontSize: 14, color: hex(theme.text) }} />
                </FlexWidget>
              ))}
              <Notice text={view.notice} theme={theme} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      );
    case "time":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} theme={theme} />
          </FlexWidget>
          <Big value={view.week} label={view.today} theme={theme} />
          {!small && view.days.length ? (
            <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 34, alignItems: "flex-end", marginTop: 4 }}>
              {view.days.map((day, index) => (
                <FlexWidget key={index} style={{ flex: 1, marginLeft: 3, height: Math.max(2, Math.round(day.share * 30)), borderRadius: 2, backgroundColor: hex(day.today ? theme.brand : theme.line) }} />
              ))}
            </FlexWidget>
          ) : null}
          <FlexWidget style={{ flex: 1 }} />
          {view.timer ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}>
              <Tap glyph="■" action={SUITE_CLICKS.timerStop} data={{ widgetId }} label={view.stopLabel} theme={theme} />
              <Row text={view.timer.title} url={view.timer.url} theme={theme} />
            </FlexWidget>
          ) : view.start ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}>
              <Tap glyph="▶" action={SUITE_CLICKS.timerStart} data={{ widgetId, pageId: view.start.pageId, rowId: view.start.rowId, fieldId: view.start.fieldId }} label={view.startLabel} theme={theme} />
              <TextWidget text={view.start.title || view.startLabel} maxLines={1} style={{ fontSize: 13, color: hex(theme.text) }} />
            </FlexWidget>
          ) : (
            <TextWidget text={view.hint} maxLines={2} style={{ fontSize: 12, color: hex(theme.muted) }} />
          )}
          <Notice text={view.notice} theme={theme} />
        </FlexWidget>
      );
    case "mentions":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center" }}>
            <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ flex: 1 }}>
              <Header title={view.title} trailing={view.headline} theme={theme} />
            </FlexWidget>
            {view.items.some((item) => !item.read) && !small ? (
              <Tap glyph="✓" action={SUITE_CLICKS.readAll} data={{ widgetId }} label={view.readAllLabel} theme={theme} />
            ) : null}
          </FlexWidget>
          <Notice text={view.notice} theme={theme} />
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, Math.max(1, Math.floor(rows * 0.7))).map((item) => (
            <FlexWidget key={item.id} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 42 }}>
              <Row text={item.text} detail={item.when} url={item.url} theme={theme} />
              {!item.read && !small ? <Tap glyph="✉" action={SUITE_CLICKS.read} data={{ widgetId, notificationId: item.id }} label={view.readLabel} theme={theme} /> : null}
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "forms":
      return (
        <FlexWidget style={frame(theme)}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={view.headline} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ width: "match_parent", height: 34, flexDirection: "row", alignItems: "center" }}>
              <TextWidget text={item.isNew ? "●" : " "} style={{ fontSize: 9, color: hex(theme.brand), marginRight: 6 }} />
              <Row text={item.title} right={item.when} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
  }
}

export function renderSuite(view: SuiteView, size: Size, widgetId: number) {
  const themes = widgetThemes();
  return {
    light: <SuiteWidget view={view} size={size} theme={themes.light} widgetId={widgetId} />,
    dark: <SuiteWidget view={view} size={size} theme={themes.dark} widgetId={widgetId} />,
  };
}
