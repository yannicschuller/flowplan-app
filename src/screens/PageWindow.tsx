// A further window on the iPad (Split View, Slide Over, Stage Manager, "Open
// in new window"): a page of the active profile's instance, without what
// belongs to the main window (windows.ts) – setup, app settings, push,
// widgets, the timer. It follows the profile and the app lock of the main
// window; files, haptic taps and changes for the widgets work as there. Its
// profile switcher opens here, in the window that asked (#354); the switch
// itself happens in the main window (windows.ts mainRequests).
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Linking, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import type { PageMessage } from "../bridge-script";
import { pathOn } from "../ipad";
import { haptic, saveFile } from "../native/actions";
import { refresh } from "../native/sync";
import { mayOpenSwitcher, SWITCHER_LINK } from "../profile-picker";
import { activeProfile, type ProfileState } from "../profiles";
import { store } from "../store";
import { usePalette } from "../ui";
import { mainRequests, useSharedState, type MainRequest } from "../windows";
import { Cover, Lock } from "./Lock";
import { ProfileSwitcher } from "./ProfileSwitcher";
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
  // The profile switcher of this window (profile-picker.ts): the page's
  // "Instanz wechseln …", its link to the switcher and ⇧⌘P in this window.
  const [switcher, setSwitcher] = useState(false);
  const switcherClosedAt = useRef(0);
  const openSwitcher = (from: "page" | "keyboard") => {
    const front = !locked && !covered;
    if (!mayOpenSwitcher({ open: switcher, front, closedAt: switcherClosedAt.current, now: Date.now(), fromPage: from === "page" })) return;
    if (!front) return;
    setSwitcher(true);
  };
  const closeSwitcher = (request?: MainRequest) => {
    switcherClosedAt.current = Date.now();
    setSwitcher(false);
    if (request) mainRequests.send(request);
  };

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
        // flowplan:// links of the page go through the system to the main
        // window; its link to the switcher opens this window's.
        onAppLink={(link) => (link === SWITCHER_LINK ? openSwitcher("page") : void Linking.openURL(link).catch(() => {}))}
        // The profiles are the main window's (the offline screen's "Switch profile").
        onProfiles={() => void Linking.openURL("flowplan://change-server").catch(() => {})}
        // The profile switcher opens here (the page's openProfileSwitcher, ⇧⌘P).
        onProfileSwitcher={(from) => openSwitcher(from)}
        onPageLoaded={() => {
          const path = pendingPath.current;
          pendingPath.current = null;
          if (path) shell.current?.navigate(path);
        }}
        active={!locked && !covered && !switcher}
      />
      <ProfileSwitcher
        visible={switcher && !locked}
        profiles={profiles}
        onSwitch={(id) => closeSwitcher(id === profiles.active ? undefined : { type: "switchProfile", id })}
        onAdd={() => closeSwitcher({ type: "addProfile" })}
        onManage={() => closeSwitcher({ type: "manageProfiles" })}
        onClose={() => closeSwitcher()}
        onDismiss={() => {}}
      />
      {locked ? <Lock onUnlocked={() => setLocked(false)} /> : null}
      {covered ? <Cover /> : null}
    </>
  );
}
