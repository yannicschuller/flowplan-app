// Android: the configurable widgets, drawn from React into RemoteViews
// (react-native-android-widget). Same content as on iOS (present.ts makes
// the texts); small widgets show less. Taps on a checkbox, "read" or the
// timer run the action in the background (widget-task.ts → native/suite.ts),
// everything else opens the page in the app ("Join" opens the video call).
//
// Material 3: the launcher's corner radii (Android 12+, widgetRadii), tap
// targets of 40 dp, one accent per widget – the workspace's (default), the
// profile's, the system's Material You or Flowplan's (the widget's
// "Colours" setting, suite.ts → widgetAccent).
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { DARK, hex, LIGHT, widgetThemes, type Theme } from "./android";
import { accentThemes, type Themes } from "../android/theme";
import { widgetRadii } from "../../modules/flowplan-android/src";
import { taskRows, type ClosedView, type SuiteView } from "./present";
import type { Accent } from "./suite";

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
// The corner radii: the launcher's, Material 3's defaults before Android 12.
export type Radii = { background: number; inner: number };
const DEFAULT_RADII: Radii = { background: 24, inner: 12 };
export function suiteRadii(): Radii {
  const radii = widgetRadii();
  return radii && radii.background > 0 ? { background: Math.min(40, radii.background), inner: Math.min(28, Math.max(4, radii.inner)) } : DEFAULT_RADII;
}
type Look = { theme: Theme; radii: Radii };

const frame = ({ theme, radii }: Look) =>
  ({ height: "match_parent", width: "match_parent", flexDirection: "column", padding: 16, backgroundColor: hex(theme.background), borderRadius: radii.background }) as const;

function Header({ title, trailing, theme }: { title: string; trailing?: string; theme: Theme }) {
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginBottom: 6 }}>
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget text={title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: "600", color: hex(theme.brand) }} />
      </FlexWidget>
      {trailing ? <TextWidget text={trailing} maxLines={1} style={{ fontSize: 12, fontWeight: "500", color: hex(theme.muted), marginLeft: 8 }} /> : null}
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
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: url }} style={{ flex: 1, flexDirection: "row", alignItems: "center", height: "match_parent" }} accessibilityLabel={[text, detail, right].filter(Boolean).join(", ")}>
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(done ? theme.muted : theme.text) }} />
        {detail ? <TextWidget text={detail} maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: alert ? "500" : "400", color: hex(alert ? theme.late : theme.muted) }} /> : null}
      </FlexWidget>
      {right ? <TextWidget text={right} maxLines={1} style={{ fontSize: 12, fontWeight: "500", color: hex(late ? theme.late : theme.muted), marginLeft: 8 }} /> : null}
    </FlexWidget>
  );
}

// A round tap target with a glyph (checkbox, read, play, stop): 40 dp.
function Tap({ glyph, action, data, label, theme, filled }: { glyph: string; action: string; data: Record<string, unknown>; label: string; theme: Theme; filled?: boolean }) {
  return (
    <FlexWidget
      clickAction={action}
      clickActionData={data}
      accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 4, ...(filled ? { backgroundColor: hex(theme.line) } : {}) }}
    >
      <TextWidget text={glyph} style={{ fontSize: 18, color: hex(filled ? theme.brand : theme.muted) }} />
    </FlexWidget>
  );
}

// Drawn done: a checked circle that is no longer a tap target.
function Checked({ theme }: { theme: Theme }) {
  return (
    <FlexWidget style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 4 }}>
      <TextWidget text="✓" style={{ fontSize: 18, fontWeight: "700", color: hex(theme.brand) }} />
    </FlexWidget>
  );
}

// Why the last tap did not work (until the next refresh).
function Notice({ text, theme }: { text?: string; theme: Theme }) {
  return text ? <TextWidget text={text} maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: "500", color: hex(theme.late) }} /> : null;
}

// The last update, quiet at the bottom ("Updated 14:05"); older than an
// hour with a warning ("⚠ As of 01:10"). Small widgets: only the warning.
function Footer({ view, theme, small }: { view: SuiteView; theme: Theme; small: boolean }) {
  if (!view.updated || (small && !view.old)) return null;
  return (
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", marginTop: 4 }}>
      <TextWidget
        text={view.old ? `⚠ ${view.updated}` : view.updated}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 11, color: hex(view.old ? theme.late : theme.muted) }}
      />
    </FlexWidget>
  );
}

// The heading of a group in a list (Overdue, Today, Later).
function Heading({ text, theme, late }: { text: string; theme: Theme; late?: boolean }) {
  return <TextWidget text={text.toUpperCase()} maxLines={1} style={{ fontSize: 11, fontWeight: "600", color: hex(late ? theme.late : theme.muted), marginTop: 4 }} />;
}

