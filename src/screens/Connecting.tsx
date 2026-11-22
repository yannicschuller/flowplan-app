// Over the window while the instance's page is on its way (src/connecting.ts,
// #203): the app's own colours (light or dark), a spinner and the address –
// never an empty, white web view. It follows the motion (src/motion.ts,
// #260): the spinner turns only with "normal"; leaving, it fades out
// shortly ("normal", "reduced") or is gone at once ("off"). Switching to
// another profile (#428, src/motion.ts switchTransition) it names the
// target profile and fades in over the page that is leaving (`fadeIn`).
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { fadeDuration, showsSpinner } from "../motion";
import { useMotion } from "../native/motion";
import { shortServer } from "../server";
import { Logo, styles, usePalette } from "../ui";

export function Connecting({ server, visible, switchingTo = null, fadeIn = 0 }: { server: string; visible: boolean; switchingTo?: string | null; fadeIn?: number }) {
  const p = usePalette();
  const motion = useMotion();
  const [shown, setShown] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const motionRef = useRef(motion);
  motionRef.current = motion;
  useEffect(() => {
    if (visible) {
      opacity.stopAnimation();
      setShown(true);
      if (!fadeIn) {
        opacity.setValue(1);
        return;
      }
      // From what is shown now (0 when it was gone) to covering the window.
      const appear = Animated.timing(opacity, { toValue: 1, duration: fadeIn, useNativeDriver: true });
      appear.start();
      return () => appear.stop();
    }
    const duration = fadeDuration(motionRef.current);
    if (!duration) {
      setShown(false);
      return;
    }
    const fade = Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true });
    fade.start(({ finished }) => finished && setShown(false));
    return () => fade.stop();
    // fadeIn counts only when the cover comes, not while it stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, { opacity, backgroundColor: p.background, alignItems: "center", justifyContent: "center", padding: 24 }]}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      accessibilityLabel={switchingTo ? t("switchingTo", { name: switchingTo }) : t("connectingTo", { server: shortServer(server) })}
    >
      <Logo size={64} />
      {switchingTo ? (
        <Text style={[styles.title, { color: p.text, marginBottom: 0, maxWidth: 420 }]} numberOfLines={2}>
          {switchingTo}
        </Text>
      ) : null}
      {showsSpinner(motion) ? <ActivityIndicator size="large" color={p.brand} style={{ marginTop: 28 }} /> : null}
      <Text style={[styles.text, styles.centered, { color: p.muted, marginTop: showsSpinner(motion) ? 16 : 28, maxWidth: 420 }]} numberOfLines={3}>
        {t("connectingTo", { server: shortServer(server) })}
      </Text>
    </Animated.View>
  );
}
