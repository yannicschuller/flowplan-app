// Material You for the Android home screen widgets: on Android 12 and newer
// the widgets take the system's colours (from the wallpaper or the chosen
// theme) instead of Flowplan's, in light and dark. react-native-android-widget
// draws from colour values, so the module hands the palette over as hex
// (modules/flowplan-android: MaterialColors.kt) and each render picks it up –
// a new wallpaper shows with the next update. Red, amber and green keep
// their meaning and stay Flowplan's. Pure – tested in test/android.test.ts.
import type { Theme } from "../widgets/android";

export type Themes = { light: Theme; dark: Theme };
const HEX = /^#[0-9a-f]{6}$/i;

// Material 3's roles for widgets: a tinted surface, text and secondary text on
// it, the primary colour for titles and actions, a container tone for lines,
// buttons and bars.
const ROLES: Record<"light" | "dark", Partial<Record<keyof Theme, string>>> = {
  light: { background: "accent2_50", text: "neutral1_900", muted: "neutral2_700", brand: "accent1_600", line: "accent2_100" },
  dark: { background: "neutral1_900", text: "neutral1_50", muted: "neutral2_200", brand: "accent1_200", line: "accent2_800" },
};

export function materialThemes(palette: Record<string, string> | null | undefined, fallback: Themes): Themes {
  if (!palette) return fallback;
  const pick = (mode: "light" | "dark"): Theme | null => {
    const theme = { ...fallback[mode] };
    for (const [role, tone] of Object.entries(ROLES[mode]) as [keyof Theme, string][]) {
      const color = palette[tone];
      if (!color || !HEX.test(color)) return null;
      theme[role] = color.toLowerCase();
    }
    return theme;
  };
  const light = pick("light"),
    dark = pick("dark");
  return light && dark ? { light, dark } : fallback;
}
