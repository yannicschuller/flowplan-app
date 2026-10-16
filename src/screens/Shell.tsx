// The window on the instance: a system web view (WKWebView, Android System
// WebView) between status bar and home indicator / navigation bar. Those
// areas take the colours the page has at its top and bottom edge, so header
// and footer run into the system bars like in a native app. Pages that scroll
// as a whole (sign-in) keep their colours while scrolling, and content fades
// out at the edges instead of being cut.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, BackHandler, Keyboard, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PencilAction } from "../../modules/flowplan-native/src";
import {
  bridgeScript,
  downloadScript,
  parsePageMessage,
  pencilScript,
  registerScript,
  signOutScript,
  unregisterScript,
  type PageMessage,
} from "../bridge-script";
import { t } from "../i18n";
import { decide, type NavigationState } from "../navigation";
import { originOf } from "../server";
import { acceptSignIn, base64Url, PendingSignIns, redeemScript, signInUrl } from "../sign-in";
import { BACKGROUND, usePalette } from "../ui";
import { Offline } from "./Offline";

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
};

type Props = {
  server: string;
  onMessage: (message: PageMessage) => void;
  onAppLink: (link: string) => void;
  onChangeServer: () => void;
  onPageLoaded: () => void;
};

const version = Application.nativeApplicationVersion || "1.0.0";
const FADE = 14;

function luminance(color: string) {
  const parts = color.match(/[\d.]+/g)?.map(Number) || [];
  if (parts.length < 3) return 1;
  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
}
const transparent = (color: string) => color.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, "rgba($1,$2,$3,0)");

