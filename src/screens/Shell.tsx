// The window on the instance: a system web view (WKWebView, Android System
// WebView) between status bar and home indicator / navigation bar. Those
// areas take the colours the page has at its top and bottom edge, so header
// and footer run into the system bars like in a native app. Pages that scroll
// as a whole (sign-in) keep their colours while scrolling, and content fades
// out at the edges instead of being cut.
//
// Without a connection the window shows the profile's offline copy (iOS,
// src/offline/): the instance's page as it was last stored, at the
// instance's address, its files from the copy. Back online it gives way to
// the live page once nobody is typing – at once when the instance runs
// another build than the copy's (src/offline/stale.ts). Only without a copy
// does the app's own offline screen show – with "Switch profile", also when
// the address answers with an error page and no Flowplan behind it (#69).
// Until a page is there, "Connecting to …" covers the window; an instance
// that does not answer within seconds leads to the copy or the offline
// screen instead of an empty window (src/connecting.ts, #203).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Keyboard, Linking, Platform, StyleSheet, View } from "react-native";
import * as Network from "expo-network";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { sha256Base64 } from "../sha256";
import { store } from "../store";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addEdgeSwipeListener, setEdgeSwipe, type PencilAction } from "../../modules/flowplan-native/src";
import { addBackProgressListener, setPredictiveBack } from "../../modules/flowplan-android/src";
import { scannerAvailable } from "../../modules/flowplan-capture/src";
import { inkRecognitionAvailable, recognizeInk } from "../../modules/flowplan-ink/src";
import { deviceAiAvailability, deviceAiCancel, deviceAiGenerate, deviceAiLinked, deviceAiStream, DeviceAiError } from "../../modules/flowplan-ai/src";
import { afterAnswer, backAction, parseBackProgress, previewsBack } from "../back";
import {
  backProgressScript,
  backScript,
  bridgeScript,
  downloadScript,
  parsePageMessage,
  pencilScript,
  registerScript,
  safeAreasScript,
  signOutScript,
  unregisterScript,
  windowsScript,
  type PageMessage,
} from "../bridge-script";
import { t } from "../i18n";
import { inkFailure, inkId, inkRequest, inkScript, InkRuns, type InkDetail } from "../ink-bridge";
import { aiCall, aiFailure, aiScript, type AiDetail } from "../ai-bridge";
import { decide, httpErrorNeedsCheck, isMainFrame, loadStarted, mayStay, missedSignIn, navigationState, pageRendered } from "../navigation";
import { checkServer, fetchRequest, instanceAnswers, originOf } from "../server";
import { acceptSignIn, base64Url, beginSignIn, PendingSignIns, redeemScript, signInAnswerScript, SignInStarts, signInVia } from "../sign-in";
import { parseInsets, safeAreaMode, type SafeAreaMode } from "../safe-areas";
import { BACKGROUND, usePalette } from "../ui";
import { useWindowFeatures } from "../window-features";
import { Offline, type OfflineReason } from "./Offline";
import { Connecting } from "./Connecting";
import { connectStep, nextTick, PROBE_TIMEOUT_MS, startConnect, type ConnectEvent } from "../connecting";
import { copyDocument } from "../offline/copy";
import { refreshScript, reachedScript, returnScript } from "../offline/loader";
import { offlineAnswer, parseOfflineMessage } from "../offline/messages";
import { offlineCopy } from "../offline/native";
import { setOfflineRefreshHook } from "../offline/refresh-hook";
import { answerBuild, copyOnReach, forgetCopyPage, pageBuild, parseStaleMessage, staleAction, type StaleMessage } from "../offline/stale";

export type ShellHandle = {
  // Opens a path of the instance ("/#inbox"); in the open page when possible.
  navigate: (path: string) => void;
  reload: () => void;
  // Handles flowplan://sign-in links that arrive from outside.
  signInLink: (link: string) => void;
  // Registers this installation for the page's session (device token, push).
  register: (body: Record<string, unknown>) => void;
  unregister: (installationId: string) => void;
  // Hands an Apple Pencil double-tap or squeeze to the page (whiteboard,
  // image markup: lib/stylus.ts in Flowplan).
  pencil: (action: PencilAction) => void;
  // Signs the web view out of the instance; resolves when done (at most 3 s).
  signOut: () => Promise<void>;
  // Runs the app's answers in the instance's page, in order (a voice note:
  // src/voice-bridge.ts).
  deliver: (scripts: string[]) => void;
};

