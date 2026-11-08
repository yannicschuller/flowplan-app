// The app: first the instance (setup), then the window on it (shell) – with
// what makes it native around it: push notifications, widgets and the timer
// (sync.ts), quick actions, shared text, the app lock and its own settings.
// Several instances are kept as profiles (profiles.ts); push, widgets, badge
// and timer belong to the active one.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Linking, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { getLocales } from "expo-localization";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as ScreenCapture from "expo-screen-capture";
import { addAppLinkListener, addPencilListener, consumePendingLink, getManagedServer } from "../modules/flowplan-native/src";
import { addShareListener, takeShare, type SharedContent } from "../modules/flowplan-android/src";
import { addOpenedLinkListener, consumeOpenedLink } from "../modules/flowplan-capture/src";
import type { PageMessage } from "./bridge-script";
import { deviceName } from "./device";
import { pickLocale, setLocale } from "./i18n";
import { captureRequest, doLink, meetingLink, pathOfAppLink, type CaptureRequest } from "./navigation";
import { pageScanRequest, scanRequest, type ScanRequest } from "./capture";
import { activeProfile, addProfile, removeProfile, renameProfile, replaceProfile, switchProfile, type ProfileState } from "./profiles";
import { profilesRequest, unsignedProfile } from "./profile-picker";
import { checkAndroidUpdate } from "./android-update";
import { store } from "./store";
import { BACKGROUND } from "./ui";
import { Cover, Lock } from "./screens/Lock";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { Shell, type ShellHandle } from "./screens/Shell";
import { Capture } from "./screens/Capture";
import { ShareCapture, type ShareRequest } from "./screens/ShareCapture";
import { shareDraft, shareTargetPath } from "./android/share";
import { shortcutLinkOpened, syncShortcuts } from "./android/shortcuts";
import { Scan } from "./screens/Scan";
import { VoiceNote } from "./screens/VoiceNote";
import { PageWindow } from "./screens/PageWindow";
import { haptic, onQuickAction, saveFile, setQuickActions, startAction, type QuickAction } from "./native/actions";
import { scheduleBackgroundRefresh } from "./native/background";
import { askForPush, onNotificationOpened, onNotificationReceived, pushPermission, setUpNotifications } from "./native/notifications";
import { cleanUpPushKeys, leavePush, onDeviceTokenChanged, pushFields, RELAY, relayRefusedBy } from "./native/push";
import { relayMismatch } from "./push-relay";
import { onLiveTokensChanged } from "./native/live-push";
import { apply, leaveInstance, refresh, updateWidgets } from "./native/sync";
import { clearSuiteAnswers, connection, forgetSuiteProfile, refreshSuite, syncWidgetSession } from "./native/suite";
import { wipeOfflineCopy, wipeOrphanCopies } from "./offline/native";
import { endAllActivities, listenToActivityButtons, nextPoll, refreshActivities, runAppAction } from "./native/activities";
import { widgetAction } from "./widgets/api";
import { addFocusFilterListener } from "../modules/flowplan-intents/src";
import { sendFocusRule, syncIntentProfiles, takeFocusStep } from "./native/intents";
import { onNotificationButton, setUpNotificationButtons, syncButtonSession } from "./native/notification-actions";
import { tn } from "./i18n-notify";
import { forgetApprovalKey, onApprovalKeyChanged, prepareApprovalKey } from "./native/approvals";
import { setLocalRemindersWanted } from "./native/local-reminders";
import { originOf } from "./server";
import { voiceRequest, type VoiceRequest } from "./voice-bridge";
import { pathOn } from "./ipad";
import { useHandoff } from "./window-features";
import { useAppWindow, useSharedState, WindowContext, type WindowProps } from "./windows";

setLocale(pickLocale(getLocales().map((l) => l.languageTag)));
void SplashScreen.preventAutoHideAsync().catch(() => {});

// How long the app may be in the background before the app lock asks again.
const LOCK_AFTER_MS = 60_000;

