import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bridgeScript, parsePageMessage, safeAreasScript } from "../src/bridge-script";
import { parseInsets, safeAreaMode, type Insets, type SafeAreaMode } from "../src/safe-areas";

const server = "https://flowplan.example.com";
const none: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const phone: Insets = { top: 37, right: 0, bottom: 24, left: 0 };
const mode = (input: Partial<Parameters<typeof safeAreaMode>[0]>) =>
  safeAreaMode({ platform: "android", cover: true, measured: null, native: phone, keyboard: false, previous: "app", ...input });

test("iOS: the page keeps clear of the system bars whenever it draws edge to edge", () => {
  assert.equal(mode({ platform: "ios" }), "page");
  assert.equal(mode({ platform: "ios", measured: none }), "page");
  assert.equal(mode({ platform: "ios", cover: false }), "app");
});

test("Android: the app keeps its bars unless the web view reports them (#61)", () => {
  // Older web views report no safe areas: the app's bars, the page's insets zero.
  assert.equal(mode({ measured: none }), "app");
  // Chromium 136 and later report the system bars: the page gets them, the app draws none.
  assert.equal(mode({ measured: phone }), "page");
  assert.equal(mode({ measured: { top: 36.5, right: 0, bottom: 23, left: 0 } }), "page");
  // Only the notch, not the navigation bar: the app keeps its bars.
  assert.equal(mode({ measured: { top: 37, right: 0, bottom: 0, left: 0 } }), "app");
  // Much less than the bars take: the app.
  assert.equal(mode({ measured: { top: 10, right: 0, bottom: 10, left: 0 } }), "app");
  // Landscape with the navigation bar at the side.
  const landscape = { top: 24, right: 48, bottom: 0, left: 0 };
  assert.equal(mode({ native: landscape, measured: landscape }), "page");
  assert.equal(mode({ native: landscape, measured: { top: 24, right: 0, bottom: 0, left: 0 } }), "app");
  // A page that does not draw edge to edge (an older instance, a sign-in page elsewhere).
  assert.equal(mode({ cover: false, measured: phone }), "app");
  // No system bars at all (full screen): nothing to hand over.
  assert.equal(mode({ native: none, measured: none }), "app");
  // Other platforms never.
  assert.equal(mode({ platform: "web", measured: phone }), "app");
});

test("Android: the decision holds while the keyboard is open, the page loads or the window turns", () => {
  for (const previous of ["app", "page"] as SafeAreaMode[]) {
    // The keyboard changes what the web view reports; the app makes room for it either way.
    assert.equal(mode({ previous, keyboard: true, measured: none }), previous);
    assert.equal(mode({ previous, keyboard: true, measured: phone }), previous);
    // Not measured yet.
    assert.equal(mode({ previous, measured: null }), previous);
  }
  // Turning: the web view reports the new insets a little late – the page
  // keeps them while every bar is still reported…
  const landscape = { top: 24, right: 48, bottom: 0, left: 0 };
  assert.equal(mode({ previous: "page", native: landscape, measured: { top: 24, right: 20, bottom: 0, left: 0 } }), "page");
  // …and gives them back to the app when one is missing.
  assert.equal(mode({ previous: "page", native: landscape, measured: { top: 24, right: 0, bottom: 24, left: 0 } }), "app");
  assert.equal(mode({ previous: "page", measured: none }), "app");
});

test("the measured insets are checked", () => {
  assert.deepEqual(parseInsets({ top: 1, right: 2, bottom: 3, left: 4 }), { top: 1, right: 2, bottom: 3, left: 4 });
  assert.equal(parseInsets(null), null);
  assert.equal(parseInsets("x"), null);
  assert.equal(parseInsets({ top: 1, right: 2, bottom: 3 }), null);
  assert.equal(parseInsets({ top: -1, right: 0, bottom: 0, left: 0 }), null);
  assert.equal(parseInsets({ top: Number.NaN, right: 0, bottom: 0, left: 0 }), null);
  assert.equal(parseInsets({ top: "1", right: 0, bottom: 0, left: 0 }), null);
});