type Props = {
  server: string;
  // The active profile: its offline copy (iOS).
  profile: string;
  onMessage: (message: PageMessage) => void;
  onAppLink: (link: string) => void;
  onProfiles: () => void;
  onPageLoaded: () => void;
  // The window is in front (no app settings, lock or setup over it): only
  // then does the edge swipe go back in the page.
  active: boolean;
};

const version = Application.nativeApplicationVersion || "1.0.0";
// Checked once: Vision's text recognition does not come and go.
const inkRecognition = inkRecognitionAvailable();
const deviceAi = deviceAiLinked();
const FADE = 14;

function luminance(color: string) {
  const parts = color.match(/[\d.]+/g)?.map(Number) || [];
  if (parts.length < 3) return 1;
  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
}
const transparent = (color: string) => color.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, "rgba($1,$2,$3,0)");

// Whether the network lets the instance be tried at all.
const connected = (state: Network.NetworkState) => !!state.isConnected && state.isInternetReachable !== false;

// Whether the instance answers (its health check, without cookies), and
// the build it runs (null on older instances).
async function reachable(server: string): Promise<{ ok: boolean; build: string | null }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 6000);
  try {
    const response = await fetch(`${server}/api/health`, { cache: "no-store", credentials: "omit", signal: abort.signal });
    return { ok: response.ok, build: answerBuild(response.headers) };
  } catch {
    return { ok: false, build: null };
  } finally {
    clearTimeout(timer);
  }
}

// Android: the main document always asks the instance (or its service
// worker) – never a stale page from the web view's HTTP cache, even behind a
// proxy that drops the instance's "no-store" (#61 in Flowplan). The app's
// files (/_next/static, immutable) stay cacheable.
const FRESH_DOCUMENT = { "Cache-Control": "no-cache" };

