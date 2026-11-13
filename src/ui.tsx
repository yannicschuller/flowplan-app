// The look of the app's own screens (setup, offline, settings, lock): the
// colours and type of the Flowplan web app.
import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useColorScheme, View, type ViewStyle } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { showsSpinner } from "./motion";
import { useMotion } from "./native/motion";

export const BACKGROUND = { light: "#fcfbf8", dark: "#16151b" };
const palettes = {
  light: { background: BACKGROUND.light, card: "#ffffff", text: "#1d1c22", muted: "#6f6b77", line: "#e4e0d6", brand: "#3b3fd8", onBrand: "#ffffff", error: "#d32f2f", field: "transparent" },
  dark: { background: BACKGROUND.dark, card: "#1f1e25", text: "#ecebf1", muted: "#9a96a4", line: "#2e2c35", brand: "#959bff", onBrand: "#16151b", error: "#ff6b6b", field: "transparent" },
};
export type Palette = (typeof palettes)["light"];

export function usePalette(): Palette {
  return palettes[useColorScheme() === "dark" ? "dark" : "light"];
}

export function Logo({ size = 76 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/splash-logo.png")}
      style={{ width: size, height: size, alignSelf: "center" }}
      accessibilityIgnoresInvertColors
    />
  );
}

export function Button({
  title,
  onPress,
  kind = "primary",
  busy = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const p = usePalette();
  // A busy button turns its spinner only with "normal" motion (motion.ts);
  // otherwise it stays disabled and says busy to assistive technologies.
  const motion = useMotion();
  const spinner = busy && showsSpinner(motion);
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: p.brand } : { backgroundColor: "transparent", borderColor: p.line, borderWidth: StyleSheet.hairlineWidth * 2 },
        { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {spinner ? <ActivityIndicator color={primary ? p.onBrand : p.text} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.buttonText, { color: primary ? p.onBrand : kind === "danger" ? p.error : p.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[styles.screen, { backgroundColor: p.background }, style]}>{children}</View>;
}

// The content of a page sheet (settings, capture, scan, voice note), clear
// of the system's areas on every side: a sheet measures its own (its own
// provider) – it is not the window. On an iPad and an open iPhone Duo it
// floats in the middle without them; in landscape and on the closed iPhone
// Duo its sides have them (the camera, the status bar along the side).
export function SheetBody({ children, style, edges = ["bottom", "left", "right"] }: { children: React.ReactNode; style?: ViewStyle; edges?: Edge[] }) {
  return (
    <SafeAreaProvider>
      <SheetInsets style={style} edges={edges}>
        {children}
      </SheetInsets>
    </SafeAreaProvider>
  );
}

function SheetInsets({ children, style, edges }: { children: React.ReactNode; style?: ViewStyle; edges: Edge[] }) {
  const insets = useSafeAreaInsets();
  const side = (edge: Edge) => (edges.includes(edge) ? insets[edge] : 0);
  return <View style={[{ flex: 1, paddingBottom: side("bottom"), paddingLeft: side("left"), paddingRight: side("right") }, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 468, width: "100%", alignSelf: "center" },
  centered: { alignSelf: "center", textAlign: "center" },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "700", letterSpacing: -0.25, marginTop: 18, marginBottom: 12, textAlign: "center" },
  text: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 22, marginBottom: 10 },
  input: { fontSize: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
  row: { flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
