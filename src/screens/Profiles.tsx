// The saved instances as a list: tap to switch, the active one marked. In the
// app settings each one can be renamed in place.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { t } from "../i18n";
import { type Profile } from "../profiles";
import { shortServer } from "../server";
import { styles, usePalette } from "../ui";

export function ProfileList({
  profiles,
  active,
  onSwitch,
  onRename,
}: {
  profiles: Profile[];
  active: string | null;
  onSwitch: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}) {
  const p = usePalette();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const save = (id: string) => {
    onRename?.(id, name);
    setEditing(null);
  };

  return (
    <View style={[listStyles.list, { borderColor: p.line, backgroundColor: p.card }]}>
      {profiles.map((profile, index) => {
        const isActive = profile.id === active;
        const border = index ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.line } : null;
        if (editing === profile.id)
          return (
            <View key={profile.id} style={[listStyles.row, border]}>
              <TextInput
                value={name}
                onChangeText={setName}
                onSubmitEditing={() => save(profile.id)}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                accessibilityLabel={t("nameLabel")}
                style={[styles.input, listStyles.edit, { color: p.text, borderColor: p.brand }]}
              />
              <Text accessibilityRole="button" onPress={() => save(profile.id)} style={[listStyles.action, { color: p.brand }]}>
                {t("save")}
              </Text>
            </View>
          );
        return (
          <View key={profile.id} style={[listStyles.row, border]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityHint={isActive ? undefined : t("switchProfile")}
              onPress={() => onSwitch(profile.id)}
              style={({ pressed }) => [listStyles.main, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text numberOfLines={1} style={[styles.text, { color: p.text, fontWeight: "600" }]}>
                {profile.name}
              </Text>
              <Text numberOfLines={1} style={[styles.small, { color: p.muted }]}>
                {shortServer(profile.server)}
                {isActive ? ` · ${t("active")}` : ""}
              </Text>
            </Pressable>
            {isActive ? <Text style={[listStyles.check, { color: p.brand }]}>✓</Text> : null}
            {onRename ? (
              <Text
                accessibilityRole="button"
                accessibilityLabel={`${t("rename")}: ${profile.name}`}
                onPress={() => {
                  setName(profile.name);
                  setEditing(profile.id);
                }}
                style={[listStyles.action, { color: p.brand }]}
              >
                {t("rename")}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const listStyles = StyleSheet.create({
  list: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, minHeight: 56, gap: 10 },
  main: { flex: 1, minWidth: 0 },
  check: { fontSize: 18, fontWeight: "700" },
  action: { fontSize: 15, fontWeight: "600", padding: 4 },
  edit: { flex: 1, paddingVertical: 8 },
});