export const Shell = forwardRef<ShellHandle, Props>(function Shell({ server, onMessage, onAppLink, onChangeServer, onPageLoaded }, ref) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  // WebView<object>: its typings make the props `never` without a type argument.
  const web = useRef<WebView<object>>(null);
  const [source, setSource] = useState({ uri: server });
  // A new key loads the page again even when the address stays the same.
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  // Empty until the first page has loaded: paths wait for it.
  const pageUrl = useRef("");
  const signedOut = useRef<(() => void) | null>(null);
  const canGoBack = useRef(false);
  const navigation = useRef<NavigationState>({ signingInUntil: 0 });
  const pending = useRef(new PendingSignIns());
  const redeemWhenLoaded = useRef<string | null>(null);
  // Colours of the bars (see the comment at the top).
  const [bars, setBars] = useState({ top: palette.background, bottom: palette.background, fadeTop: false, fadeBottom: false });
  const bottomSettled = useRef(false);

  const onServer = () => originOf(pageUrl.current) === server;

  const run = useCallback((script: string) => web.current?.injectJavaScript(script), []);

  const navigate = useCallback(
    (path: string) => {
      const target = new URL(path, server).href;
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
  // Custom Tab), which hands flowplan://sign-in back.
  const startSignIn = useCallback(
    async (via: string | null) => {
      const verifier = base64Url(Crypto.getRandomBytes(32));
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
      });
      const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      pending.current.add(challenge, verifier);
      try {
        const result = await WebBrowser.openAuthSessionAsync(signInUrl(server, challenge, via), "flowplan://sign-in", {
          preferEphemeralSession: false,
        });
        if (result.type === "success" && result.url) signInLink(result.url);
      } catch {}
    },
    [server, signInLink],
  );

  useImperativeHandle(
    ref,
    () => ({
      navigate,
      reload: () => {
        setOffline(false);
        if (onServer()) web.current?.reload();
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
    [navigate, signInLink, server, run],
  );

  // A new instance: start there, forget pending sign-ins.
  useEffect(() => {
    pending.current.clear();
    setSource({ uri: server });
    setOffline(false);
  }, [server]);

  // Android's back button goes back in the page first.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current && !offline) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [offline]);

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
    setBars((previous) => {
      let top = message.top || message.background || palette.background;
      let bottom = message.bottom || message.background || palette.background;
      if (message.scrolls) {
        // Content passing the edges does not recolour the bars.
        if (!message.atTop) top = previous.top;
        if (!message.atBottom) bottom = bottomSettled.current ? previous.bottom : message.background || bottom;
        else bottomSettled.current = true;
      }
      return { top, bottom, fadeTop: message.scrolls && !message.atTop, fadeBottom: message.scrolls && !message.atBottom };
    });
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    // Only the instance's pages talk to the app.
    if (originOf(event.nativeEvent.url) !== server) return;
    const message = parsePageMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "edges") handleEdges(message);
    else if (message.type === "signedOut") signedOut.current?.();
    else onMessage(message);
  };

  // Where a navigation goes (navigation.ts); true lets the web view load it.
  const route = (url: string, mainFrame: boolean, newWindow = false) => {
    const decision = decide(url, { server, mainFrame, newWindow, state: navigation.current });
    switch (decision.kind) {
      case "allow":
        return true;
      case "signIn":
        void startSignIn(decision.via);
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

  const onNavigationStateChange = (state: WebViewNavigation) => {
    canGoBack.current = state.canGoBack;
    if (state.url !== pageUrl.current) {
      pageUrl.current = state.url;
      bottomSettled.current = false;
    }
  };

  const fallback = palette.background;
  const statusStyle = luminance(bars.top) < 0.5 ? "light" : "dark";
  const navigationStyle = luminance(bars.bottom) < 0.5 ? "light" : "dark";

  const retry = useCallback(() => {
    setOffline(false);
    setAttempt((value) => value + 1);
  }, []);
  if (offline) return <Offline server={server} onRetry={retry} onChangeServer={onChangeServer} />;

  return (
    <View style={{ flex: 1, backgroundColor: bars.top }}>
      <StatusBar style={statusStyle} animated />
      {Platform.OS === "android" ? <NavigationBar style={navigationStyle} /> : null}
      <View style={{ height: insets.top, backgroundColor: bars.top }} />
      <View style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: fallback, overflow: "hidden" }}>
        <WebView<object>
          key={attempt}
          ref={web}
          source={source}
          style={{ flex: 1, backgroundColor: fallback }}
          containerStyle={{ backgroundColor: fallback }}
          // The instance shows the app's sign-in (passkeys and SSO through the
          // system) when it sees this.
          applicationNameForUserAgent={`FlowplanMobile/${version}`}
          injectedJavaScriptBeforeContentLoaded={bridgeScript({ server, platform: Platform.OS === "ios" ? "ios" : "android", version })}
          injectedJavaScriptForMainFrameOnly
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request) => route(request.url, request.isTopFrame !== false)}
          // Links with target=_blank.
          onOpenWindow={(event) => void route(event.nativeEvent.targetUrl, true, true)}
          setSupportMultipleWindows
          onNavigationStateChange={onNavigationStateChange}
          onLoadEnd={(event) => {
            const url = event.nativeEvent.url;
            pageUrl.current = url;
            if (originOf(url) !== server) return;
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
            if (!url || originOf(url) === server) setOffline(true);
          }}
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => web.current?.reload()}
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
          allowsBackForwardNavigationGestures
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
          webviewDebuggingEnabled={__DEV__}
          originWhitelist={["*"]}
        />
        {bars.fadeTop ? (
          <LinearGradient pointerEvents="none" colors={[bars.top, transparent(bars.top)]} style={[shellStyles.fade, { top: 0 }]} />
        ) : null}
        {bars.fadeBottom ? (
          <LinearGradient pointerEvents="none" colors={[transparent(bars.bottom), bars.bottom]} style={[shellStyles.fade, { bottom: 0 }]} />
        ) : null}
      </View>
      <View style={{ height: Math.max(insets.bottom, keyboard), backgroundColor: keyboard ? fallback : bars.bottom }} />
    </View>
  );
});

const shellStyles = StyleSheet.create({
  fade: { position: "absolute", left: 0, right: 0, height: FADE },
});

export { BACKGROUND };