function Message({ text, theme }: { text: string; theme: Theme }) {
  return (
    <FlexWidget style={{ flex: 1, justifyContent: "center", width: "match_parent" }}>
      <TextWidget text={text} maxLines={3} style={{ fontSize: 14, color: hex(theme.muted) }} />
    </FlexWidget>
  );
}

function Big({ value, label, theme, size = 34, color }: { value: string; label: string; theme: Theme; size?: number; color?: string }) {
  return (
    <FlexWidget style={{ flexDirection: "column" }}>
      <TextWidget text={value} maxLines={1} style={{ fontSize: size, fontWeight: "700", color: hex(color ?? theme.text) }} />
      {label ? <TextWidget text={label} maxLines={2} style={{ fontSize: 12, color: hex(theme.muted) }} /> : null}
    </FlexWidget>
  );
}

// A bar from 0 to 1.
function Bar({ share, theme, color, height = 4 }: { share: number; theme: Theme; color?: string; height?: number }) {
  const filled = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", height, borderRadius: height / 2, backgroundColor: hex(theme.line), marginTop: 4 }}>
      {filled > 0 ? <FlexWidget style={{ flex: filled, height, borderRadius: height / 2, backgroundColor: hex(color ?? theme.brand) }} /> : null}
      {filled < 100 ? <FlexWidget style={{ flex: 100 - filled, height }} /> : null}
    </FlexWidget>
  );
}

// Columns from the lowest to the highest value (counter, key figure).
function Spark({ values, theme, height = 30, light }: { values: number[]; theme: Theme; height?: number; light?: boolean[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values),
    max = Math.max(...values);
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", height, alignItems: "flex-end", marginTop: 6 }}>
      {values.map((value, index) => (
        <FlexWidget
          key={index}
          style={{
            flex: 1,
            marginLeft: 1,
            borderRadius: 1,
            height: Math.max(2, Math.round(((value - min) / Math.max(1e-9, max - min)) * (height - 4)) + 2),
            backgroundColor: hex(light?.[index] ? theme.line : theme.brand),
          }}
        />
      ))}
    </FlexWidget>
  );
}

const CLOSED_GLYPHS: Record<ClosedView["reason"], string> = {
  signedOut: "→",
  setup: "⚙",
  gone: "!",
  forbidden: "!",
  offline: "⟳",
  locked: "🔒",
  encrypted: "🔒",
  outdated: "↑",
};

// Every widget: its content and the footer (not on quick capture).
function SuiteWidget(props: { view: SuiteView; size: Size; look: Look; widgetId: number }) {
  const { view, size, look } = props;
  const content = SuiteContent(props);
  if (view.state === "closed" || view.state === "capture" || !view.updated || (size.width < 200 && !view.old)) return content;
  return (
    <FlexWidget style={frame(look)}>
      <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column" }}>{content}</FlexWidget>
      <Footer view={view} theme={look.theme} small={size.width < 200} />
    </FlexWidget>
  );
}

// The rows of a list that fit (40 dp each, the tap targets' height): the
// header and the footer taken off, up to ten.
export function suiteRows(size: Size, footer = true) {
  return Math.max(1, Math.min(10, Math.floor((size.height - 56 - (footer ? 16 : 0)) / 40)));
}

