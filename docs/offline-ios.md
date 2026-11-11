# Offline use on iPhone and iPad

**Decision:** the app keeps the instance's offline copy itself (files in its container) and, without a connection, loads the stored app page with `loadHTMLString(_:baseURL:)` at the instance's address (react-native-webview's `source={{ html, baseUrl }}`). A script injected at document start (the bridge) runs the page's own scripts and style sheets from the copy. The web app's offline logic runs unchanged on top of a storage adapter: `window.FlowplanApp.offline` instead of Cache Storage.

## The problem

Flowplan's offline mode (components/offline.ts, public/sw.js, lib/offline-*.ts in Flowplan) needs a service worker: it stores the app's files (every file of the build, #47), the app page `/`, the workspace, pages, records and files in Cache Storage and answers requests from there when the network fails. Documents (Yjs) live in IndexedDB, record changes made offline in localStorage; both are synced and merged by the page when the connection is back.

WKWebView runs service workers only for **App-Bound Domains** (`WKAppBoundDomains` in Info.plist, at most 10, fixed at build time). Flowplan is self-hosted at any address, and app-bound mode would also stop script injection (the bridge) on other domains. So the service worker is not an option on iOS. Android's WebView, Safari and desktop browsers run it; nothing changes there.

## Options considered

| | Origin kept (cookies, IndexedDB, localStorage) | Any instance | Subresources offline | Verdict |
| --- | --- | --- | --- | --- |
| **(a)** Serve the copy from a custom scheme (`WKURLSchemeHandler`, `flowplan-offline://`) | no – another origin: no session cookie, a separate IndexedDB without the documents written online, same-origin API calls fail | yes | yes | no |
| **(b)** Load the stored page with the instance as base URL, load its scripts and data through JavaScript shims from the app | **yes** | **yes** | through the shims | **chosen** |
| **(c)** Local HTTP server on the loopback | no – `http://127.0.0.1:port` is another origin, not a secure context | yes | yes | no |
| **(d)** `loadSimulatedRequest(_:response:responseData:)` (iOS 15) | yes – like (b), with real response headers | yes | no – only the main frame; subresources still go to the network, `WKURLSchemeHandler` cannot take `https` | as good as (b) for the document, not reachable from react-native-webview |

`loadSimulatedRequest` would be the cleaner way to answer the document (real headers, the request URL in the history). It does nothing for subresources, so it needs the same shims as (b), and react-native-webview does not expose it – the app would have to patch or fork the web view, or find the `WKWebView` in the view hierarchy from a native module. `loadHTMLString(_:baseURL:)` gives the same origin and is a supported prop. What `loadSimulatedRequest` would add – the response's Content-Security-Policy header – the copy carries as a `<meta>` (below). If react-native-webview gains it, `src/offline/copy.ts` can hand the headers over unchanged.

Other iOS 17+ APIs do not change the picture: `WKWebsiteDataStore(forIdentifier:)` separates data stores (it would split the session and IndexedDB from the online page); `WKContentWorld` isolates scripts but cannot answer requests; the HTTP cache of the web view keeps the build's immutable files for a while but can be evicted at any time and never holds files not opened yet.

## How it works

### Storing (online)

- The web app talks to an **offline store** (lib/offline-store.ts in Flowplan): Cache Storage in a browser, `window.FlowplanApp.offline` in this app (src/offline/loader.ts). Both hold the same caches under the same names and keys: `flowplan-settings` (the marker: who, since when, last refresh, build), `flowplan-data-v1` (`/`, `/api/bootstrap`, `/api/pages/…`, `/api/files/…`) and `flowplan-static-<build>` (every file of the build, plus `/fonts.css`, `/fonts/*.woff2` and `/icons/*`, which `/api/offline/assets` now lists).
- `refreshOffline` (components/offline.ts) is unchanged apart from the adapter: it asks the instance what changed (`/api/offline/changes`), stores pages, records, files and the app's files, and writes the marker. Settings → Offline & devices shows state, size, version and last refresh from the marker, with **Update now**, records and files, and **Remove offline copies**.
- What the service worker does for requests, lib/offline-app.ts does in the page when the app offers its store: GET requests the copy holds go to the network first; pages, records and files that arrive are kept; when the network fails, the copy answers; pictures (`<img>`) that fail are shown from the copy.
- Every call is a message to the app (`{ type: "offline", id, op, … }`), answered with an injected event. The app checks it again (src/offline/policy.ts) and keeps it in files (src/offline/store.ts, modules/flowplan-native/ios/FlowplanOfflineFiles.swift).

### Opening (offline)

When the web view cannot reach the instance (`onError`), the network is down at start (`expo-network`, which uses `NWPathMonitor` on iOS), or the instance's health check does not answer within 6 seconds while "Connecting to …" shows (a network that cannot reach the instance often makes the connection hang instead of fail, #203; src/connecting.ts), Shell.tsx builds the stored page (src/offline/document.ts):

- the stored `/` – never the sign-in page – with the instance's `Content-Security-Policy` as a `<meta>` first in `<head>` (`frame-ancestors`, `sandbox` and reporting are not allowed there; `blob:` is added to `script-src`, which `'strict-dynamic'` allows anyway);
- every tag React rendered stays (it hydrates against them), without the address it would load: `src` → `data-flowplan-src`, `href` → `data-flowplan-href`;
- the style sheets follow their inert `<link>` inline, their fonts and pictures as `data:` addresses (`font-src` allows `data:`).

The bridge's loader (src/offline/loader.ts) runs the placeholders as `blob:` scripts whose `src` – attribute and property – still reads as the original path: Turbopack identifies a chunk by `document.currentScript.getAttribute("src")`, Next.js finds its asset prefix by `document.currentScript.src`. Scripts and style sheets the page adds later (parts of the app opened offline) are taken from the copy before they are inserted; preloads count as loaded when the copy has the file (React waits for a style sheet's preload). In a page loaded **online** whose connection went, an app file that fails to load is taken from the copy too (the error never reaches the page unless the copy lacks the file).

The page then is the instance's own app at the instance's origin: its session cookie, the documents in IndexedDB and the queued record changes in localStorage are the ones it had online. It shows the offline banner (`navigator.onLine`, or the copy of a server that does not answer). Edits are queued and merged exactly as in the browser.

### Back online

When the network is back and `/api/health` answers, the app tells the page (an `online` event; the page sends its queued changes and documents) and loads the live page once nobody is typing.

### Keeping it current

While the page is open, as in the browser (start, back online, every 6 hours), plus every time the app comes to the foreground (the event `flowplan:offline-refresh`). The background task (expo-background-task) asks as well; iOS may not let the web view run then, in which case the next foreground does it.

## Security

- **Origin:** only messages from the instance's page are answered (Shell.tsx checks the origin of every message; a page the app loaded itself may report `about:blank` on some WebKit versions and is accepted only while the copy is showing). The copy is per profile, and a profile is one instance.
- **What is kept:** only the copy's caches and, per cache, its kinds of keys (no sign-in, export, token or API at large); a 200 only; at most 25 MB per answer and 2 GB per profile, 300 MB of the disk always left free; headers from a short list – never `Set-Cookie`. `Cache-Control: no-store` is respected except for the app page and the data endpoints the copy is made of (the instance marks every API answer `no-store`; these are the ones offline use is for). The marker must name a person.
- **Files:** Application Support/FlowplanOffline/<profile>/<cache>/, bodies named by the SHA-256 of their key, written atomically with `completeUntilFirstUserAuthentication` protection, excluded from backups. Swift checks every path again (at most four components of `[A-Za-z0-9._-]`, none starting with a dot).
- **Wiping:** **Sign out** in Flowplan removes the copy (the web app's `disableOffline`, as in the browser); **Sign out and remove the profile** in the app removes the profile's folder; folders of profiles that no longer exist go at the next start. Another person signing in on the same profile drops the copy (the marker's owner, as in the browser).
- **Policy:** the stored page keeps the instance's Content-Security-Policy (nonce and `'strict-dynamic'`); only scripts the page itself creates run from `blob:`. Style sheets from the copy are inline (`'unsafe-inline'` is already allowed for styles).

## Limits

- Web workers from the copy are not supported (`new Worker('/_next/static/…')`): the PDF viewer and OCR need a connection in the app.
- Answers over 25 MB are not stored (large files).
- The stored page starts with `navigator.onLine === false`; React reports a recoverable hydration mismatch (#418) and renders the page anew – visible only in the console.
- A server older than this offline support offers no store adapter: the app shows its own offline screen as before.

## Verified

- Unit tests: policy, store (restart, interrupted writes, profiles, wiping, room), document builder, the page's calls, Swift wiring (`test/offline-*.test.ts`); in Flowplan the store adapter, the page's fetch and picture fallback against `public/sw.js`, the asset list (`tests/offline-app.test.ts`, `tests/offline-assets.test.ts`).
- `npm run check:offline` (FLOWPLAN_DIR: a Flowplan checkout after `npm run build`): Chromium with the bridge, the copy in files and the stored page loaded at the instance's address without a network – switching on, every file stored, a page loaded online losing the network, then the stored page: document, database, record, calendar, dashboard, offline banner, text typed offline and synced, switching off.

## To verify on a device

- `loadHTMLString(_:baseURL:)` with an `https` base: `isSecureContext`, IndexedDB and localStorage of the instance's origin (documents written online open offline), and the message URL react-native-webview reports (`frameInfo.request.URL`).
- `blob:` scripts with the instance's CSP from a `<meta>` in WKWebView; Turbopack and Next.js reading the overridden `src`.
- The Swift file functions (built without a compiler here): protection class and backup exclusion in the container (e.g. `xattr`/`FileManager` attributes in a debug build).
- Background refresh: whether iOS runs the web view during the background task.
- Memory with a large copy: answers pass the bridge as base64 (a few MB per script).