// iPad: every window is its own App; the first is the main window
// (windows.ts), the others show a page (screens/PageWindow.tsx).
export default function App(props: WindowProps) {
  const appWindow = useAppWindow(props.flowplanWindow);
  return (
    <SafeAreaProvider>
      <WindowContext.Provider value={appWindow}>
        {appWindow.main ? (
          <Root initialUrl={appWindow.url} shortcut={props.flowplanWindow?.shortcut} />
        ) : (
          <PageWindow url={appWindow.url} />
        )}
      </WindowContext.Provider>
    </SafeAreaProvider>
  );
}

function Root({ initialUrl, shortcut }: { initialUrl: string | null; shortcut?: { id?: string; path?: string; link?: string } }) {
  // Shared with the other windows (windows.ts).
  const [profiles, setProfiles] = useSharedState<ProfileState>("profiles", () => store.profiles());
  const server = activeProfile(profiles)?.server ?? null;
  const [setup, setSetup] = useState(!store.server());
  const [settings, setSettings] = useState(false);
  const [locked, setLocked] = useSharedState("locked", () => store.appLock());
  const [lockOn, setLockOn] = useState(store.appLock());
  const [appState, setAppState] = useState<AppStateStatus>((AppState.currentState as AppStateStatus | null) || "active");
  const [signedIn, setSignedIn] = useState(!!store.deviceToken());
  const [pushAvailable, setPushAvailable] = useState(true);
  // The capture screen (widgets, controls, Siri, quick actions).
  const [capture, setCapture] = useState<CaptureRequest | null>(null);
  // Android: shared from another app, or quick capture (tile, shortcut).
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);
  // The document scanner (the page's "Scan document", flowplan://scan).
  const [scan, setScan] = useState<ScanRequest | null>(null);
  // A voice note the page asked for (VoiceNote.tsx).
  const [voice, setVoice] = useState<VoiceRequest | null>(null);
  const shell = useRef<ShellHandle>(null);
  // Paths and shares that arrive before the instance's page is there.
  // A window that became the main window keeps its page.
  // The quick action that started the app (iOS): its page opens as the
  // first one, its link (capture) once the app is there.
  const started = useRef<QuickAction | null>(startAction(shortcut));
  const pendingPath = useRef<string | null>(pathOn(initialUrl, server) ?? ((server && started.current?.path) || null));
  const registered = useRef<string | null>(null);
  // The registration last sent to the page, and whether the push relay
  // waits for its answer (push.ts → pushFields: pending).
  const sent = useRef<string | null>(null);
  const relayPending = useRef(false);
  const sentRelay = useRef(false);
  const backgroundSince = useRef(0);

  useEffect(() => {
    void checkAndroidUpdate();
    void SystemUI.setBackgroundColorAsync(BACKGROUND.light).catch(() => {});
    setUpNotifications();
    // The buttons on notifications, and (iOS) the session they act with.
    void setUpNotificationButtons();
    syncButtonSession();
    void SplashScreen.hideAsync().catch(() => {});
    void updateWidgets();
    // The configurable widgets get the session at once, also offline.
    syncWidgetSession();
    // Push relay keys of profiles left while the app was not running.
    cleanUpPushKeys();
    // Offline copies of profiles removed while a write was running.
    void wipeOrphanCopies(store.profiles().profiles.map((p) => p.id));
    // Signed in before the app kept track of it (#69).
    const id = store.profiles().active;
    if (id && store.deviceToken()) store.setEverSignedIn(id, true);
  }, []);

  const open = useCallback(
    (path: string) => {
      if (!server) return;
      if (shell.current) shell.current.navigate(path);
      else pendingPath.current = path;
    },
    [server],
  );

  // "Teilen" from other apps (Android): the capture screen; before signing
  // in, text and links go to the instance's share target (it signs in first).
  const share = useCallback(
    (shared: SharedContent) => {
      const draft = shareDraft(shared);
      if (!connection() && !draft.files.length) open(shareTargetPath(draft));
      else setShareRequest({ kind: "share", content: shared });
    },
    [open],
  );

  const appLink = useCallback(
    (link: string) => {
      if (link.startsWith("flowplan://sign-in")) return shell.current?.signInLink(link);
      if (link.startsWith("flowplan://change-server")) return setSetup(true);
      shortcutLinkOpened(link);
      if (link === "flowplan://quick-capture") return setShareRequest({ kind: "quick" });
      // Capture (widgets, controls, Siri), steps of the app (focus, stop),
      // a meeting's note – each checked before anything happens.
      const request = captureRequest(link);
      if (request) return setCapture(request);
      const scanning = scanRequest(link);
      if (scanning) return setScan(scanning);
      const step = doLink(link);
      if (step) return void runAppAction(step.action, step.minutes);
      const meeting = meetingLink(link);
      if (meeting) {
        const target = connection();
        if (target)
          void widgetAction<{ url?: string }>(target, "meeting.note", { ...meeting, zone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then((result) => {
            const path = result.ok ? pathOfAppLink(`flowplan://open?path=${encodeURIComponent(result.value.url ?? "")}`) : null;
            if (path) open(path);
          });
        return;
      }
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
    const buttons = onNotificationButton(open);
    const quickAction = ({ id, path, link }: QuickAction) => (id === "server" ? setSetup(true) : link ? appLink(link) : path && open(path));
    const first = started.current;
    started.current = null;
    if (first && (first.id === "server" || first.link)) quickAction(first);
    const actions = onQuickAction(quickAction);
    const takeAndShow = () => void takeShare().then((shared) => shared && share(shared));
    takeAndShow();
    const shares = addShareListener(takeAndShow);
    // iPad: Apple Pencil double-tap and squeeze go to the page.
    const pencil = addPencilListener((action) => shell.current?.pencil(action));
    // App Shortcuts and Siri ("Voice memo", "Start focus") hand a link over.
    const pending = consumePendingLink();
    if (pending) appLink(pending);
    const intentLinks = addAppLinkListener(appLink);
    // A result tapped in Spotlight (iOS).
    const found = consumeOpenedLink();
    if (found) appLink(found);
    const spotlight = addOpenedLinkListener(appLink);
    // "End" and "Stop" in the Live Activities.
    const activityButtons = listenToActivityButtons();
    return () => {
      spotlight.remove();
      intentLinks.remove();
      activityButtons.remove();
      pencil.remove();
      links.remove();
      opened.remove();
      received.remove();
      buttons.remove();
      actions.remove();
      shares.remove();
    };
  }, [appLink, open, share]);

  // Android: app shortcuts with the recently opened pages (android/shortcuts.ts).
  useEffect(() => (Platform.OS === "android" ? void syncShortcuts(signedIn) : setQuickActions(signedIn)), [signedIn]);

  // Handoff: a page from the Mac or another device, on its profile.
  useHandoff(
    () => store.profiles(),
    (target) => {
      if (target.profileId === store.profiles().active) return open(target.path);
      switchTo(target.profileId);
      pendingPath.current = target.path;
    },
  );
  useEffect(() => void scheduleBackgroundRefresh(signedIn), [signedIn]);

  // Back in the foreground: fresh widgets and badge; the app lock asks again
  // after a minute away.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppState(state);
      if (state === "background") {
        backgroundSince.current = Date.now();
        // The pages just opened, for the next long press on the icon.
        void syncShortcuts(!!store.deviceToken());
      }
      if (state === "active") {
        void checkAndroidUpdate();
        if (store.appLock() && backgroundSince.current && Date.now() - backgroundSince.current > LOCK_AFTER_MS) setLocked(true);
        backgroundSince.current = 0;
        const pending = consumePendingLink();
        if (pending) appLink(pending);
        // A missing or outdated session of the configurable widgets is
        // written again (and the widgets reload), also offline.
        syncWidgetSession();
        syncButtonSession();
        if (store.deviceToken()) void refresh().then((result) => "signedOut" in result && setSignedIn(false));
      }
    });
    return () => subscription.remove();
  }, [appLink]);

  // What runs now (focus, meeting, imports, incidents) as Live Activities /
  // ongoing notifications: asked while the app is in front – every minute,
  // every few seconds while an import or export runs.
  useEffect(() => {
    if (appState !== "active" || !signedIn) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await refreshActivities({ foreground: true }).catch(() => {});
      if (!stopped) timer = setTimeout(() => void poll(), nextPoll());
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [appState, signedIn]);

  // With the app lock on, nothing of the page shows while the app is not in
  // front (app switcher, Face ID prompt, a system sheet): an opaque cover, and
  // no screenshots or recordings while locked. On Android that is FLAG_SECURE,
  // which also keeps the page out of the app switcher's snapshot, so it stays
  // on as long as the lock is on.
  const covered = lockOn && appState !== "active";
  const secure = lockOn && (Platform.OS === "android" || locked || covered);
  useEffect(() => {
    if (secure) void ScreenCapture.preventScreenCaptureAsync("lock").catch(() => {});
    else void ScreenCapture.allowScreenCaptureAsync("lock").catch(() => {});
  }, [secure]);

  // Signed out in the page (or the session ended): the next registration
  // finds out, widgets and badge are cleared.
  const signedOut = useCallback(() => {
    registered.current = null;
    // Push through the relay ends with the session: relay tokens and key go
    // (a new sign-in makes new ones).
    const id = store.profiles().active;
    if (id) void leavePush(id);
    store.setDeviceToken(null);
    syncButtonSession();
    setSignedIn(false);
    void apply(null);
    void endAllActivities();
  }, []);

  // Registers this installation for the page's session: device token for the
  // widgets, and for notifications the push relay's token and this
  // profile's public key (native/push.ts) – or, for instances without the
  // relay, an Expo push token. Again when any of them or the session changes.
  const register = useCallback(async () => {
    const profile = activeProfile(store.profiles());
    if (!server || profile?.server !== server) return;
    const { pending, ...push } = await pushFields(profile, { create: !!store.deviceToken() });
    // "Approve" on workflow approvals: the verifier of this profile's
    // confirmation key (native/approvals.ts), made here on iOS.
    const approvalKey = await prepareApprovalKey(profile.id, tn("approvePrompt"));
    relayPending.current = pending;
    sentRelay.current = !!push.relayToken;
    // Live Activity tokens reach the instance on their own (live-push.ts):
    // not a reason to register again.
    const { liveActivityRelayTokens: _live, liveActivityLabels: _labels, ...lasting } = push;
    const key = `${server}|${JSON.stringify(lasting)}|${approvalKey ?? ""}`;
    if (registered.current === key) return;
    sent.current = key;
    shell.current?.register({
      installationId: store.installationId(),
      platform: Platform.OS === "ios" ? "ios" : "android",
      name: deviceName([Device.deviceName, Device.modelName], Platform.OS === "ios" ? (Platform.isPad ? "iPad" : "iPhone") : "Android"),
      appVersion: `${Application.nativeApplicationVersion ?? ""} (${Application.nativeBuildVersion ?? ""})`,
      ...push,
      ...(approvalKey ? { approvalKey } : {}),
    });
  }, [server]);

  // A new APNs / FCM token, or new Live Activity tokens: registered again.
  useEffect(() => {
    const again = () => {
      registered.current = null;
      void register();
    };
    const tokens = onDeviceTokenChanged(again);
    onLiveTokensChanged(again);
    onApprovalKeyChanged(again);
    return () => {
      tokens.remove();
      onLiveTokensChanged(null);
      onApprovalKeyChanged(null);
    };
  }, [register]);

  const onMessage = useCallback(
    async (message: PageMessage) => {
      switch (message.type) {
        case "registered": {
          const body = message.body as { deviceToken?: string; push?: boolean; pushAvailable?: boolean; pushRelay?: unknown } | null;
          if (message.status === 200 && body?.deviceToken) {
            store.setDeviceToken(body.deviceToken);
            const id = store.profiles().active;
            if (id) store.setEverSignedIn(id, true);
            syncButtonSession();
            // Without push from the instance, due tasks become reminders of
            // the phone itself (local-reminders.ts).
            setLocalRemindersWanted(body.push !== true);
            setSignedIn(true);
            setPushAvailable(body.pushAvailable !== false);
            registered.current = sent.current;
            void refresh();
            // Signed in for sure now: the push relay registration that
            // waited for it, and the instance gets its token.
            // The instance sends through another relay or signs as another
            // origin: the relay registration goes, register without it.
            if (sentRelay.current && server && relayMismatch(body.pushRelay, RELAY, server)) {
              sentRelay.current = false;
              relayRefusedBy(server);
              const id = store.profiles().active;
              if (id) void leavePush(id);
              registered.current = null;
              void register();
            } else if (relayPending.current) {
              relayPending.current = false;
              registered.current = null;
              void register();
            }
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
          // No device token yet (signed in without a full page load): the
          // registration brings one, and with it the first summary.
          if (!store.deviceToken()) void register();
          else void refresh();
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
        // "Other server? Switch profile" on the sign-in pages (#69): the
        // profiles; Cancel comes back to the page that asked (onPageLoaded).
        case "openProfiles": {
          const request = profilesRequest(message);
          if (!request) return;
          pendingPath.current = request.path;
          setSettings(false);
          setSetup(true);
          return;
        }
        case "scanDocument": {
          const request = pageScanRequest(message);
          if (request) setScan(request);
          return;
        }
        // A configuration profile (CalDAV) installs only from Safari; only
        // addresses of the instance.
        case "openInBrowser":
          if (server && originOf(message.url) === server) void Linking.openURL(message.url).catch(() => {});
          return;
        case "voiceNote": {
          const request = voiceRequest(message);
          if (request) setVoice(request);
          return;
        }
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

  const saveProfiles = (next: ProfileState) => {
    store.setProfiles(next);
    setProfiles(next);
  };

  // Leaves the active profile's instance before another one becomes active:
  // its entry for this phone goes (push and widgets follow the active profile
  // only), nothing of it stays in widgets and badge. Read and cleared while
  // it is still the active one; the sign-in in the web view stays, so coming
  // back registers again.
  const leaveActive = () => {
    const current = activeProfile(store.profiles());
    if (!current) return;
    const token = store.deviceToken();
    signedOut();
    store.forgetInstance(current.id);
    void clearSuiteAnswers(current.id);
    pendingPath.current = null;
    void leaveInstance(current.server, token);
  };

  const switchTo = (id: string) => {
    setSettings(false);
    setSetup(false);
    if (id === store.profiles().active) return;
    leaveActive();
    saveProfiles(switchProfile(store.profiles(), id));
    // The widgets belong to the new profile now (signed in there again
    // after its registration).
    void refreshSuite({ force: true });
  };

  // A new instance from the setup (checked there): a new profile, active.
  const connect = (origin: string, name: string) => {
    const current = store.profiles();
    const { state } = addProfile(current, { server: origin, name });
    leaveActive();
    saveProfiles(state);
    setSetup(false);
    void refreshSuite({ force: true });
  };

  // Signs out of the active profile's instance and removes the profile; the
  // next one becomes active, or the setup shows.
  const forget = async () => {
    const current = activeProfile(store.profiles());
    if (!current) return;
    setSettings(false);
    leaveActive();
    await shell.current?.signOut();
    const next = removeProfile(store.profiles(), current.id);
    saveProfiles(next);
    dropProfile(current.id);
    if (!next.active) setSetup(true);
  };

  // What the app keeps of a profile that is gone.
  const dropProfile = (id: string) => {
    store.setEverSignedIn(id, false);
    store.forgetAppDevice(id);
    forgetApprovalKey(id);
    void forgetSuiteProfile(id);
    // The offline copy of the instance's content goes with the profile.
    void wipeOfflineCopy(id);
    void refreshSuite({ force: true });
  };

  // The profile screen (#69): the active profile, never signed in, gets
  // another address – a new profile in its place – or goes. The profile
  // screen stays for the next step (another profile, or a new one).
  const replaceUnsigned = (id: string, origin: string, name: string) => {
    const current = activeProfile(store.profiles());
    if (!current || current.id !== id || store.everSignedIn(id)) return;
    let next: ProfileState;
    try {
      next = replaceProfile(store.profiles(), id, { server: origin, name }).state;
    } catch {
      return;
    }
    leaveActive();
    saveProfiles(next);
    dropProfile(id);
    setSetup(false);
  };
  const removeUnsigned = (id: string) => {
    const current = activeProfile(store.profiles());
    if (!current || current.id !== id || store.everSignedIn(id)) return;
    leaveActive();
    saveProfiles(removeProfile(store.profiles(), id));
    dropProfile(id);
    setSetup(true);
  };

  // Focus filters (iOS, native/intents.ts): the Focus's profile and
  // workspace when it starts or changes, the profile before when it ends.
  const followFocus = useRef(() => {});
  followFocus.current = () => {
    const step = takeFocusStep(store.profiles());
    if (step?.switchTo) {
      switchTo(step.switchTo);
      if (step.path) pendingPath.current = step.path;
    } else if (step?.path) open(step.path);
    void sendFocusRule(connection(), store.profiles().active);
  };
  useEffect(() => syncIntentProfiles(profiles), [profiles]);
  useEffect(() => {
    followFocus.current();
    const focus = addFocusFilterListener(() => followFocus.current());
    const foreground = AppState.addEventListener("change", (state) => state === "active" && followFocus.current());
    return () => {
      focus.remove();
      foreground.remove();
    };
  }, []);

  return (
    <>
      {setup || !server ? (
        <Setup
          // From the profiles to the first start (the last one removed): a
          // fresh screen with the suggested address.
          key={profiles.profiles.length ? "profiles" : "first"}
          profiles={profiles}
          suggested={server ? null : getManagedServer()}
          onConnect={connect}
          onSwitch={switchTo}
          onCancel={server ? () => setSetup(false) : undefined}
          unsigned={unsignedProfile(profiles, store.everSignedIn)}
          onReplace={replaceUnsigned}
          onRemove={removeUnsigned}
        />
      ) : (
        <Shell
          ref={shell}
          server={server}
          profile={activeProfile(profiles)?.id ?? ""}
          onMessage={(message) => void onMessage(message)}
          onAppLink={appLink}
          onProfiles={() => setSetup(true)}
          onPageLoaded={onPageLoaded}
          active={!settings && !locked && !covered}
        />
      )}
      {server ? (
        <Settings
          visible={settings}
          profiles={profiles}
          signedIn={signedIn}
          pushAvailable={pushAvailable}
          onClose={() => setSettings(false)}
          onSwitch={switchTo}
          onRename={(id, name) => saveProfiles(renameProfile(store.profiles(), id, name))}
          onAddProfile={() => {
            setSettings(false);
            setSetup(true);
          }}
          onForget={() => void forget()}
          onPushChanged={() => {
            registered.current = null;
            void register();
          }}
          onLockChanged={() => setLockOn(store.appLock())}
        />
      ) : null}
      {server ? <Capture request={locked ? null : capture} onClose={() => setCapture(null)} onOpen={open} /> : null}
      {server ? <ShareCapture request={locked ? null : shareRequest} onClose={() => setShareRequest(null)} onOpen={open} /> : null}
      {server ? <Scan request={locked ? null : scan} onClose={() => setScan(null)} onOpen={open} /> : null}
      {server ? (
        <VoiceNote
          request={locked ? null : voice}
          onResult={(id, scripts) => {
            shell.current?.deliver(scripts);
            setVoice((current) => (current?.id === id ? null : current));
          }}
        />
      ) : null}
      {locked ? <Lock onUnlocked={() => setLocked(false)} /> : null}
      {covered ? <Cover /> : null}
    </>
  );
}
