// A further window on the iPad (Split View, Slide Over, Stage Manager, "Open
// in new window"): a page of the active profile's instance, without what
// belongs to the main window (windows.ts) – setup, app settings, push,
// widgets, the timer. It follows the profile and the app lock of the main
// window; files, haptic taps and changes for the widgets work as there.
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Linking, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import type { PageMessage } from "../bridge-script";
import { pathOn } from "../ipad";
import { haptic, saveFile } from "../native/actions";
import { refresh } from "../native/sync";
import { activeProfile, type ProfileState } from "../profiles";
import { store } from "../store";
import { usePalette } from "../ui";
import { useSharedState } from "../windows";
import { Cover, Lock } from "./Lock";
import { Shell, type ShellHandle } from "./Shell";

export function PageWindow({ url }: { url: string | null }) {
  const palette = usePalette();
  const [profiles] = useSharedState<ProfileState>("profiles", () => store.profiles());
  const [locked, setLocked] = useSharedState("locked", () => store.appLock());
  const profile = activeProfile(profiles);
  const server = profile?.server ?? null;
  const shell = useRef<ShellHandle>(null);
  // The page this window opens with, once the instance has loaded.
  const pendingPath = useRef(pathOn(url, server));
  const [appState, setAppState] = useState<AppStateStatus>((AppState.currentState as AppStateStatus | null) || "active");
  useEffect(() => {
    // expo-splash-screen covers every new window until it is told.
    void SplashScreen.hideAsync().catch(() => {});
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  const covered = store.appLock() && appState !== "active";

  const onMessage = (message: PageMessage) => {
    if (message.type === "saveFile") void saveFile(message.name, message.base64, message.mime);
    else if (message.type === "haptic") haptic(message.kind);
    else if (message.type === "refresh" && store.deviceToken()) void refresh();
    // The profiles are the main window's (like flowplan:// links).
    else if (message.type === "openProfiles") void Linking.openURL("flowplan://change-server").catch(() => {});
  };

  if (!server || !profile) return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  return (
    <>
      <Shell
        ref={shell}
        server={server}
        profile={profile.id}
        onMessage={onMessage}
        // flowplan:// links of the page go through the system to the main window.
        onAppLink={(link) => void Linking.openURL(link).catch(() => {})}
        onProfiles={() => {}}
        onPageLoaded={() => {
          const path = pendingPath.current;
          pendingPath.current = null;
          if (path) shell.current?.navigate(path);
        }}
        active={!locked && !covered}
      />
      {locked ? <Lock onUnlocked={() => setLocked(false)} /> : null}
      {covered ? <Cover /> : null}
    </>
  );
}