function SuiteContent({ view, size, look, widgetId }: { view: SuiteView; size: Size; look: Look; widgetId: number }) {
  const { theme, radii } = look;
  // Inside SuiteWidget's frame (with the footer) the content has no frame
  // of its own.
  const framed = view.state === "closed" || view.state === "capture" || !view.updated || (size.width < 200 && !view.old);
  const box = framed ? frame(look) : ({ height: "match_parent", width: "match_parent", flexDirection: "column" } as const);
  const small = size.width < 200;
  const rows = suiteRows(size, !framed);
  switch (view.state) {
    case "closed":
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={box} accessibilityLabel={`${view.title}: ${view.message}`}>
          <Header title={view.title} theme={theme} />
          <FlexWidget style={{ flex: 1, justifyContent: "center", width: "match_parent", flexDirection: "column" }}>
            <TextWidget text={CLOSED_GLYPHS[view.reason]} style={{ fontSize: 20, color: hex(theme.brand), marginBottom: 4 }} />
            <TextWidget text={view.message} maxLines={3} style={{ fontSize: 14, color: hex(theme.muted) }} />
          </FlexWidget>
        </FlexWidget>
      );
    case "capture": {
      const buttons = small ? view.buttons.slice(0, 1) : view.buttons;
      const glyph = { note: "✎", task: "☑", voice: "🎤", photo: "📷" } as const;
      return (
        <FlexWidget style={box}>
          <Header title={view.title} trailing={small ? "" : view.target} theme={theme} />
          <FlexWidget style={{ flex: 1, flexDirection: "row", width: "match_parent", alignItems: "center" }}>
            {buttons.map((button, index) => (
              <FlexWidget
                key={button.id}
                clickAction="OPEN_URI"
                clickActionData={{ uri: button.url }}
                accessibilityLabel={button.label}
                style={{
                  flex: 1,
                  height: "match_parent",
                  marginLeft: index ? 8 : 0,
                  borderRadius: radii.inner,
                  backgroundColor: hex(theme.line),
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <TextWidget text={glyph[button.id]} style={{ fontSize: 22, color: hex(theme.brand) }} />
                <TextWidget text={button.label} maxLines={1} style={{ fontSize: 12, fontWeight: "500", color: hex(theme.text), marginTop: 2 }} />
              </FlexWidget>
            ))}
          </FlexWidget>
        </FlexWidget>
      );
    }
    case "tasks":
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={view.items.length ? view.headline : ""} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.length || small ? null : (
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: view.add.url }}
              accessibilityLabel={view.add.label}
              style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: hex(theme.line), alignItems: "center", justifyContent: "center", marginBottom: 4 }}
            >
              <TextWidget text={`＋ ${view.add.label}`} maxLines={1} style={{ fontSize: 14, fontWeight: "600", color: hex(theme.brand) }} />
            </FlexWidget>
          )}
          {taskRows(view.items, rows).map(({ item, heading }, index) => (
            <FlexWidget key={index} style={{ width: "match_parent", flexDirection: "column" }}>
            {heading !== undefined ? <Heading text={view.groups[heading]} late={heading === 0} theme={theme} /> : null}
            <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 40 }}>
              {item.done ? (
                <Checked theme={theme} />
              ) : item.complete ? (
                <Tap glyph="○" action={SUITE_CLICKS.complete} data={{ widgetId, ...item.complete }} label={`${item.text}`} theme={theme} />
              ) : (
                <FlexWidget style={{ width: 44 }} />
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
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "calendar":
      // Small: the next appointment with its countdown and "Join".
      if (small && view.next) {
        const next = view.next;
        return (
          <FlexWidget style={box}>
            <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: next.url }} style={{ width: "match_parent", flexDirection: "column" }} accessibilityLabel={[next.title, next.when, next.countdown].filter(Boolean).join(", ")}>
              <Header title={view.title} trailing={view.unread ? `@ ${view.unread}` : ""} theme={theme} />
              {next.countdown ? <TextWidget text={next.countdown} maxLines={1} style={{ fontSize: 20, fontWeight: "700", color: hex(theme.brand) }} /> : null}
              <TextWidget text={next.title} maxLines={2} truncate="END" style={{ fontSize: 16, fontWeight: "600", color: hex(theme.text) }} />
              <TextWidget text={next.when} maxLines={1} truncate="END" style={{ fontSize: 12, color: hex(theme.muted), marginTop: 2 }} />
            </FlexWidget>
            <FlexWidget style={{ flex: 1 }} />
            {next.join ? (
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: next.join }}
                accessibilityLabel={`${view.joinLabel}: ${next.title}`}
                style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: hex(theme.brand), alignItems: "center", justifyContent: "center" }}
              >
                <TextWidget text={view.joinLabel} maxLines={1} style={{ fontSize: 14, fontWeight: "600", color: hex(theme.background) }} />
              </FlexWidget>
            ) : null}
          </FlexWidget>
        );
      }
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={view.unread ? `@ ${view.unread}` : ""} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 40 }}>
              <TextWidget text={item.day ? `${item.day} ${item.when}` : item.when} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted), width: small ? 46 : 80 }} />
              <FlexWidget style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: hex(item.task ? theme.muted : theme.brand), marginRight: 8 }} />
              <Row text={item.title} detail={small ? "" : item.calendar} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "list":
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={small ? "" : view.columns.join(" · ")} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ width: "match_parent", height: 40, flexDirection: "row" }}>
              <Row text={item.title} detail={small ? "" : item.detail} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "counter":
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={box} accessibilityLabel={`${view.title}: ${view.value} ${view.label}`}>
          <Header title={view.title} trailing={small ? "" : view.delta} theme={theme} />
          <FlexWidget style={{ flex: 1 }} />
          <Big value={view.value} label={[view.label, view.group, small ? view.delta : ""].filter(Boolean).join(" · ")} theme={theme} />
          {!small ? (
            <Spark
              values={view.history.map((h) => h.value)}
              // Estimated days lighter.
              light={view.history.map((h) => h.estimated)}
              theme={theme}
            />
          ) : null}
          {!small && view.estimated ? <TextWidget text={view.estimated} style={{ fontSize: 11, color: hex(theme.muted), marginTop: 2 }} /> : null}
        </FlexWidget>
      );
    case "journal":
      return (
        <FlexWidget style={box}>
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
              {view.habits.items.slice(0, Math.max(1, rows - (view.journal ? 1 : 0))).map((habit) => (
                <FlexWidget key={habit.fieldId} style={{ flexDirection: "row", alignItems: "center", height: 40, width: "match_parent" }}>
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
        <FlexWidget style={box}>
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
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent", height: 40 }}>
              <Tap glyph="■" action={SUITE_CLICKS.timerStop} data={{ widgetId }} label={view.stopLabel} theme={theme} filled />
              <Row text={view.timer.title} url={view.timer.url} theme={theme} />
            </FlexWidget>
          ) : view.start ? (
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent", height: 40 }}>
              <Tap glyph="▶" action={SUITE_CLICKS.timerStart} data={{ widgetId, pageId: view.start.pageId, rowId: view.start.rowId, fieldId: view.start.fieldId }} label={view.startLabel} theme={theme} filled />
              <TextWidget text={view.start.title || view.startLabel} maxLines={1} style={{ fontSize: 14, color: hex(theme.text) }} />
            </FlexWidget>
          ) : (
            <TextWidget text={view.hint} maxLines={2} style={{ fontSize: 12, color: hex(theme.muted) }} />
          )}
          <Notice text={view.notice} theme={theme} />
        </FlexWidget>
      );
    case "mentions":
      return (
        <FlexWidget style={box}>
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
          {view.items.slice(0, Math.max(1, Math.floor(rows * 0.8))).map((item) => (
            <FlexWidget key={item.id} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 44 }}>
              <Row text={item.text} detail={item.when} url={item.url} theme={theme} />
              {!item.read && !small ? <Tap glyph="✉" action={SUITE_CLICKS.read} data={{ widgetId, notificationId: item.id }} label={view.readLabel} theme={theme} /> : null}
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "forms":
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} trailing={view.headline} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, rows).map((item, index) => (
            <FlexWidget key={index} style={{ width: "match_parent", height: 40, flexDirection: "row", alignItems: "center" }}>
              <TextWidget text={item.isNew ? "●" : " "} style={{ fontSize: 9, color: hex(theme.brand), marginRight: 8 }} />
              <Row text={item.title} right={item.when} url={item.url} theme={theme} />
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "study":
      // "Karten fällig": the number, the next deck and the streak; wider
      // widgets list the decks (each opens its deck).
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }} accessibilityLabel={`${view.title}: ${view.count}`}>
            <Header title={view.title} trailing={small ? "" : view.detail} theme={theme} />
          </FlexWidget>
          {small || !view.decks.length ? (
            <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ flex: 1, width: "match_parent", flexDirection: "column", justifyContent: "flex-end" }}>
              <Big value={view.count} label={view.label} theme={theme} />
              {small && view.detail ? <TextWidget text={view.detail} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted) }} /> : null}
            </FlexWidget>
          ) : (
            <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row" }}>
              <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: 96, height: "match_parent", flexDirection: "column", justifyContent: "flex-end" }}>
                <Big value={view.count} label="" theme={theme} />
              </FlexWidget>
              <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
                {view.decks.slice(0, rows).map((deck, index) => (
                  <FlexWidget key={index} style={{ width: "match_parent", height: 40, flexDirection: "row" }}>
                    <Row text={deck.title} right={deck.due} url={deck.url} theme={theme} />
                  </FlexWidget>
                ))}
              </FlexWidget>
            </FlexWidget>
          )}
        </FlexWidget>
      );
    case "event": {
      // "Nächster Termin": the next appointment big with its countdown and
      // "Join" for a video call; taller widgets list what follows.
      const [next, ...later] = view.items;
      if (!next)
        return (
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={box}>
            <Header title={view.title} theme={theme} />
            <Message text={view.empty} theme={theme} />
          </FlexWidget>
        );
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: next.url }} style={{ width: "match_parent", flexDirection: "column" }} accessibilityLabel={[next.title, next.when, next.countdown, next.location].filter(Boolean).join(", ")}>
            <Header title={view.title} trailing={small ? "" : next.countdown} theme={theme} />
            {small && next.countdown ? <TextWidget text={next.countdown} maxLines={1} style={{ fontSize: 20, fontWeight: "700", color: hex(theme.brand) }} /> : null}
            <TextWidget text={next.title} maxLines={small ? 2 : 1} truncate="END" style={{ fontSize: 16, fontWeight: "600", color: hex(theme.text) }} />
            <TextWidget text={[next.when, small ? "" : next.location || next.calendar].filter(Boolean).join(" · ")} maxLines={1} truncate="END" style={{ fontSize: 12, color: hex(theme.muted), marginTop: 2 }} />
          </FlexWidget>
          {next.join ? (
            <FlexWidget
              clickAction="OPEN_URI"
              clickActionData={{ uri: next.join }}
              accessibilityLabel={`${view.joinLabel}: ${next.title}`}
              style={{ marginTop: 8, height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: hex(theme.brand), alignItems: "center", justifyContent: "center" }}
            >
              <TextWidget text={view.joinLabel} maxLines={1} style={{ fontSize: 14, fontWeight: "600", color: hex(theme.background) }} />
            </FlexWidget>
          ) : null}
          <FlexWidget style={{ flex: 1 }} />
          {!small
            ? later.slice(0, Math.max(0, rows - (next.join ? 3 : 2))).map((item, index) => (
                <FlexWidget key={index} style={{ flexDirection: "row", width: "match_parent", alignItems: "center", height: 40 }}>
                  <FlexWidget style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: hex(theme.line), marginRight: 8 }} />
                  <Row text={item.title} detail={item.when} url={item.url} theme={theme} />
                </FlexWidget>
              ))
            : null}
        </FlexWidget>
      );
    }
    case "reading":
      return (
        <FlexWidget style={box}>
          <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={{ width: "match_parent" }}>
            <Header title={view.title} theme={theme} />
          </FlexWidget>
          {view.items.length ? null : <Message text={view.empty} theme={theme} />}
          {view.items.slice(0, small ? 2 : rows).map((item, index) => (
            <FlexWidget key={index} clickAction="OPEN_URI" clickActionData={{ uri: item.url }} style={{ width: "match_parent", height: 44, flexDirection: "column", justifyContent: "center" }} accessibilityLabel={[item.title, item.detail].filter(Boolean).join(", ")}>
              <TextWidget text={item.title} maxLines={1} truncate="END" style={{ fontSize: 14, color: hex(theme.text) }} />
              {item.progress !== undefined ? (
                <Bar share={item.progress} theme={theme} />
              ) : item.detail && !small ? (
                <TextWidget text={item.detail} maxLines={1} style={{ fontSize: 12, color: hex(theme.muted) }} />
              ) : null}
            </FlexWidget>
          ))}
        </FlexWidget>
      );
    case "metric":
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={box} accessibilityLabel={`${view.title}: ${view.value} ${view.unit} ${view.delta}`}>
          <Header title={view.title} trailing={small ? "" : view.delta} theme={theme} />
          <FlexWidget style={{ flex: 1 }} />
          <Big value={view.unit && !view.value.includes(view.unit) ? `${view.value} ${view.unit}` : view.value} label={small && view.delta ? `${view.label} ${view.delta}`.trim() : view.label} theme={theme} />
          {!small ? <Spark values={view.series} theme={theme} /> : null}
        </FlexWidget>
      );
    case "deadline": {
      const tone = view.done ? theme.ok : view.overdue ? theme.late : theme.brand;
      return (
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: view.url }} style={box} accessibilityLabel={[view.title, view.countdown, view.due].filter(Boolean).join(", ")}>
          <Header title={view.title} theme={theme} />
          <FlexWidget style={{ flex: 1 }} />
          <Big value={view.countdown} label={view.due} theme={theme} size={small ? 24 : 30} color={tone} />
          {view.share !== undefined && !view.done ? <Bar share={view.share} theme={theme} color={tone} height={6} /> : null}
        </FlexWidget>
      );
    }
  }
}

// The light and dark colours of one widget: the system's Material You for
// "system", otherwise Flowplan's surfaces in the chosen accent.
export function suiteThemes(accent: Accent | "system"): Themes {
  return accent === "system" ? widgetThemes() : accentThemes(accent, { light: LIGHT, dark: DARK });
}

export function renderSuite(view: SuiteView, size: Size, widgetId: number, accent: Accent | "system" = "system", radii: Radii = suiteRadii()) {
  const themes = suiteThemes(accent);
  return {
    light: <SuiteWidget view={view} size={size} look={{ theme: themes.light, radii }} widgetId={widgetId} />,
    dark: <SuiteWidget view={view} size={size} look={{ theme: themes.dark, radii }} widgetId={widgetId} />,
  };
}