export const Shell = forwardRef<ShellHandle, Props>(function Shell({ server, profile, onMessage, onAppLink, onProfiles, onPageLoaded, active }, ref) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // WebView<object>: its typings make the props `never` without a type argument.
  const web = useRef<WebView<object>>(null);
  const [source, setSource] = useState<{ uri: string } | { html: string; baseUrl: string }>({ uri: server });
  // The profile's offline copy (iOS; null elsewhere and in older builds).
  const copy = useMemo(() => (Platform.OS === "ios" ? offlineCopy(profile) : null), [profile]);
  // This device's key for the profile's instance (app-device.ts): the
  // password sign-in sends it, so it lasts as long as the app's.
  const deviceKey = useMemo(() => store.appDevice(profile), [profile]);
  // The stored page is showing (not the live one).
  const [showingCopy, setShowingCopy] = useState(false);
  const showingCopyRef = useRef(false);
  showingCopyRef.current = showingCopy;
  // The build the stored page belongs to (src/offline/stale.ts).
  const copyBuild = useRef<string | null>(null);
  // A new key loads the page again even when the address stays the same.
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState<OfflineReason | false>(false);
  // "Connecting to …" over the window until a page is there (#203); a new
  // run starts with every fresh load (a new key, a crashed web view).
  const [connecting, setConnecting] = useState(true);
  const [connectRun, setConnectRun] = useState(0);
  const connectEvent = useRef<((event: ConnectEvent) => void) | null>(null);
  const settle = () => connectEvent.current?.({ type: "settled" });
  const [keyboard, setKeyboard] = useState(0);
  const keyboardRef = useRef(0);
  keyboardRef.current = keyboard;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  // Who keeps the page clear of the system bars (src/safe-areas.ts).
  const safeAreas = useRef<SafeAreaMode>("app");
  // Empty until the first page has loaded: paths wait for it.
  const pageUrl = useRef("");
  const signedOut = useRef<(() => void) | null>(null);
  const canGoBack = useRef(false);
  // What the page reported about "back" (back.ts); null until it does.
  const pageCanGoBack = useRef<boolean | null>(null);
  const [backable, setBackable] = useState(false);
  const navigation = useRef(navigationState());
  // The foreign page the web view was sent back from (Android, see below).
  const bounced = useRef("");
  const pending = useRef(new PendingSignIns());
  const signInStarts = useRef(new SignInStarts());
  // The page that linked a hand-off the app stopped only at its load.
  const beforeHandOff = useRef("");
  const redeemWhenLoaded = useRef<string | null>(null);
  // Colours of the bars (see the comment at the top).
  const [bars, setBars] = useState({ top: palette.background, bottom: palette.background, fadeTop: false, fadeBottom: false, cover: false });
  const bottomSettled = useRef(false);

  const onServer = () => originOf(pageUrl.current) === server;
  // The profile's instance now (answers that arrive after a switch are old).
  const serverRef = useRef(server);
  serverRef.current = server;
  // A message of the instance's page – the live one, or the stored one the
  // app loaded itself (whose address some WebKit versions may report as
  // about:blank).
  const fromInstance = (url: string) => originOf(url) === server || (showingCopyRef.current && /^about:blank/.test(url || ""));

  // Without a connection: the stored copy if there is one that works, the
  // offline screen otherwise.
  const building = useRef(false);
  const showCopy = useCallback(async () => {
    if (building.current) return;
    building.current = true;
    try {
      const html = copy ? await copyDocument(copy).catch(() => null) : null;
      if (!html) {
        setOffline("noCopy");
        return;
      }
      const hash = pageUrl.current.includes("#") ? pageUrl.current.slice(pageUrl.current.indexOf("#")) : "";
      copyBuild.current = pageBuild(html);
      setOffline(false);
      setShowingCopy(true);
      setSource({ html, baseUrl: `${server}/${hash}` });
    } finally {
      building.current = false;
    }
  }, [copy, server]);
  // Back to the live page (the same page of it).
  const goLive = useCallback(() => {
    const hash = pageUrl.current.includes("#") ? pageUrl.current.slice(pageUrl.current.indexOf("#")) : "";
    setShowingCopy(false);
    setOffline(false);
    setSource({ uri: `${server}/${hash}` });
    setAttempt((value) => value + 1);
  }, [server]);

  const run = useCallback((script: string) => web.current?.injectJavaScript(script), []);
  // The window's size (it changes when iPhone Duo opens or closes, in Split
  // View and Stage Manager): whether it can open windows depends on it.
  const [size, setSize] = useState({ width: 0, height: 0 });
  // iPad and iPhone Duo: key commands, Handoff and further windows
  // (window-features.ts). A page UIKit opened no window for opens here.
  const features = useWindowFeatures({ run, server, active, size, refused: (url) => void route(url, true, true) });
  const windowsAvailable = useRef(features.windowsAvailable);
  windowsAvailable.current = features.windowsAvailable;
  useEffect(() => {
    if (features.windows) run(windowsScript(features.windowsAvailable));
  }, [features.windows, features.windowsAvailable, run]);

  const navigate = useCallback(
    (path: string) => {
      const target = new URL(path, server).href;
      // The stored copy has the app's page only: another place in it.
      if (showingCopyRef.current) {
        const url = new URL(target);
        if (url.pathname === "/" && url.hash) run(`location.hash = ${JSON.stringify(url.hash)}; true;`);
        return;
      }
      setOffline(false);
      if (onServer()) run(`location.assign(${JSON.stringify(target)}); true;`);
      else setSource({ uri: target });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server, run],
  );

  const redeem = useCallback(
    (code: string, verifier: string) => {
      const script = redeemScript(code, verifier, t("signInFailed"), t("signInAgain"));
      if (onServer()) run(script);
      else {
        redeemWhenLoaded.current = script;
        setSource({ uri: server });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server, run],
  );

  const signInLink = useCallback(
    (link: string) => {
      const result = acceptSignIn(link, server, pending.current);
      if (!result) return;
      if ("error" in result) Alert.alert(t("signInImpossible"), t("signInForeign"));
      else redeem(result.code, result.verifier);
    },
    [server, redeem],
  );

  // Passkeys and SSO: the system's sign-in sheet (ASWebAuthenticationSession,
  // Custom Tab), which hands flowplan://sign-in back. Every failure is shown
  // and told to the page, which reports it to the instance's log (#109).
  const startSignIn = useCallback(
    async (via: string | null, how: "bridge" | "navigation" | "load") => {
      if (!signInStarts.current.begin()) return;
      const outcome = await beginSignIn(server, via, {
        verifier: () => base64Url(Crypto.getRandomBytes(32)),
        sha256Base64,
        pending: pending.current,
        open: {
          platform: Platform.OS,
          authSession: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect, { preferEphemeralSession: false }),
          // Without waiting for the tab to close: the result comes as an app link.
          customTab: (url) => WebBrowser.openBrowserAsync(url, { showTitle: true, createTask: false }).then(() => undefined),
          browser: (url) => Linking.openURL(url),
        },
      }).catch((e: unknown) => ({ opened: false as const, stage: "open" as const, error: e instanceof Error ? e.message : String(e) }));
      if (outcome.opened) {
        if (onServer()) run(signInAnswerScript({ status: "opened" }));
        if (outcome.link) signInLink(outcome.link);
        return;
      }
      console.warn(`sign-in (${how}) failed at ${outcome.stage}:`, outcome.error);
      if (onServer()) run(signInAnswerScript({ status: "failed", stage: `${how}/${outcome.stage}`, error: outcome.error }));
      Alert.alert(t("signInImpossible"), outcome.stage === "open" ? t("signInNoBrowser") : `${t("signInFailed")}: ${outcome.error}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server, signInLink, run],
  );

  useImperativeHandle(
    ref,
    () => ({
      navigate,
      reload: () => {
        setOffline(false);
        if (showingCopyRef.current) goLive();
        else if (onServer()) web.current?.reload();
        else {
          setSource({ uri: server });
          setAttempt((value) => value + 1);
        }
      },
      signInLink,
      register: (body) => {
        if (onServer()) run(registerScript(body));
      },
      unregister: (installationId) => {
        if (onServer()) run(unregisterScript(installationId));
      },
      pencil: (action) => {
        if (onServer()) run(pencilScript(action));
      },
      deliver: (scripts) => {
        if (onServer()) for (const script of scripts) run(script);
      },
      signOut: () =>
        new Promise<void>((resolve) => {
          if (!onServer()) return resolve();
          const done = () => {
            signedOut.current = null;
            resolve();
          };
          signedOut.current = done;
          setTimeout(done, 3000);
          run(signOutScript);
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, signInLink, server, run, goLive],
  );

  // A new instance (another profile): start there, forget pending sign-ins,
  // the identity provider of the previous one and a sign-in waiting to be
  // redeemed – nothing of one profile's sign-in reaches the next.
  useEffect(() => {
    pending.current.clear();
    navigation.current = navigationState();
    redeemWhenLoaded.current = null;
    pageUrl.current = "";
    setSource({ uri: server });
    setOffline(false);
    setShowingCopy(false);
    // No network at all: straight to the copy, without waiting for the
    // web view to fail.
    let stale = false;
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!stale && !connected(state)) void showCopy();
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [server, showCopy]);

  // A fresh load of the instance's page (src/connecting.ts): the health
  // check runs next to it; without an answer in time, the stored copy or the
  // offline screen – the web view may wait a minute or more for a network
  // that cannot reach the instance.
  const showCopyRef = useRef(showCopy);
  showCopyRef.current = showCopy;
  useEffect(() => {
    let state = startConnect(Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    setConnecting(true);
    const apply = (event: ConnectEvent) => {
      if (stopped) return;
      state = connectStep(state, event, Platform.OS);
      if (timer) clearTimeout(timer);
      if (state.phase === "connecting") {
        const at = nextTick(state);
        if (at !== null) timer = setTimeout(() => apply({ type: "tick", at: Date.now() }), Math.max(0, at - Date.now()));
        return;
      }
      stopped = true;
      connectEvent.current = null;
      setConnecting(false);
      if (state.phase === "fallback") void showCopyRef.current();
    };
    connectEvent.current = apply;
    apply({ type: "tick", at: Date.now() });
    void instanceAnswers(server, PROBE_TIMEOUT_MS).then((answered) => apply({ type: "probe", answered, at: Date.now() }));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (connectEvent.current === apply) connectEvent.current = null;
    };
  }, [server, attempt, connectRun]);
  // The stored copy or the offline screen took over: nothing to wait for.
  useEffect(() => {
    if (offline || showingCopy) settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, showingCopy]);

  // The stored copy is showing: once the network is back and the instance
  // answers, the page hears it (it sends what was changed offline) and the
  // live page follows (returnScript waits until nobody types). A copy of
  // another build than the instance runs gives way at once: what was changed
  // offline is kept by the page (IndexedDB, the queue of record changes) and
  // sent by the live one. Checked once right away as well – the network's
  // state at the start may have been wrong.
  useEffect(() => {
    if (!showingCopy) return;
    let checking = false;
    let stopped = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const answer = await reachable(server);
        if (answer.ok && !stopped) {
          run(reachedScript);
          if (copyOnReach(copyBuild.current, answer.build) === "now") goLive();
          else run(returnScript);
        }
      } finally {
        checking = false;
      }
    };
    void check();
    const subscription = Network.addNetworkStateListener((state) => {
      if (connected(state)) void check();
    });
    const foreground = AppState.addEventListener("change", (state) => state === "active" && void check());
    return () => {
      stopped = true;
      subscription.remove();
      foreground.remove();
    };
  }, [showingCopy, server, run, goLive]);

  // Back in the foreground: the page brings its copy up to date (it asks
  // the instance only for what changed); the background task asks too.
  useEffect(() => {
    if (!copy || !features.main) return;
    const ask = () => {
      if (onServer() && !showingCopyRef.current) run(refreshScript);
    };
    const subscription = AppState.addEventListener("change", (state) => state === "active" && ask());
    setOfflineRefreshHook(ask);
    return () => {
      subscription.remove();
      setOfflineRefreshHook(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy, features.main, run]);

  // "Back" (back.ts): the page decides on instances that know how, the web
  // view's history on older ones; otherwise back is the system's.
  const backState = () => ({ offline: !!offline, onServer: onServer(), pageCanGoBack: pageCanGoBack.current, historyCanGoBack: canGoBack.current });
  const updateBackable = () => setBackable(backAction(backState()) !== "system");
  const goBack = () => {
    const action = backAction(backState());
    if (action === "page") run(backScript);
    else if (action === "history") web.current?.goBack();
    return action !== "system";
  };
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  // Android: back to the system (the launcher). The predictive back
  // callback steps aside first, or the system's back would come to it again.
  const leaveApp = () => {
    setPredictiveBack(false);
    BackHandler.exitApp();
  };
  const handleBackAnswer = (handled: boolean | null) => {
    const next = afterAnswer(handled, canGoBack.current);
    if (next === "history") web.current?.goBack();
    // The page had nothing left to close (it changed meanwhile): Android
    // leaves the app as its back would have.
    else if (next === "system" && Platform.OS === "android") leaveApp();
  };
  // The predictive back gesture (Android 14+): its progress goes to the page,
  // which shows what back will close (the top sheet sinks, the page slides);
  // "commit" is the back itself, also for the back button.
  const backProgressRef = useRef((_: unknown) => {});
  backProgressRef.current = (raw: unknown) => {
    const event = parseBackProgress(raw);
    if (!event) return;
    if (previewsBack(backState())) run(backProgressScript(event));
    if (event.phase === "commit" && !goBack()) leaveApp();
  };

  // Android's back button and gesture.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => goBackRef.current());
    return () => subscription.remove();
  }, []);
  // With a step back in the page, the gesture (and its preview) is the app's;
  // without one, the system's.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = addBackProgressListener((event) => backProgressRef.current(event));
    return () => {
      subscription.remove();
      setPredictiveBack(false);
    };
  }, []);
  useEffect(() => {
    if (Platform.OS === "android") setPredictiveBack(active && backable && !offline);
  }, [active, backable, offline]);

  // iOS: the swipe from the left edge (modules/flowplan-native) instead of
  // the web view's own, which walks its history – in the main window (it is
  // on the window that has it, windows.ts).
  useEffect(() => {
    if (!features.main) return;
    const subscription = addEdgeSwipeListener(() => void goBackRef.current());
    return () => {
      subscription.remove();
      setEdgeSwipe(false);
    };
  }, [features.main]);
  useEffect(() => {
    if (features.main) setEdgeSwipe(active && backable && !offline);
  }, [features.main, active, backable, offline]);

  // Android draws edge to edge: the page makes room for the keyboard itself.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const handleEdges = (message: Extract<PageMessage, { type: "edges" }>) => {
    // iOS hands the safe areas to pages that draw edge to edge, Android only
    // when its web view reports them (src/safe-areas.ts); older instances
    // get the bars in their colours.
    const mode = safeAreaMode({
      platform: Platform.OS,
      cover: message.cover === true,
      measured: parseInsets(message.insets),
      native: insetsRef.current,
      keyboard: keyboardRef.current > 0,
      previous: safeAreas.current,
    });
    safeAreas.current = mode;
    // The page follows (its bridge reports what it has; Android only).
    if (Platform.OS === "android" && message.safeAreas !== mode) run(safeAreasScript(mode));
    const cover = mode === "page";
    setBars((previous) => {
      let top = message.top || message.background || palette.background;
      let bottom = message.bottom || message.background || palette.background;
      if (message.scrolls) {
        // Content passing the edges does not recolour the bars.
        if (!message.atTop) top = previous.top;
        if (!message.atBottom) bottom = bottomSettled.current ? previous.bottom : message.background || bottom;
        else bottomSettled.current = true;
      }
      return { top, bottom, cover, fadeTop: !cover && message.scrolls && !message.atTop, fadeBottom: !cover && message.scrolls && !message.atBottom };
    });
  };

  // Handwriting of the page's ink (ink-bridge.ts): one recognition per id,
  // the answer as "flowplan:ink-recognized" – only to the instance's page.
  const inkRuns = useRef(new InkRuns());
  const handleInk = (message: Extract<PageMessage, { type: "recognizeInk" }>) => {
    const id = inkId(message);
    if (id === null) return;
    const answer = (detail: InkDetail) => {
      if (onServer()) run(inkScript(detail));
    };
    if (!inkRecognition) return answer(inkFailure(id, "unavailable"));
    const request = inkRequest(message);
    const ticket = request ? inkRuns.current.start(id) : null;
    if (!request || ticket === null) return answer(inkFailure(id, "failed"));
    void recognizeInk(request)
      .then(
        (result): InkDetail => ({ id, text: result.text, lines: result.lines }),
        (error: unknown): InkDetail => inkFailure(id, error instanceof Error && error.message === "unavailable" ? "unavailable" : "failed"),
      )
      .then((detail) => {
        if (inkRuns.current.finish(id, ticket)) answer(detail);
      });
  };

  // On-device AI (ai-bridge.ts): the module runs one request at a time and
  // refuses others as "busy"; answers and the streamed text go only to the
  // instance's page.
  const handleAi = (message: Extract<PageMessage, { type: "ai" }>) => {
    const call = aiCall(message);
    if (!call) return;
    const answer = (detail: AiDetail) => {
      if (onServer()) run(aiScript(detail));
    };
    const failed = (error: unknown) => answer(aiFailure(call.id, error instanceof DeviceAiError ? error.code : "error"));
    switch (call.op) {
      case "availability":
        return void deviceAiAvailability().then((result) => answer({ id: call.id, kind: "done", result }));
      case "cancel":
        return deviceAiCancel(call.id);
      case "failed":
        return answer(aiFailure(call.id, call.code));
      case "generate":
        return void deviceAiGenerate(call.request).then((result) => answer({ id: call.id, kind: "done", result }), failed);
      case "stream":
        return void deviceAiStream(call.request, (text) => answer({ id: call.id, kind: "chunk", text })).then((result) => answer({ id: call.id, kind: "done", result }), failed);
    }
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    // Only the instance's pages talk to the app.
    if (!fromInstance(event.nativeEvent.url)) return;
    const message = parsePageMessage(event.nativeEvent.data);
    if (!message) return;
    // The page runs: it is there.
    settle();
    if (message.type === "offline") {
      const call = parseOfflineMessage(message);
      if (call && copy) void offlineAnswer(copy, call).then((script) => run(script));
      return;
    }
    if (message.type === "offlineReturn") {
      if (showingCopyRef.current) goLive();
      return;
    }
    if (message.type === "staleCopy") {
      const stale = parseStaleMessage(message);
      if (stale) void handleStale(stale);
      return;
    }
    if (message.type === "edges") handleEdges(message);
    else if (message.type === "signedOut") signedOut.current?.();
    else if (message.type === "backState") {
      pageCanGoBack.current = message.canGoBack;
      updateBackable();
    } else if (message.type === "back") handleBackAnswer(message.handled);
    else if (message.type === "shortcuts") features.shortcuts(message.list);
    else if (message.type === "recognizeInk") handleInk(message);
    else if (message.type === "ai") handleAi(message);
    else if (message.type === "signIn") void startSignIn(signInVia(message), "bridge");
    else if (message.type === "openWindow") {
      if (!features.openWindow(message.url)) route(message.url, true, true);
    } else onMessage(message);
  };

  // The page's files did not load (lib/stale-copy.ts in Flowplan): a copy of
  // an older build. The live page reloads itself; the stored one is replaced
  // by the live page, or by the offline screen without a connection.
  const handleStale = async (message: StaleMessage) => {
    const showing = showingCopyRef.current;
    const reached = showing ? (await reachable(server)).ok : true;
    const action = staleAction(message, showing, reached);
    // iOS: memory and fetch cache only – its disk files would include the
    // page's IndexedDB and localStorage (what was changed offline).
    if (action.clearWebCache) web.current?.clearCache?.(Platform.OS === "android");
    if (action.forgetCopyPage && copy) await forgetCopyPage(copy).catch(() => {});
    if (action.next === "live") goLive();
    else if (action.next === "offline") setOffline("copyFailed");
  };

  // Where a navigation goes (navigation.ts); true lets the web view load it.
  const route = (url: string, mainFrame: boolean, newWindow = false) => {
    const decision = decide(url, { server, mainFrame, newWindow, state: navigation.current });
    switch (decision.kind) {
      case "allow":
        return true;
      case "signIn":
        void startSignIn(decision.via, "navigation");
        return false;
      case "appLink":
        if (decision.url.startsWith("flowplan://sign-in")) signInLink(decision.url);
        else onAppLink(decision.url);
        return false;
      case "external":
        void Linking.openURL(decision.url).catch(() => {});
        return false;
      case "open":
        setSource({ uri: decision.url });
        return false;
      default:
        return false;
    }
  };

  // Android's web view does not ask onShouldStartLoadWithRequest about form
  // POSTs (an identity provider's form_post, a form on a foreign page), so a
  // foreign page can arrive here without route() having seen it. Then it is
  // stopped, the window goes back to the instance and the system opens it.
  const bounceForeign = (url: string) => {
    if (bounced.current === url || mayStay(url, server, navigation.current)) return false;
    bounced.current = url;
    web.current?.stopLoading();
    if (canGoBack.current) web.current?.goBack();
    else setSource({ uri: server });
    void Linking.openURL(url).catch(() => {});
    return true;
  };

  const onNavigationStateChange = (state: WebViewNavigation) => {
    canGoBack.current = state.canGoBack;
    features.page(state.url, state.title);
    if (state.url !== pageUrl.current) {
      pageUrl.current = state.url;
      bottomSettled.current = false;
    }
    bounceForeign(state.url);
    updateBackable();
  };

  const fallback = palette.background;
  const webSource = useMemo(() => ("uri" in source && Platform.OS === "android" ? { ...source, headers: FRESH_DOCUMENT } : source), [source]);
  const statusStyle = luminance(bars.top) < 0.5 ? "light" : "dark";
  const navigationStyle = luminance(bars.bottom) < 0.5 ? "light" : "dark";

  const retry = useCallback(() => {
    setOffline(false);
    setShowingCopy(false);
    setSource({ uri: server });
    setAttempt((value) => value + 1);
  }, [server]);
  if (offline) return <Offline server={server} reason={offline} onRetry={retry} onProfiles={onProfiles} />;

  return (
    <View
      style={{ flex: 1, backgroundColor: bars.top }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      <StatusBar style={statusStyle} animated />
      {Platform.OS === "android" ? <NavigationBar style={navigationStyle} /> : null}
      <View style={{ height: bars.cover ? 0 : insets.top, backgroundColor: bars.top }} />
      <View style={{ flex: 1, paddingLeft: bars.cover ? 0 : insets.left, paddingRight: bars.cover ? 0 : insets.right, backgroundColor: fallback, overflow: "hidden" }}>
        <WebView<object>
          key={attempt}
          ref={web}
          source={webSource}
          style={{ flex: 1, backgroundColor: fallback }}
          containerStyle={{ backgroundColor: fallback }}
          // The instance shows the app's sign-in (passkeys and SSO through the
          // system) when it sees this.
          applicationNameForUserAgent={`FlowplanMobile/${version}`}
          injectedJavaScriptBeforeContentLoaded={bridgeScript({
            server,
            platform: Platform.OS === "ios" ? "ios" : "android",
            version,
            scanner: scannerAvailable(),
            windows: features.windows,
            inkRecognition,
            ai: deviceAi,
            offline: !!copy,
            deviceKey,
          })}
          injectedJavaScriptForMainFrameOnly
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request) => route(request.url, isMainFrame(request))}
          // Links with target=_blank; on the iPad (and iPhone Duo) those to the instance in a
          // window of their own.
          onOpenWindow={(event) => {
            const url = event.nativeEvent.targetUrl;
            if (!features.openWindow(url)) void route(url, true, true);
          }}
          setSupportMultipleWindows
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={(event) => {
            const url = event.nativeEvent.url;
            // Another document (not just another #route): it reports anew
            // whether back does something; until then the history counts.
            if (url.split("#")[0] !== pageUrl.current.split("#")[0]) pageCanGoBack.current = null;
            // The hand-off loads although route() should have caught it
            // (#109): stopped, and the sign-in starts here.
            const missed = missedSignIn(url, server);
            if (missed) {
              console.warn("sign-in hand-off was not caught before loading", url);
              if (!missedSignIn(pageUrl.current, server)) beforeHandOff.current = pageUrl.current;
              web.current?.stopLoading();
              void startSignIn(missed.via, "load");
              return;
            }
            loadStarted(navigation.current, url, server);
            bounceForeign(url);
          }}
          // A page is there (also a foreign one, an error page): no longer
          // "Connecting". Failed loads end in onError, which decides.
          onLoad={(event) => {
            if (showingCopyRef.current || !/^about:blank/.test(event.nativeEvent.url || "")) settle();
          }}
          onLoadEnd={(event) => {
            const url = event.nativeEvent.url;
            // A hand-off stopped too late (onLoadStart): back to the page
            // that linked it, not the instance's "Invalid link".
            if (missedSignIn(url, server)) {
              const back = originOf(beforeHandOff.current) === server ? beforeHandOff.current : server;
              run(`location.replace(${JSON.stringify(back)}); true;`);
              return;
            }
            pageUrl.current = url;
            pageRendered(navigation.current);
            if (!fromInstance(url)) return;
            if (features.windows) run(windowsScript(windowsAvailable.current));
            if (redeemWhenLoaded.current) {
              run(redeemWhenLoaded.current);
              redeemWhenLoaded.current = null;
            }
            onPageLoaded();
          }}
          // Without a connection: the offline page. Cancelled loads (a newer
          // navigation, a link the app handled) are no failures.
          onError={(event) => {
            const { code, url } = event.nativeEvent;
            // iOS: cancelled (-999), interrupted by the app's own decision (102);
            // Android: a scheme the web view does not load (-10).
            if (code === -999 || code === 102 || code === -10) return;
            if (!url || originOf(url) === server) {
              settle();
              // The stored copy itself failed: the offline screen.
              if (showingCopyRef.current) setOffline("copyFailed");
              else void showCopy();
            }
          }}
          // An error page instead of the instance (a proxy's 502 while it is
          // down, a domain that serves something else now): when no Flowplan
          // answers there, the offline screen (or the stored copy) – it has
          // "Try again" and "Switch profile"; the error page has neither.
          onHttpError={(event) => {
            const { url, statusCode } = event.nativeEvent;
            if (showingCopyRef.current || !httpErrorNeedsCheck(url, statusCode, server)) return;
            void checkServer(server, fetchRequest).then(
              () => {},
              () => {
                if (serverRef.current === server && !showingCopyRef.current && originOf(pageUrl.current || url) === server) void showCopy();
              },
            );
          }}
          // The page loads again from scratch: "Connecting" until it is there.
          onContentProcessDidTerminate={() => {
            setConnectRun((value) => value + 1);
            web.current?.reload();
          }}
          onRenderProcessGone={() => {
            setConnectRun((value) => value + 1);
            web.current?.reload();
          }}
          // Exports and files: the page fetches them with its cookies and
          // hands them to the share sheet (iOS web views cannot download).
          onFileDownload={(event) => {
            const url = event.nativeEvent.downloadUrl;
            if (originOf(url) === server) run(downloadScript(url));
            else void Linking.openURL(url).catch(() => {});
          }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled={false}
          domStorageEnabled
          javaScriptEnabled
          // Back is the app's (back.ts), not a walk through the history.
          allowsBackForwardNavigationGestures={false}
          // The page scrolls inside its own panes; the document itself must
          // not bounce, or a swipe on the tab bar slides the whole layout.
          bounces={false}
          allowsInlineMediaPlayback
          allowsLinkPreview={false}
          mediaPlaybackRequiresUserAction
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          // No "previous / next / done" bar above the keyboard: native apps have none.
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          pullToRefreshEnabled={false}
          textZoom={100}
          // The default, said out loud: HTTP caching as the instance asks for
          // it (its pages "no-store", its files immutable) – never
          // LOAD_CACHE_ELSE_NETWORK, which would open a page of an old build.
          cacheMode="LOAD_DEFAULT"
          webviewDebuggingEnabled={__DEV__}
          // Everything passes the native filter: route() and bounceForeign()
          // decide. (A list of origins here would make the web view hand the
          // identity provider's pages to the system browser mid sign-in.)
          originWhitelist={["*"]}
        />
        {bars.fadeTop ? (
          <LinearGradient pointerEvents="none" colors={[bars.top, transparent(bars.top)]} style={[shellStyles.fade, { top: 0 }]} />
        ) : null}
        {bars.fadeBottom ? (
          <LinearGradient pointerEvents="none" colors={[transparent(bars.bottom), bars.bottom]} style={[shellStyles.fade, { bottom: 0 }]} />
        ) : null}
        {connecting && !showingCopy ? <Connecting server={server} /> : null}
      </View>
      <View style={{ height: bars.cover ? keyboard : Math.max(insets.bottom, keyboard), backgroundColor: keyboard ? fallback : bars.bottom }} />
    </View>
  );
});

const shellStyles = StyleSheet.create({
  fade: { position: "absolute", left: 0, right: 0, height: FADE },
});

export { BACKGROUND };