// The bridge in a minimal page: the attribute on <html>, sessionStorage and
// the probe's padding (what the web view reports as env(safe-area-inset-*)).
function runBridge(platform: "ios" | "android", options: { stored?: string; env?: Insets; readyState?: string; noRoot?: boolean } = {}) {
  const posted: Record<string, unknown>[] = [];
  const listeners = new Map<string, ((event: { detail: unknown }) => void)[]>();
  const attributes = new Map<string, string>();
  const storage = new Map<string, string>(options.stored ? [["flowplan-app-safe-areas", options.stored]] : []);
  const frames: (() => void)[] = [];
  const env = options.env || none;
  const appended: unknown[] = [];
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
    appendChild: (node: unknown) => appended.push(node),
  };
  const page: Record<string, unknown> = {
    location: { origin: server },
    ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
    addEventListener: (type: string, listener: (event: { detail: unknown }) => void) => listeners.set(type, [...(listeners.get(type) || []), listener]),
    dispatchEvent: (event: { type: string; detail: unknown }) => (listeners.get(event.type) || []).forEach((listener) => listener(event)),
    CustomEvent: class {
      constructor(
        public type: string,
        init: { detail: unknown },
        public detail = init.detail,
      ) {}
    },
    navigator: {},
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    document: {
      readyState: options.readyState || "complete",
      documentElement: options.noRoot ? null : root,
      head: { append() {} },
      body: null,
      createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
      querySelector: () => ({ content: "width=device-width, initial-scale=1, viewport-fit=cover" }),
      elementFromPoint: () => null,
    },
    getComputedStyle: (element: { style?: { cssText?: string } }) =>
      element?.style?.cssText?.includes("env(safe-area-inset-top")
        ? { paddingTop: `${env.top}px`, paddingRight: `${env.right}px`, paddingBottom: `${env.bottom}px`, paddingLeft: `${env.left}px` }
        : { backgroundColor: "rgb(255, 255, 255)" },
    matchMedia: () => ({ addEventListener() {} }),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    MutationObserver: class {
      observe() {}
    },
    innerWidth: 400,
    innerHeight: 800,
  };
  page.window = page;
  page.top = page;
  vm.runInNewContext(bridgeScript({ server, platform, version: "1.0.0" }), page);
  const report = () => {
    while (frames.length) frames.shift()!();
    return posted.filter((message) => message.type === "edges").at(-1);
  };
  const attach = () => ((page.document as Record<string, unknown>).documentElement = root);
  return { attributes, storage, report, appended, attach, run: (code: string) => vm.runInNewContext(code, page) };
}

test("Android bridge: reports the web view's safe areas and follows the app's decision", () => {
  const bridge = runBridge("android", { env: phone });
  // The app's bars until the app says otherwise: the page's insets stay zero.
  assert.equal(bridge.attributes.has("data-app-safe-areas"), false);
  const edges = bridge.report()!;
  assert.deepEqual(edges.insets, phone);
  assert.equal(edges.safeAreas, "app");
  assert.equal(edges.cover, true);
  assert.equal(safeAreaMode({ platform: "android", cover: true, measured: parseInsets(edges.insets), native: phone, keyboard: false, previous: "app" }), "page");
  // The probe hangs at <html> (the body's children are watched).
  assert.equal(bridge.appended.length, 1);
  const message = parsePageMessage(JSON.stringify(edges));
  assert.equal(message?.type, "edges");
  // The app hands the safe areas to the page…
  bridge.run(safeAreasScript("page"));
  assert.equal(bridge.attributes.get("data-app-safe-areas"), "page");
  assert.equal(bridge.storage.get("flowplan-app-safe-areas"), "page");
  // …and takes them back.
  bridge.run(safeAreasScript("app"));
  assert.equal(bridge.attributes.has("data-app-safe-areas"), false);
  assert.equal(bridge.storage.get("flowplan-app-safe-areas"), "app");
  // The next page of this web view starts the way the app shows it.
  const next = runBridge("android", { env: phone, stored: "page" });
  assert.equal(next.attributes.get("data-app-safe-areas"), "page");
  assert.equal(next.report()!.safeAreas, "page");
  // Before the page's content the document may have no <html> yet: the
  // attribute follows with the next report (the app says nothing new then).
  const early = runBridge("android", { env: phone, stored: "page", noRoot: true });
  assert.equal(early.attributes.has("data-app-safe-areas"), false);
  early.attach();
  assert.equal(early.report()!.safeAreas, "page");
  assert.equal(early.attributes.get("data-app-safe-areas"), "page");
  // While the page loads its viewport is not known yet: nothing measured.
  const loading = runBridge("android", { env: phone, readyState: "loading" });
  assert.equal(loading.report()!.insets, null);
});

test("iOS bridge: unchanged – no measuring, no attribute", () => {
  const bridge = runBridge("ios", { env: phone, stored: "page" });
  const edges = bridge.report()!;
  assert.equal("insets" in edges, false);
  assert.equal("safeAreas" in edges, false);
  assert.equal(bridge.attributes.size, 0);
  assert.doesNotMatch(bridgeScript({ server, platform: "ios", version: "1" }), /safe-areas/);
  assert.match(bridgeScript({ server, platform: "android", version: "1" }), /data-app-safe-areas/);
  assert.equal(safeAreasScript("page"), 'window.dispatchEvent(new CustomEvent("flowplan:safe-areas", { detail: "page" })); true;');
  assert.match(safeAreasScript("x" as "app"), /detail: "app"/);
});
