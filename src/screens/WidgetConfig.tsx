// Android: the settings of one configurable widget (opened when it is added
// and from "Configure" on the home screen; react-native-android-widget's
// configuration activity). First the widget's profile (none: the active one)
// and colours, then what it shows – the options come from that profile's
// instance (GET /api/mobile/widgets/options, with that profile's device
// token); the widget works with its defaults even when nothing is chosen.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { getLocales } from "expo-localization";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { pickLocale, setLocale, t } from "../i18n";
import { connectionFor, readConfigs, saveWidgetConfig, widgetBinding } from "../native/suite";
import { store } from "../store";
import { widgetOptions } from "../widgets/api";
import { CAPTURE_BUTTONS, kindOfWidget, MAX_STUDY_DECKS, normalizeConfig, widgetProfileId, WIDGET_COLORS, type ServerKind, type WidgetColor } from "../widgets/suite";
import { configFor } from "../widgets/widget-config";
import { Button, styles, usePalette } from "../ui";

type Json = Record<string, unknown>;
type Item = { value: string; label: string; detail?: string };
const list = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);
const str = (value: unknown) => (typeof value === "string" ? value : "");

// A page of an options answer; protected ones show their state.
const pageItem = (page: Json): Item => ({
  value: str(page.id),
  label: page.encrypted ? `🔒 ${t("widgetEncryptedShort")}` : page.locked ? `🔒 ${t("widgetLockedShort")}` : str(page.name),
  detail: [str(page.space), str(page.workspace)].filter(Boolean).join(" · "),
});
const named = (entries: unknown): Item[] => list(entries).map((e) => ({ value: String(e.id), label: str(e.name) }));

