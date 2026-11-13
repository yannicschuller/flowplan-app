// Over the window while the instance's page is on its way (src/connecting.ts,
// #203): the app's own colours (light or dark), a spinner and the address –
// never an empty, white web view. It follows the motion (src/motion.ts,
// #260): the spinner turns only with "normal"; leaving, it fades out
// shortly ("normal", "reduced") or is gone at once ("off").
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text } from "react-native";
import { t } from "../i18n";
import { fadeDuration, showsSpinner } from "../motion";
import { useMotion } from "../native/motion";
import { shortServer } from "../server";
import { Logo, styles, usePalette } from "../ui";

export function Connecting({ server, visible }: { server: string; visible: boolean }) {
  const p = usePalette();
  const motion = useMotion();
  const [shown, setShown] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const motionRef = useRef(motion);
  motionRef.current = motion;
  useEffect(() => {
    if (visible) {
      opacity.stopAnimation();
      opacity.setValue(1);
      setShown(true);
      return;
    }
    const duration = fadeDuration(motionRef.current);
    if (!duration) {
      setShown(false);
      return;
    }
    const fade = Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true });
    fade.start(({ finished }) => finished && setShown(false));
    return () => fade.stop();
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
      accessibilityLabel={t("connectingTo", { server: shortServer(server) })}
    >
      <Logo size={64} />
      {showsSpinner(motion) ? <ActivityIndicator size="large" color={p.brand} style={{ marginTop: 28 }} /> : null}
      <Text style={[styles.text, styles.centered, { color: p.muted, marginTop: showsSpinner(motion) ? 16 : 28, maxWidth: 420 }]} numberOfLines={3}>
        {t("connectingTo", { server: shortServer(server) })}
      </Text>
    </Animated.View>
  );
}
