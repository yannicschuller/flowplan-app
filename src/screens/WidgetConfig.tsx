// Android: the settings of one configurable widget (opened when it is added
// and from "Configure" on the home screen; react-native-android-widget's
// configuration activity). The options come from the instance
// (GET /api/mobile/widgets/options); the widget works with its defaults
// even when nothing is chosen.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { getLocales } from "expo-localization";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { pickLocale, setLocale, t } from "../i18n";
import { connection, readConfigs, saveWidgetConfig } from "../native/suite";
import { store } from "../store";
import { widgetOptions } from "../widgets/api";
import { CAPTURE_BUTTONS, kindOfWidget, normalizeConfig } from "../widgets/suite";
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
  const target = connection();
  const [config, setConfigState] = useState<Json>(() =>
    kind ? (configFor(readConfigs(), store.profiles().active, widgetInfo.widgetId, kind) as unknown as Json) : {},
  );
  const [options, setOptions] = useState<Json | null>(null);
  const [database, setDatabase] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Json) => setConfigState((current) => ({ ...current, ...patch }));
  // The database whose views and properties are offered.
  const pageId = str(config.pageId);
  const needsDatabase = (kind === "tasks" && config.source === "view") || (kind === "pinned" && config.mode === "page") || kind === "counter";

  useEffect(() => {
    if (!kind || !target) return;
    void widgetOptions(target, kind === "time" ? "time" : kind).then((answer) => setOptions(answer.ok ? answer.value : {}));
  }, [kind]);
  useEffect(() => {
    setDatabase(null);
    if (!kind || !target || !pageId || !needsDatabase) return;
    void widgetOptions(target, kind, pageId).then((answer) => answer.ok && setDatabase((answer.value.database as Json) ?? null));
  }, [kind, pageId, needsDatabase]);

  const views = useMemo(() => [{ value: "", label: t("configAllRecords") }, ...named(database?.views)], [database]);
  const properties = useMemo(() => list(database?.properties), [database]);

  useEffect(() => {
    if (!kind) setResult("cancel");
  }, [kind, setResult]);
  if (!kind) return <View />;

  const save = async () => {
    setBusy(true);
    await saveWidgetConfig(widgetInfo.widgetName, widgetInfo.widgetId, normalizeConfig(kind, config));
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
          <Count title={t("configCount")} value={Number(config.max) || 5} min={1} max={10} onChange={(max) => set({ max })} />
        </>
      );
      break;
    case "calendar": {
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
          <Choice title={t("configRange")} items={named(o.ranges)} value={str(config.range)} onChange={(v) => set({ range: v })} />
          <Toggle title={t("configShowTasks")} value={config.tasks !== false} onChange={(tasks) => set({ tasks })} />
        </>
      );
      break;
    }
    case "pinned":
      fields = (
        <>
          <Choice title={t("configShow")} items={named(o.modes)} value={str(config.mode)} onChange={(v) => set({ mode: v, pageId: undefined, viewId: undefined, properties: [] })} />
          {config.mode === "page" ? <Choice title={t("configPage")} items={list(o.pages).map(pageItem)} value={pageId} onChange={(v) => set({ pageId: v, viewId: undefined, properties: [] })} /> : null}
          {config.mode === "page" && database ? <Choice title={t("configView")} items={views} value={str(config.viewId)} onChange={(v) => set({ viewId: v || undefined })} /> : null}
          {config.mode === "page" && database ? (
            <Many title={t("configProperties")} items={named(properties)} values={(config.properties as string[]) ?? []} max={2} onChange={(values) => set({ properties: values })} />
          ) : null}
        </>
      );
      break;
    case "counter": {
      const groupField = properties.find((f) => f.id === config.groupFieldId);
      const groupValues: Item[] =
        groupField?.type === "checkbox"
          ? [
              { value: "true", label: "☑" },
              { value: "false", label: "☐" },
            ]
          : list(groupField?.values).map((v) => ({ value: str(v.value ?? v.name ?? v), label: str(v.name ?? v.value ?? v) }));
      fields = (
        <>
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
          <Toggle title={t("configHistory")} value={config.history !== false} onChange={(history) => set({ history })} />
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
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[styles.title, { color: p.text, textAlign: "left" }]} accessibilityRole="header">
          {t("configTitle")}
        </Text>
        {!target ? (
          <Text style={[styles.text, { color: p.muted }]}>{t("widgetSignIn")}</Text>
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