function Choice({ title, items, value, onChange }: { title: string; items: Item[]; value: string; onChange: (value: string) => void }) {
  const p = usePalette();
  if (!items.length) return null;
  return (
    <View>
      <Text style={[styles.label, { color: p.muted }]}>{title}</Text>
      <View style={{ backgroundColor: p.card, borderRadius: 12, overflow: "hidden" }}>
        {items.map((item, index) => (
          <Pressable
            key={item.value || index}
            accessibilityRole="radio"
            accessibilityState={{ checked: item.value === value }}
            onPress={() => onChange(item.value)}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: p.line }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.text, { color: p.text }]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.detail ? (
                <Text style={[styles.small, { color: p.muted }]} numberOfLines={1}>
                  {item.detail}
                </Text>
              ) : null}
            </View>
            {item.value === value ? <Text style={{ color: p.brand, fontSize: 18 }}>✓</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Many({ title, items, values, max, onChange }: { title: string; items: Item[]; values: string[]; max?: number; onChange: (values: string[]) => void }) {
  const p = usePalette();
  if (!items.length) return null;
  return (
    <View>
      <Text style={[styles.label, { color: p.muted }]}>{title}</Text>
      <View style={{ backgroundColor: p.card, borderRadius: 12, overflow: "hidden" }}>
        {items.map((item, index) => {
          const on = values.includes(item.value);
          return (
            <Pressable
              key={item.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onChange(on ? values.filter((v) => v !== item.value) : [...values, item.value].slice(-(max ?? 99)))}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: p.line }}
            >
              <Text style={[styles.text, { color: p.text, flex: 1 }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={{ color: on ? p.brand : p.muted, fontSize: 18 }}>{on ? "☑" : "☐"}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({ title, value, onChange }: { title: string; value: boolean; onChange: (value: boolean) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22 }}>
      <Text style={[styles.text, { color: p.text, flex: 1 }]}>{title}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

function Count({ title, value, min, max, onChange }: { title: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22 }}>
      <Text style={[styles.text, { color: p.text, flex: 1 }]}>{title}</Text>
      <Button title="−" kind="secondary" disabled={value <= min} onPress={() => onChange(value - 1)} style={{ minWidth: 48 }} />
      <Text style={[styles.text, { color: p.text, width: 40, textAlign: "center" }]} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Button title="+" kind="secondary" disabled={value >= max} onPress={() => onChange(value + 1)} style={{ minWidth: 48 }} />
    </View>
  );
}

export function WidgetConfigScreen({ widgetInfo, setResult }: WidgetConfigurationScreenProps) {
  setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
  const p = usePalette();
  const kind = kindOfWidget(widgetInfo.widgetName);
  const profiles = store.profiles();
  const [binding] = useState(() => widgetBinding(widgetInfo.widgetId));
  // "": the active profile, whichever it is.
  const [chosenProfile, setChosenProfile] = useState(binding.profile ?? "");
  const [color, setColor] = useState<WidgetColor>(binding.color);
  const profile = widgetProfileId(profiles, chosenProfile || null);
  const target = connectionFor(profile);
  const [config, setConfigState] = useState<Json>(() => (kind ? (configFor(readConfigs(), profile, widgetInfo.widgetId, kind) as unknown as Json) : {}));
  const [options, setOptions] = useState<Json | null>(null);
  const [database, setDatabase] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Json) => setConfigState((current) => ({ ...current, ...patch }));
  // The database whose views and properties are offered.
  const pageId = str(config.pageId);
  // "Key figure" of a database takes the counter's options, "My day" the
  // calendars of "Today" (and the habit databases of the journal, below).
  const figureDatabase = kind === "metric" && config.source === "database";
  const optionKind = (kind === "myday" ? "calendar" : kind === "time" ? "time" : figureDatabase ? "counter" : kind) as ServerKind | null;
  const needsDatabase = (kind === "tasks" && config.source === "view") || (kind === "pinned" && config.mode === "page") || kind === "counter" || figureDatabase;

  // Another profile: its settings for this widget, its instance's options.
  useEffect(() => {
    if (!kind) return;
    setConfigState(configFor(readConfigs(), profile, widgetInfo.widgetId, kind) as unknown as Json);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, profile]);
  // Its options (again when "Key figure" changes its source).
  useEffect(() => {
    if (!kind) return;
    setOptions(null);
    if (!target || !optionKind) return;
    void widgetOptions(target, optionKind).then((answer) => setOptions(answer.ok ? answer.value : {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, profile, optionKind]);
  // "My day": the habit databases, from the journal's options.
  const [habitOptions, setHabitOptions] = useState<Json[]>([]);
  useEffect(() => {
    setHabitOptions([]);
    if (kind !== "myday" || !target) return;
    void widgetOptions(target, "journal").then((answer) => answer.ok && setHabitOptions(list(answer.value.habits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, profile]);
  useEffect(() => {
    setDatabase(null);
    if (!kind || !target || !pageId || !needsDatabase || !optionKind) return;
    void widgetOptions(target, optionKind, pageId).then((answer) => answer.ok && setDatabase((answer.value.database as Json) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pageId, needsDatabase, profile]);
  const dashboardId = str(config.dashboardId);
  // The records of the chosen database (deadline: ?kind=deadline&pageId=…).
  const [records, setRecords] = useState<Json[]>([]);
  const deadlineDatabase = kind === "deadline" && !config.taskKey ? pageId : "";
  useEffect(() => {
    setRecords([]);
    if (!target || !deadlineDatabase) return;
    void widgetOptions(target, "deadline", deadlineDatabase).then((answer) => answer.ok && setRecords(list(answer.value.records)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineDatabase, profile]);

  const views = useMemo(() => [{ value: "", label: t("configAllRecords") }, ...named(database?.views)], [database]);
  const properties = useMemo(() => list(database?.properties), [database]);

  useEffect(() => {
    if (!kind) setResult("cancel");
  }, [kind, setResult]);
  if (!kind) return <View />;

  const save = async () => {
    setBusy(true);
    await saveWidgetConfig(widgetInfo.widgetName, widgetInfo.widgetId, normalizeConfig(kind, config), { profile: chosenProfile || undefined, color });
    setBusy(false);
    setResult("ok");
  };

  const o = options ?? {};
  let fields: ReactNode = null;
  switch (kind) {
    case "capture":
      fields = (
        <>
          <Choice title={t("configTarget")} items={[{ value: "", label: t("configDefault") }, ...list(o.targets).map(pageItem)]} value={str(config.targetId)} onChange={(v) => set({ targetId: v || undefined })} />
          <Many
            title={t("configButtons")}
            items={CAPTURE_BUTTONS.map((b) => ({ value: b, label: t(({ note: "captureNote", task: "captureTask", voice: "captureVoice", photo: "capturePhoto" } as const)[b]) }))}
            values={(config.buttons as string[]) ?? []}
            onChange={(buttons) => set({ buttons })}
          />
        </>
      );
      break;
    case "tasks":
      fields = (
        <>
          <Choice title={t("configSource")} items={named(o.sources)} value={str(config.source)} onChange={(v) => set({ source: v, pageId: undefined, viewId: undefined })} />
          {config.source === "view" ? <Choice title={t("configDatabase")} items={list(o.databases).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v, viewId: undefined })} /> : null}
          {config.source === "view" && database ? <Choice title={t("configView")} items={views} value={str(config.viewId)} onChange={(v) => set({ viewId: v || undefined })} /> : null}
          {config.source === "page" ? <Choice title={t("configPage")} items={list(o.pages).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v })} /> : null}
          <Choice title={t("configFilter")} items={named(o.filters)} value={str(config.filter)} onChange={(v) => set({ filter: v })} />
        </>
      );
      break;
    case "calendar":
    case "myday": {
      const calendars = list(o.calendars).map((c) => ({ value: `${str(c.pageId)}|${str(c.viewId)}`, label: str(c.name), detail: str(c.synced) || str(c.database) }));
      const chosen = list(config.sources).map((s) => `${str(s.pageId)}|${str(s.viewId)}`);
      fields = (
        <>
          <Many
            title={`${t("configCalendars")} (${chosen.length ? chosen.length : t("configAll")})`}
            items={calendars}
            values={chosen}
            max={10}
            onChange={(values) => set({ sources: values.map((v) => ({ pageId: v.split("|")[0], viewId: v.split("|")[1] || undefined })) })}
          />
          {kind === "myday" ? (
            // Today only, the tasks are my tasks: besides the calendars only
            // the habits (none: no habits row).
            <Choice title={t("configHabits")} items={[{ value: "", label: t("configNone") }, ...named(habitOptions)]} value={str(config.habitsId)} onChange={(v) => set({ habitsId: v || undefined })} />
          ) : (
            <>
              <Choice title={t("configRange")} items={named(o.ranges)} value={str(config.range)} onChange={(v) => set({ range: v })} />
              <Toggle title={t("configShowTasks")} value={config.tasks !== false} onChange={(tasks) => set({ tasks })} />
            </>
          )}
        </>
      );
      break;
    }
    case "pinned":
      fields = (
        <>
          <Choice
            title={t("configShow")}
            // "Recently opened" is the app's (the continue-reading answer).
            items={[...named(o.modes).filter((m) => m.value !== "recent"), { value: "recent", label: t("readingRecent") }]}
            value={str(config.mode)}
            onChange={(v) => set({ mode: v, pageId: undefined, viewId: undefined, properties: [] })}
          />
          {config.mode === "page" ? <Choice title={t("configPage")} items={list(o.pages).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v, viewId: undefined, properties: [] })} /> : null}
          {config.mode === "page" && database ? <Choice title={t("configView")} items={views} value={str(config.viewId)} onChange={(v) => set({ viewId: v || undefined })} /> : null}
          {config.mode === "page" && database ? (
            <Many title={t("configProperties")} items={named(properties)} values={(config.properties as string[]) ?? []} max={2} onChange={(values) => set({ properties: values })} />
          ) : null}
        </>
      );
      break;
    case "counter":
    case "metric": {
      const groupField = properties.find((f) => f.id === config.groupFieldId);
      const groupValues: Item[] =
        groupField?.type === "checkbox"
          ? [
              { value: "true", label: "☑" },
              { value: "false", label: "☐" },
            ]
          : list(groupField?.values).map((v) => ({ value: str(v.value ?? v.name ?? v), label: str(v.name ?? v.value ?? v) }));
      // "Key figure": a dashboard's tile, or a database's number.
      const source = (
        <Choice
          title={t("configSource")}
          items={[
            { value: "dashboard", label: t("configDashboard") },
            { value: "database", label: t("configDatabase") },
          ]}
          value={str(config.source) || "dashboard"}
          onChange={(v) => set({ source: v, pageId: undefined, dashboardId: undefined, widgetId: undefined, viewId: undefined, fieldId: undefined, groupFieldId: undefined, groupValue: undefined })}
        />
      );
      if (kind === "metric" && !figureDatabase) {
        fields = (
          <>
            {source}
            <Choice title={t("configDashboard")} items={list(o.dashboards).map(pageItem)} value={dashboardId} onChange={(v) => set({ dashboardId: v, widgetId: undefined })} />
            {dashboardId ? (
              <Choice
                title={t("configFigure")}
                items={named(list(o.dashboards).find((d) => str(d.id) === dashboardId)?.widgets)}
                value={str(config.widgetId)}
                onChange={(v) => set({ widgetId: v })}
              />
            ) : null}
          </>
        );
        break;
      }
      fields = (
        <>
          {kind === "metric" ? source : null}
          <Choice title={t("configDatabase")} items={list(o.databases).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v, viewId: undefined, fieldId: undefined, groupFieldId: undefined, groupValue: undefined })} />
          {database ? <Choice title={t("configView")} items={views} value={str(config.viewId)} onChange={(v) => set({ viewId: v || undefined })} /> : null}
          <Choice title={t("configValue")} items={named(o.aggregates)} value={str(config.aggregate)} onChange={(v) => set({ aggregate: v })} />
          {config.aggregate !== "count" && database ? (
            <Choice title={t("configNumberField")} items={named(properties.filter((f) => f.type === "number"))} value={str(config.fieldId)} onChange={(v) => set({ fieldId: v })} />
          ) : null}
          {database ? (
            <Choice
              title={t("configGroup")}
              items={[{ value: "", label: t("configNone") }, ...named(properties.filter((f) => f.type === "checkbox" || Array.isArray(f.values)))]}
              value={str(config.groupFieldId)}
              onChange={(v) => set({ groupFieldId: v || undefined, groupValue: undefined })}
            />
          ) : null}
          {groupField ? <Choice title={t("configGroupValue")} items={groupValues} value={str(config.groupValue)} onChange={(v) => set({ groupValue: v })} /> : null}
          {kind === "counter" ? <Toggle title={t("configHistory")} value={config.history !== false} onChange={(history) => set({ history })} /> : null}
        </>
      );
      break;
    }
    case "journal":
      fields = (
        <>
          <Choice title={t("configJournal")} items={[{ value: "", label: t("configDefault") }, ...list(o.journals).map(pageItem)]} value={str(config.journalId)} onChange={(v) => set({ journalId: v || undefined })} />
          <Choice title={t("configHabits")} items={[{ value: "", label: t("configNone") }, ...named(o.habits)]} value={str(config.habitsId)} onChange={(v) => set({ habitsId: v || undefined })} />
        </>
      );
      break;
    case "time": {
      const timer = (config.timer ?? {}) as Json;
      fields = (
        <Choice
          title={t("configTimer")}
          items={[{ value: "", label: t("configLatest") }, ...list(o.recent).map((r) => ({ value: `${str(r.pageId)}|${str(r.rowId)}|${str(r.fieldId)}`, label: str(r.title), detail: str(r.database) }))]}
          value={timer.rowId ? `${str(timer.pageId)}|${str(timer.rowId)}|${str(timer.fieldId)}` : ""}
          onChange={(v) => {
            const [pageId, rowId, fieldId] = v.split("|");
            set({ timer: v ? { pageId, rowId, fieldId } : undefined });
          }}
        />
      );
      break;
    }
    case "mentions":
      fields = (
        <>
          <Choice title={t("configShow")} items={named(o.show)} value={str(config.show)} onChange={(v) => set({ show: v })} />
          <Toggle title={t("configUnreadOnly")} value={config.unreadOnly !== false} onChange={(unreadOnly) => set({ unreadOnly })} />
          <Count title={t("configCount")} value={Number(config.max) || 5} min={1} max={10} onChange={(max) => set({ max })} />
        </>
      );
      break;
    case "forms":
      fields = (
        <>
          <Choice title={t("configForm")} items={list(o.forms).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v })} />
          <Count title={t("configCount")} value={Number(config.max) || 3} min={1} max={5} onChange={(max) => set({ max })} />
        </>
      );
      break;
    case "event": {
      const calendars = list(o.calendars).map((c) => ({ value: str(c.id) || [str(c.pageId), str(c.viewId)].filter(Boolean).join(":"), label: str(c.name), detail: str(c.synced) || str(c.database) }));
      const chosen = (Array.isArray(config.calendars) ? config.calendars : []).filter((c): c is string => typeof c === "string");
      fields = (
        <>
          <Many
            title={`${t("configCalendars")} (${chosen.length ? chosen.length : t("configAll")})`}
            items={calendars}
            values={chosen}
            max={10}
            onChange={(calendars) => set({ calendars })}
          />
          <Choice
            title={t("configWithin")}
            items={[
              { value: "today", label: t("withinToday") },
              { value: "48h", label: t("within48h") },
              { value: "week", label: t("withinWeek") },
            ]}
            value={str(config.within)}
            onChange={(v) => set({ within: v })}
          />
          <Toggle title={t("configShowJoin")} value={config.showJoin !== false} onChange={(showJoin) => set({ showJoin })} />
        </>
      );
      break;
    }
    case "reading":
      fields = (
        <>
          <Choice
            title={t("configSource")}
            items={[
              { value: "recent", label: t("readingRecent") },
              { value: "library", label: t("readingLibrary") },
            ]}
            value={str(config.source)}
            onChange={(v) => set({ source: v })}
          />
          <Count title={t("configCount")} value={Number(config.max) || 3} min={1} max={6} onChange={(max) => set({ max })} />
        </>
      );
      break;
    case "deadline": {
      // A record of a database with a due date, or one of my open tasks.
      const tasks = list(o.tasks);
      const taskValue = (task: Json) => `${str(task.pageId)}|${str(task.rowId)}|${typeof task.index === "number" ? task.index : ""}|${str(task.taskKey)}`;
      const pickTasks = !!config.taskKey || config.tasksPicked === true;
      fields = (
        <>
          <Choice
            title={t("configSource")}
            items={[...list(o.databases).map(pageItem), ...(tasks.length ? [{ value: "tasks", label: t("widgetTasks") }] : [])]}
            value={pickTasks ? "tasks" : pageId}
            onChange={(v) => setConfigState(v === "tasks" ? { tasksPicked: true } : { pageId: v })}
          />
          {!pickTasks && pageId ? (
            <Choice
              title={t("configRecord")}
              items={records.map((r) => ({ value: str(r.id), label: str(r.title), detail: str(r.due) }))}
              value={str(config.rowId)}
              onChange={(v) => set({ rowId: v })}
            />
          ) : null}
          {pickTasks ? (
            <Choice
              title={t("captureTask")}
              items={tasks.map((task) => ({ value: taskValue(task), label: str(task.text), detail: [str(task.page), str(task.due)].filter(Boolean).join(" · ") }))}
              value={config.taskKey ? `${str(config.pageId)}|${str(config.rowId)}|${typeof config.index === "number" ? config.index : ""}|${str(config.taskKey)}` : ""}
              onChange={(v) => {
                const [taskPage, taskRow, index, ...key] = v.split("|");
                setConfigState({ tasksPicked: true, pageId: taskPage, rowId: taskRow || undefined, index: index ? Number(index) : undefined, taskKey: key.join("|") });
              }}
            />
          ) : null}
        </>
      );
      break;
    }
    case "study": {
      // "Karten fällig" (#352): none chosen counts all decks.
      const chosen = (Array.isArray(config.pageIds) ? config.pageIds : []).filter((id): id is string => typeof id === "string");
      fields = (
        <Many
          title={`${t("configDecks")} (${chosen.length ? chosen.length : t("configAll")})`}
          items={named(o.decks)}
          values={chosen}
          max={MAX_STUDY_DECKS}
          onChange={(pageIds) => set({ pageIds })}
        />
      );
      break;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[styles.title, { color: p.text, textAlign: "left" }]} accessibilityRole="header">
          {t("configTitle")}
        </Text>
        {profiles.profiles.length > 1 ? (
          <Choice
            title={t("configProfile")}
            items={[
              { value: "", label: t("configActiveProfile") },
              ...profiles.profiles.map((entry) => ({ value: entry.id, label: entry.name, detail: entry.id === profiles.active ? t("active") : undefined })),
            ]}
            value={chosenProfile}
            onChange={setChosenProfile}
          />
        ) : null}
        <Choice
          title={t("configColor")}
          items={WIDGET_COLORS.map((value) => ({
            value,
            label: t(({ accent: "colorAccent", profile: "colorProfile", system: "colorSystem", flowplan: "colorFlowplan" } as const)[value]),
          }))}
          value={color}
          onChange={(v) => setColor(v as WidgetColor)}
        />
        {!target ? (
          <Text style={[styles.text, { color: p.muted, marginTop: 22 }]}>{t("widgetSignIn")}</Text>
        ) : options === null ? (
          <Text style={[styles.text, { color: p.muted }]}>{t("configLoading")}</Text>
        ) : (
          fields
        )}
        <View style={[styles.row, { marginTop: 28 }]}>
          <Button title={t("cancel")} kind="secondary" onPress={() => setResult("cancel")} style={{ flex: 1 }} />
          <Button title={t("save")} busy={busy} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}
