// The saved instances as a list: tap to switch, the active one marked, each
// with its colour dot (profiles.ts → profileColor; widgets can take it). In
// the app settings each one can be renamed in place and get another colour.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from "react-native";
import { t } from "../i18n";
import { PROFILE_COLOR_NAMES, PROFILE_COLORS, profileColor, type Profile, type ProfileColor } from "../profiles";
import { shortServer } from "../server";
import { store } from "../store";
import { styles, usePalette } from "../ui";

const COLOR_LABELS: Record<ProfileColor, Parameters<typeof t>[0]> = {
  indigo: "colorIndigo",
  blue: "colorBlue",
  teal: "colorTeal",
  green: "colorGreen",
  amber: "colorAmber",
  orange: "colorOrange",
  red: "colorRed",
  pink: "colorPink",
  violet: "colorViolet",
  slate: "colorSlate",
};

export function ProfileList({
  profiles,
  active,
  onSwitch,
  onRename,
  onColor,
}: {
  profiles: Profile[];
  active: string | null;
  onSwitch: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onColor?: (id: string, color: ProfileColor | null) => void;
}) {
  const p = usePalette();
  const dark = useColorScheme() === "dark";
  const [editing, setEditing] = useState<string | null>(null);
  const [coloring, setColoring] = useState<string | null>(null);
  const [name, setName] = useState("");
  const state = { profiles, active };
  const colorOf = (id: string) => profileColor(state, id, store.instanceAccent(id));
  const tone = (color: ProfileColor) => PROFILE_COLORS[color][dark ? "dark" : "light"];

  const save = (id: string) => {
    onRename?.(id, name);
    setEditing(null);
  };

  return (
    <View style={[listStyles.list, { borderColor: p.line, backgroundColor: p.card }]}>
      {profiles.map((profile, index) => {
        const isActive = profile.id === active;
        const color = colorOf(profile.id);
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
          <View key={profile.id} style={border}>
            <View style={listStyles.row}>
              {onColor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("profileColor")}: ${t(COLOR_LABELS[color])}`}
                  accessibilityState={{ expanded: coloring === profile.id }}
                  hitSlop={10}
                  onPress={() => setColoring(coloring === profile.id ? null : profile.id)}
                  style={listStyles.dotTarget}
                >
                  <View style={[listStyles.dot, { backgroundColor: tone(color) }]} />
                </Pressable>
              ) : (
                <View style={listStyles.dotTarget} accessibilityElementsHidden importantForAccessibility="no">
                  <View style={[listStyles.dot, { backgroundColor: tone(color) }]} />
                </View>
              )}
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
            {onColor && coloring === profile.id ? (
              <View style={listStyles.palette} accessibilityRole="radiogroup" accessibilityLabel={t("profileColor")}>
                {PROFILE_COLOR_NAMES.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={t(COLOR_LABELS[option])}
                    accessibilityState={{ checked: option === color }}
                    onPress={() => {
                      onColor(profile.id, option);
                      setColoring(null);
                    }}
                    style={[listStyles.swatch, { borderColor: option === color ? p.text : "transparent" }]}
                  >
                    <View style={[listStyles.swatchDot, { backgroundColor: tone(option) }]} />
                  </Pressable>
                ))}
              </View>
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
  dotTarget: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  dot: { width: 14, height: 14, borderRadius: 7 },
  palette: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swatchDot: { width: 28, height: 28, borderRadius: 14 },
});
