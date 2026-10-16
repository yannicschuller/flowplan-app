// The app: first the instance (setup), then the window on it (shell) – with
// what makes it native around it: push notifications, widgets and the timer
// (sync.ts), quick actions, shared text, the app lock and its own settings.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { getLocales } from "expo-localization";
import * as Application from "expo-application";
import { addPencilListener, addShareListener, consumeSharedText, getManagedServer, type SharedText } from "../modules/flowplan-native/src";
import type { PageMessage } from "./bridge-script";
import { pickLocale, setLocale } from "./i18n";
import { pathOfAppLink } from "./navigation";
import { store } from "./store";
import { BACKGROUND } from "./ui";
import { Lock } from "./screens/Lock";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { Shell, type ShellHandle } from "./screens/Shell";
import { haptic, onQuickAction, saveFile, setQuickActions } from "./native/actions";
import { scheduleBackgroundRefresh } from "./native/background";
import { askForPush, expoPushToken, onNotificationOpened, onNotificationReceived, pushPermission, setUpNotifications } from "./native/notifications";
import { apply, leaveInstance, refresh, updateWidgets } from "./native/sync";

setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
void SplashScreen.preventAutoHideAsync().catch(() => {});

// How long the app may be in the background before the app lock asks again.
const LOCK_AFTER_MS = 60_000;

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [server, setServer] = useState(store.server());
  const [setup, setSetup] = useState(!store.server());
  const [settings, setSettings] = useState(false);
  const [locked, setLocked] = useState(store.appLock());
  const [signedIn, setSignedIn] = useState(!!store.deviceToken());
  const [pushAvailable, setPushAvailable] = useState(true);
  const shell = useRef<ShellHandle>(null);
  // Paths and shares that arrive before the instance's page is there.
  const pendingPath = useRef<string | null>(null);
  const registered = useRef<string | null>(null);
  const backgroundSince = useRef(0);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(BACKGROUND.light).catch(() => {});
    setUpNotifications();
    void SplashScreen.hideAsync().catch(() => {});
    void updateWidgets();
  }, []);

  const open = useCallback(
    (path: string) => {
      if (!server) return;
      if (shell.current) shell.current.navigate(path);
      else pendingPath.current = path;
    },
    [server],
  );

  // "Teilen" from other apps (Android): the instance's share target.
  const share = useCallback(
    (shared: SharedText) => {
      const query = new URLSearchParams();
      const text = shared.text.trim();
      if (shared.subject) query.set("title", shared.subject);
      if (/^https?:\/\/\S+$/.test(text)) query.set("url", text);
      else if (text) query.set("text", text);
      open(`/share-target?${query}`);
    },
    [open],
  );

  const appLink = useCallback(
    (link: string) => {
      if (link.startsWith("flowplan://sign-in")) return shell.current?.signInLink(link);
      if (link.startsWith("flowplan://change-server")) return setSetup(true);
      const path = pathOfAppLink(link);
      if (path) open(path);
    },
    [open],
  );

  // Links into the app (widgets, Live Activity, notifications, quick actions).
  useEffect(() => {
    void Linking.getInitialURL().then((url) => url && appLink(url));
    const links = Linking.addEventListener("url", ({ url }) => appLink(url));
    const opened = onNotificationOpened(open);
    const received = onNotificationReceived(() => void refresh());
    const actions = onQuickAction(({ id, path }) => (id === "server" ? setSetup(true) : path && open(path)));
    const initialShare = consumeSharedText();
    if (initialShare) share(initialShare);
    const shares = addShareListener(share);
    // iPad: Apple Pencil double-tap and squeeze go to the page.
    const pencil = addPencilListener((action) => shell.current?.pencil(action));
    return () => {
      pencil.remove();
      links.remove();
      opened.remove();
      received.remove();
      actions.remove();
      shares.remove();
    };
  }, [appLink, open, share]);

  useEffect(() => setQuickActions(signedIn), [signedIn]);
  useEffect(() => void scheduleBackgroundRefresh(signedIn), [signedIn]);

  // Back in the foreground: fresh widgets and badge; the app lock asks again
  // after a minute away.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundSince.current = Date.now();
      if (state === "active") {
        if (store.appLock() && backgroundSince.current && Date.now() - backgroundSince.current > LOCK_AFTER_MS) setLocked(true);
        backgroundSince.current = 0;
        if (store.deviceToken()) void refresh().then((result) => "signedOut" in result && setSignedIn(false));
      }
    });
    return () => subscription.remove();
  }, []);

  // Signed out in the page (or the session ended): the next registration
  // finds out, widgets and badge are cleared.
  const signedOut = useCallback(() => {
    registered.current = null;
    store.setDeviceToken(null);
    setSignedIn(false);
    void apply(null);
  }, []);

  // Registers this installation for the page's session: device token for the
  // widgets, Expo push token for notifications. Again when the push token or
  // the session changes.
  const register = useCallback(async () => {
    const pushToken = await expoPushToken();
    const key = `${server}|${pushToken}`;
    if (registered.current === key) return;
    shell.current?.register({
      installationId: store.installationId(),
      platform: Platform.OS === "ios" ? "ios" : "android",
      name: Platform.OS === "ios" ? (Platform.isPad ? "iPad" : "iPhone") : "Android",
      appVersion: `${Application.nativeApplicationVersion ?? ""} (${Application.nativeBuildVersion ?? ""})`,
      pushToken,
    });
  }, [server]);

  const onMessage = useCallback(
    async (message: PageMessage) => {
      switch (message.type) {
        case "registered": {
          const body = message.body as { deviceToken?: string; push?: boolean; pushAvailable?: boolean } | null;
          if (message.status === 200 && body?.deviceToken) {
            store.setDeviceToken(body.deviceToken);
            setSignedIn(true);
            setPushAvailable(body.pushAvailable !== false);
            registered.current = `${server}|${(await expoPushToken()) ?? null}`;
            void refresh();
            // Asked once, right after the first sign-in.
            if (body.pushAvailable !== false && !store.pushAsked() && (await pushPermission()) === "undetermined") {
              store.setPushAsked();
              if ((await askForPush()) === "granted") {
                registered.current = null;
                void register();
              }
            }
          } else if (message.status === 401) {
            // Signed out: nothing of the account stays in widgets and badge.
            signedOut();
          }
          return;
        }
        case "refresh":
          void refresh();
          return;
        case "saveFile":
          void saveFile(message.name, message.base64, message.mime);
          return;
        case "haptic":
          haptic(message.kind);
          return;
        case "openSettings":
          setSettings(true);
          return;
      }
    },
    [server, register, signedOut],
  );

  const onPageLoaded = useCallback(() => {
    if (pendingPath.current) {
      const path = pendingPath.current;
      pendingPath.current = null;
      shell.current?.navigate(path);
    }
    // A full page load after signing out (the web app reloads): is the
    // device token still valid?
    if (registered.current && store.deviceToken())
      void refresh().then((result) => {
        if ("signedOut" in result) {
          signedOut();
          void register();
        }
      });
    else void register();
  }, [register, signedOut]);

  // Leaves the current instance: its entry for this phone goes, nothing of it
  // stays in widgets and badge.
  const leave = async (from: string) => {
    await leaveInstance(from, store.deviceToken());
    store.forgetInstance();
    signedOut();
  };

  const connect = (origin: string) => {
    if (server && origin !== server) void leave(server);
    store.setServer(origin);
    setServer(origin);
    setSetup(false);
  };

  const forget = async () => {
    if (!server) return;
    setSettings(false);
    await leave(server);
    await shell.current?.signOut();
    store.setServer(null);
    setServer(null);
    setSetup(true);
  };

  return (
    <>
      {setup || !server ? (
        <Setup current={server} suggested={server ? null : getManagedServer()} onConnect={connect} onCancel={server ? () => setSetup(false) : undefined} />
      ) : (
        <Shell
          ref={shell}
          server={server}
          onMessage={(message) => void onMessage(message)}
          onAppLink={appLink}
          onChangeServer={() => setSetup(true)}
          onPageLoaded={onPageLoaded}
        />
      )}
      {server ? (
        <Settings
          visible={settings}
          server={server}
          signedIn={signedIn}
          pushAvailable={pushAvailable}
          onClose={() => setSettings(false)}
          onChangeServer={() => {
            setSettings(false);
            setSetup(true);
          }}
          onForget={() => void forget()}
          onPushChanged={() => {
            registered.current = null;
            void register();
          }}
        />
      ) : null}
      {locked ? <Lock onUnlocked={() => setLocked(false)} /> : null}
    </>
  );
}
