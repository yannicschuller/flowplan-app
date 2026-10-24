// Android: what was shared from another app ("Save to Flowplan": text,
// links, photos, PDFs), and "Quick capture" (Quick Settings tile, app
// shortcut). One compact screen: where it goes – the inbox (the person's
// default capture database) or a page or database they pick –, title, text,
// link and files, saved in one go with the instance's capture.share action
// (android/share.ts). After a share, "Done" goes back to the app that shared.
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { clearShare, leaveApp, type SharedContent, type SharedFile } from "../../modules/flowplan-android/src";
import { t } from "../i18n";
import { localDay } from "../summary";
import { widgetData, widgetOptions } from "../widgets/api";
import { connection, refreshSuite, timeZone } from "../native/suite";
import { fileSize, hasContent, MAX_SHARE_FILES, saveShare, shareDraft, shareTargetPath, type ShareDraft } from "../android/share";
import { Button, SheetBody, styles, usePalette } from "../ui";

export type ShareRequest = { kind: "share"; content: SharedContent } | { kind: "quick" };
type Target = { id: string; name: string; detail: string; kind: string };

const EMPTY: ShareDraft = { title: "", text: "", url: "", files: [], skipped: [] };
const str = (value: unknown) => (typeof value === "string" ? value : "");

export function ShareCapture({
  request,
  onClose,
  onOpen,
}: {
  request: ShareRequest | null;
  onClose: () => void;
  // A path of the instance in the app's window (the saved page, or the web
  // share target of instances from before capture.share).
  onOpen: (path: string) => void;
}) {
  const p = usePalette();
  const [draft, setDraft] = useState<ShareDraft>(EMPTY);
  const [inbox, setInbox] = useState<Target | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [takesShare, setTakesShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  // A new share or quick capture: its content, the inbox and the other targets.
  useEffect(() => {
    if (!request) return;
    setDraft(request.kind === "share" ? shareDraft(request.content) : EMPTY);
    setInbox(null);
    setTargets([]);
    setTarget(null);
    setPicking(false);
    setQuery("");
    setTakesShare(true);
    setMessage("");
    setSaved(null);
    const server = connection();
    if (!server) return setMessage(t("widgetSignIn"));
    let current = true;
    void Promise.all([
      widgetData(server, [{ id: "capture", kind: "capture", config: {} }], { today: localDay(), zone: timeZone() }),
      widgetOptions(server, "capture"),
    ]).then(([data, options]) => {
      if (!current) return;
      if (!data.ok && !options.ok) return setMessage(t("widgetOffline"));
      const answer = data.ok ? data.value.get("capture") : null;
      const found = answer?.ok ? (answer.data.target as Record<string, unknown> | null) : null;
      const inboxTarget = found?.id ? { id: str(found.id), name: str(found.name), detail: str(found.space), kind: str(found.kind) } : null;
      const list = options.ok && Array.isArray(options.value.targets) ? (options.value.targets as Record<string, unknown>[]) : [];
      setInbox(inboxTarget);
      setTarget(inboxTarget);
      setTargets(
        list
          .filter((page) => !page.encrypted && str(page.id))
          .map((page) => ({ id: str(page.id), name: str(page.name), detail: [str(page.space), str(page.workspace)].filter(Boolean).join(" · "), kind: str(page.kind) })),
      );
      setTakesShare(!options.ok || options.value.share === true);
      if (!inboxTarget) setMessage(list.length ? t("shareChooseTarget") : t("captureNoTarget"));
      if (!inboxTarget && list.length) setPicking(true);
    });
    return () => {
      current = false;
    };
  }, [request]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter((item) => !q || `${item.name} ${item.detail}`.toLowerCase().includes(q)).slice(0, 50);
  }, [targets, query]);

  const set = (change: Partial<ShareDraft>) => setDraft((value) => ({ ...value, ...change }));
  const fromShare = request?.kind === "share";

  const close = () => {
    if (fromShare) clearShare();
    onClose();
    // Saved from another app's share sheet: back there.
    if (fromShare && saved !== null) leaveApp();
  };

  const save = async () => {
    const server = connection();
    if (!server || !target || !hasContent(draft)) return;
    // Instances from before capture.share: text and links through their
    // web share target, files not at all.
    if (!takesShare) {
      if (draft.files.length) return setMessage(t("shareTooOld"));
      onClose();
      onOpen(shareTargetPath(draft));
      return;
    }
    setBusy(true);
    setMessage(draft.files.length ? t("uploading") : "");
    const result = await saveShare(server, target.id, draft);
    setBusy(false);
    if (result.ok) {
      setSaved(result.value.url ?? "");
      setMessage(t("captureSaved", { target: target.name }));
      if (fromShare) clearShare();
      void refreshSuite({ force: true });
    } else setMessage(t("captureFailed", { error: "error" in result ? result.error : t("widgetSignIn") }));
  };

  // Quick capture: a photo from the camera or the library.
  const addPhoto = async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true, selectionLimit: MAX_SHARE_FILES });
    if (result.canceled) return;
    const added: SharedFile[] = result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName || `photo-${Date.now()}-${index + 1}.jpg`,
      type: asset.mimeType || "image/jpeg",
      size: asset.fileSize ?? 0,
    }));
    setDraft((value) => ({ ...value, files: [...value.files, ...added].slice(0, MAX_SHARE_FILES) }));
  };

  const input = [styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card }];
  const done = saved !== null;
  return (
    <Modal visible={!!request} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SheetBody style={{ backgroundColor: p.background }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, { color: p.text, textAlign: "left", flex: 1, marginTop: 4 }]} accessibilityRole="header">
              {fromShare ? t("shareTitle") : t("quickCaptureTitle")}
            </Text>
            <Button title={done ? t("done") : t("cancel")} kind="secondary" onPress={close} />
          </View>

          {/* Where it goes */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("configTarget")}: ${target?.name ?? "–"}. ${t("shareChange")}`}
            disabled={done || !targets.length}
            onPress={() => setPicking((value) => !value)}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: p.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.small, { color: p.muted }]}>{t("configTarget")}</Text>
              <Text style={[styles.text, { color: p.text, fontWeight: "600" }]} numberOfLines={1}>
                {target ? (target.id === inbox?.id ? `${t("shareInbox")} · ${target.name}` : target.name) : "–"}
              </Text>
            </View>
            {targets.length && !done ? <Text style={{ color: p.brand, fontWeight: "600" }}>{picking ? "▲" : t("shareChange")}</Text> : null}
          </Pressable>
          {picking && !done ? (
            <View style={{ marginTop: 8 }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("shareSearch")}
                placeholderTextColor={p.muted}
                style={input}
                accessibilityLabel={t("shareSearch")}
                autoCorrect={false}
              />
              <View style={{ backgroundColor: p.card, borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
                {(inbox && !query.trim() ? [{ ...inbox, name: `${t("shareInbox")} · ${inbox.name}` }, ...shown.filter((item) => item.id !== inbox.id)] : shown).map((item, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: item.id === target?.id }}
                    onPress={() => {
                      setTarget(targets.find((x) => x.id === item.id) ?? inbox);
                      setPicking(false);
                      setQuery("");
                      setMessage("");
                    }}
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderColor: p.line }}
                  >
                    <Text style={{ width: 26, color: p.muted }}>{item.kind === "database" ? "▦" : "▤"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.text, { color: p.text }]} numberOfLines={1}>
                        {item.name || t("configDefault")}
                      </Text>
                      {item.detail ? (
                        <Text style={[styles.small, { color: p.muted }]} numberOfLines={1}>
                          {item.detail}
                        </Text>
                      ) : null}
                    </View>
                    {item.id === target?.id ? <Text style={{ color: p.brand, fontSize: 18 }}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* What it is */}
          {!done ? (
            <>
              <TextInput
                value={draft.title}
                onChangeText={(title) => set({ title })}
                placeholder={t("captureTitleField")}
                placeholderTextColor={p.muted}
                autoFocus={!fromShare}
                style={[...input, { marginTop: 16 }]}
                accessibilityLabel={t("captureTitleField")}
                returnKeyType="next"
              />
              <TextInput
                value={draft.text}
                onChangeText={(text) => set({ text })}
                placeholder={t("captureTextField")}
                placeholderTextColor={p.muted}
                multiline
                style={[...input, { marginTop: 10, minHeight: 96, textAlignVertical: "top" }]}
                accessibilityLabel={t("captureTextField")}
              />
              {draft.url || fromShare ? (
                <TextInput
                  value={draft.url}
                  onChangeText={(url) => set({ url })}
                  placeholder={t("shareLinkField")}
                  placeholderTextColor={p.muted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[...input, { marginTop: 10 }]}
                  accessibilityLabel={t("shareLinkField")}
                />
              ) : null}
              {draft.files.length ? (
                <View style={{ backgroundColor: p.card, borderRadius: 12, overflow: "hidden", marginTop: 12 }}>
                  {draft.files.map((file, index) => (
                    <View key={`${file.uri}-${index}`} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 14, borderTopWidth: index ? 1 : 0, borderColor: p.line }}>
                      <Text style={{ width: 26, color: p.muted }}>{file.type === "application/pdf" ? "📄" : "🖼"}</Text>
                      <Text style={[styles.text, { color: p.text, flex: 1 }]} numberOfLines={1}>
                        {file.name}
                      </Text>
                      {file.size ? <Text style={[styles.small, { color: p.muted, marginLeft: 8 }]}>{fileSize(file.size)}</Text> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("shareRemoveFile", { name: file.name })}
                        onPress={() => set({ files: draft.files.filter((_, i) => i !== index) })}
                        style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                        hitSlop={6}
                      >
                        <Text style={{ color: p.muted, fontSize: 16 }}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              {draft.skipped.length ? (
                <Text style={[styles.small, { color: p.muted, marginTop: 8 }]}>{t("shareSkipped", { names: draft.skipped.join(", ") })}</Text>
              ) : null}
              {!fromShare && draft.files.length < MAX_SHARE_FILES ? (
                <View style={[styles.row, { marginTop: 12 }]}>
                  <Button title={t("takePhoto")} kind="secondary" disabled={busy} onPress={() => void addPhoto(true)} style={{ flex: 1 }} />
                  <Button title={t("choosePhoto")} kind="secondary" disabled={busy} onPress={() => void addPhoto(false)} style={{ flex: 1 }} />
                </View>
              ) : null}
              <Button title={t("save")} busy={busy} disabled={!target || !hasContent(draft)} onPress={() => void save()} style={{ marginTop: 18 }} />
            </>
          ) : null}

          {message ? (
            <Text style={[styles.text, { color: p.muted, marginTop: 18 }]} accessibilityLiveRegion="polite">
              {message}
            </Text>
          ) : null}
          {done ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              {saved ? (
                <Button
                  title={t("openPage")}
                  onPress={() => {
                    clearShare();
                    onClose();
                    onOpen(saved);
                  }}
                />
              ) : null}
              {fromShare ? <Button title={t("shareBack")} kind="secondary" onPress={close} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </SheetBody>
    </Modal>
  );
}
