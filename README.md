<div align="center">

<img src="store/icons/google-play-512.png" width="84" height="84" alt="Flowplan logo">

# Flowplan for iPhone, iPad and Android

**Flowplan as a native app for iOS and Android.**

[Flowplan](https://github.com/yannicschuller/flowplan) · [Flowplan Desktop](https://github.com/yannicschuller/flowplan-desktop) · [Documentation](https://docs.flowplan.org/offline-and-apps)

<img src="store/preview/flowplan-en.gif" width="280" alt="Flowplan on an iPhone: home, roadmap board, a document, a whiteboard and the journal">

</div>

A slim native shell around a Flowplan instance, the mobile counterpart of [Flowplan Desktop](https://github.com/yannicschuller/flowplan-desktop). All data stays on the server. The app:

- remembers the address of the instance;
- opens links to other sites in the system browser;
- shows its own page without a connection;
- signs in with passkeys and SSO through the system's sign-in sheet;
- paints the system bars in the page's colours.

Flowplan itself, and every new feature, arrives with the server and needs no app update.

## How it works

The app is built with [Capacitor](https://capacitorjs.com) 8: an Xcode project (`ios/`) and a Gradle project (`android/`) around a system web view (WKWebView, Android System WebView). The app's own pages live in [`www/`](www): first-start setup and the offline page, in German, English and French. The native shell is one plugin per platform:

- iOS: [`FlowplanShellPlugin.swift`](ios/App/App/FlowplanShellPlugin.swift) and [`ShellViewController.swift`](ios/App/App/ShellViewController.swift)
- Android: [`FlowplanShellPlugin.java`](android/app/src/main/java/app/flowplan/mobile/FlowplanShellPlugin.java) and [`SystemBarColors.java`](android/app/src/main/java/app/flowplan/mobile/SystemBarColors.java)

| | |
| --- | --- |
| **First start** | Asks for the instance and suggests `https://app.flowplan.org`. Managed installations can suggest their own address: iOS Managed App Configuration or Android app restrictions, key `server`. The app accepts only a real Flowplan: `/api/health` must answer `"service": "flowplan"`, and the address must not redirect to another site ([`www/server.js`](www/server.js), tested in [`test/`](test)). HTTPS only; plain HTTP only for `localhost` and `10.0.2.2`, the development machine as seen from the Android emulator. |
| **Changing the server** | Long-press the app icon → **Change server** (iOS quick action, Android app shortcut), or the button on the offline page. |
| **Links** | Pages of the instance stay in the app. Other sites, `mailto:` and `tel:` links open in the system. Embedded content (videos, maps) stays in the page. |
| **Offline** | When the instance cannot be reached, the app shows its own page and reconnects by itself when the connection is back. On Android the web app's service worker also works offline. WKWebView only allows service workers for a fixed list of domains ("App-Bound Domains"), which a self-hosted instance cannot be on, so iOS shows the offline page instead. |
| **Passkeys and SSO** | The same hand-off as the desktop app, see below. |
| **Native feel** | <ul><li>The page sits between status bar and home indicator / navigation bar. Those areas take the colours the page has at its top and bottom edge (sampled from the rendered page) and keep their icons readable.</li><li>Dark mode follows the system.</li><li>Swipe back on iOS, the back button on Android.</li><li>No zooming into form fields and no "previous/next/done" bar above the keyboard on iOS.</li><li>Splash screen and icons from the Flowplan logo.</li></ul> |
| **Sharing into Flowplan** | Android: text and links shared from other apps open the instance's share target (`/share-target`). |
| **Languages** | German, English and French (setup and offline pages, native texts, permission prompts). |

### Signing in with passkeys and SSO

Passkeys and identity providers that need one do not work inside an app's web view, so the app uses the browser hand-off of the desktop app (server: `lib/desktop-sign-in.ts`, `/api/auth/desktop`):

1. The instance recognises the app by `FlowplanMobile/<version>` in the user agent. It then links **Mit Passkey anmelden** / **Mit SSO anmelden** to `/api/auth/desktop`. Detection was added in Flowplan after 0.3.4; older instances still offer e-mail and password.
2. The app catches that navigation, keeps a random verifier and opens `/api/auth/desktop?challenge=<SHA-256 of the verifier>` in the system's sign-in sheet: **ASWebAuthenticationSession** on iOS, a **Custom Tab** on Android.
3. You sign in as usual (passkey, password manager, SSO) and confirm. The page hands `flowplan://sign-in?server=…&challenge=…&code=…` back.
4. The app checks the instance and its own challenge, then redeems the one-time code with its verifier from the instance's page (`/api/auth/desktop-redeem`). The session cookie lands in the app's web view.

The code is valid for one minute, works once and only together with the verifier that never leaves the app. Codes for another instance or for a sign-in the app did not start are refused.

### Push notifications

Not yet. Flowplan sends Web Push, and neither WKWebView nor Android's WebView supports the Push API inside an app. Native push needs server work:

- **iOS (APNs):**
  - an APNs auth key (`.p8`, key ID, team ID) on the server;
  - the *Push Notifications* capability and an `aps-environment` entitlement in the app;
  - `@capacitor/push-notifications` to register the device token.
- **Android (FCM):**
  - a Firebase project with `google-services.json` in `android/app/` (the Gradle file already applies the plugin when it exists);
  - a service account on the server for the FCM HTTP v1 API.
- **Server:**
  - an endpoint that stores device tokens per user and session;
  - a second delivery path next to Web Push in the notification sender;
  - removal of tokens on sign-out.

Until then the in-app inbox and e-mail notifications work as usual.

### Ideas for later

- **iOS share extension:**
  - a Share Extension target with an App Group;
  - hands text, links and images to the instance's share target (`/share-target`, files through the upload API);
  - the extension needs the stored server and a token, because the session cookie lives only in the app's web view.
- **Universal links / App Links** for `https://app.flowplan.org/...`: needs `apple-app-site-association` and `assetlinks.json` on the server. Self-hosted instances would need their own.
- **Widgets:** today's journal entry, my tasks.
- **Downloads:** exports that the web app offers as file downloads to the share sheet.
- **Push**, see above.

## Development

Node.js 22 or newer, Xcode 16 or newer (iOS 15+), Android Studio / JDK 21 and the Android SDK (API 36).

```sh
npm ci
npm test                 # setup logic (address check, languages)
npx cap sync             # copies www/ into both native projects
npm run ios              # opens Xcode, run on a simulator or device
npm run android          # opens Android Studio
```

Against a local Flowplan, start the dev server and enter its address on first start:

- iOS simulator: `http://localhost:3000`
- Android emulator: `http://10.0.2.2:3000`

Debug builds can be inspected with Safari's Web Inspector (iOS) and `chrome://inspect` (Android).

Command-line builds without signing:

```sh
npm run build:ios        # simulator app in ios/build
npm run build:android    # debug APK in android/app/build/outputs/apk/debug
```

Icons and splash screens are generated from [`resources/`](resources) (the Flowplan logo) with `npm run icons`.

### Versioning

The version lives in `package.json`. [`scripts/version.mjs`](scripts/version.mjs) writes it into both projects: iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`, Android `versionName` / `versionCode`. `npm version` runs it automatically.

The build number is `((major·100 + minor)·100 + patch)·100 + build`, so 1.2.3 becomes 1020300. `FLOWPLAN_BUILD` (0–99) counts further uploads of the same version.

## Signing

Without secrets every workflow builds **unsigned**:

- iOS: an unsigned `.ipa` / `.xcarchive` and a simulator app;
- Android: an unsigned APK and AAB.

With the secrets below (Settings → Secrets and variables → Actions), release builds are signed and can go to the stores.

### iOS (App Store Connect)

| Name | Kind | What |
| --- | --- | --- |
| `IOS_TEAM_ID` | variable | Apple Developer team ID (10 characters, developer.apple.com → Membership) |
| `APP_STORE_CONNECT_API_KEY_ID` | secret | Key ID of an App Store Connect API key (Users and Access → Integrations → App Store Connect API, role *App Manager* or *Admin*) |
| `APP_STORE_CONNECT_API_ISSUER_ID` | secret | Issuer ID shown above the keys |
| `APP_STORE_CONNECT_API_KEY` | secret | The `.p8` file, as text or base64 |
| `IOS_DISTRIBUTION_CERTIFICATE` | secret, optional | *Apple Distribution* certificate as `.p12`, base64 (`base64 -i cert.p12 \| pbcopy`) |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | secret, optional | Its password |
| `IOS_PROVISIONING_PROFILE` | secret, optional | App Store provisioning profile for `app.flowplan.mobile`, base64 |
| `IOS_PROVISIONING_PROFILE_NAME` | variable, optional | The profile's name (default `Flowplan App Store`) |

With only the API key (role *Admin*), Xcode signs with cloud-managed certificates and creates the profile itself. With certificate and profile, the build signs manually with those.

### Android (Google Play)

| Name | What |
| --- | --- |
| `ANDROID_KEYSTORE` | Upload keystore (`.jks`), base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Alias of the upload key |
| `ANDROID_KEY_PASSWORD` | Key password (if different from the keystore password) |
| `PLAY_SERVICE_ACCOUNT_JSON` | JSON key of a Google Cloud service account that was invited in Play Console (Users and permissions) with release rights for the app |

Create the upload key once:

```sh
keytool -genkeypair -v -keystore flowplan-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Play App Signing keeps the actual signing key at Google. Keep the upload keystore and its passwords safe (password manager); if it is lost, Play support can reset the upload key.

## Releasing

**Actions → Release → Run workflow** ([`release.yml`](.github/workflows/release.yml)):

1. raises the version (patch, minor or major), commits it on `main` and tags `v1.2.3`;
2. builds iOS on `macos-latest` and Android on the self-hosted runner;
3. with secrets and **upload** checked:
   - iOS goes to **TestFlight** (`fastlane ios beta`);
   - Android goes to Play's **internal testing** track (`fastlane android internal`);
4. attaches the builds to a GitHub release and publishes it.

If a build fails, run the workflow again with **rebuild** set to the version (e.g. `1.0.1`) and **build** raised (1, 2, …). Stores refuse a build number they have seen.

Promoting a build to the public is done in App Store Connect and Play Console. Texts and screenshots go up separately with `bundle exec fastlane ios metadata` and `bundle exec fastlane android metadata`, using the same secrets as environment variables.

CI ([`ci.yml`](.github/workflows/ci.yml)) checks every push: tests, an Android build (debug APK, unsigned release APK and AAB) and an unsigned iOS build. The builds are kept as artifacts for 14 days. Jobs of this repository run on the self-hosted runner and iOS on `macos-latest`; Dependabot and pull requests from forks use GitHub's runners.

## Store material

Everything for the store listings is in [`store/`](store), in the layout fastlane reads. See [`store/README.md`](store/README.md):

- texts in German and English;
- screenshots for every required device;
- the feature graphic, icons and preview video;
- privacy answers and the submission checklist.

The screenshots and the video are made from the real Flowplan UI with Playwright against a local test server:

```sh
npm run screenshots -- --locale de     # needs a fresh Flowplan dev server, see the script
npm run store:images                   # device frames and captions
npm run preview -- --locale de         # App Store preview video and GIF
```

## Why Capacitor

- **The product is the web app.** Flowplan already runs as a PWA with an editor, whiteboards and offline data. A native shell keeps one code base; new features need no app update.
- **Real native projects.** Capacitor generates an Xcode and a Gradle project that stay in the repository and can be changed freely: the sign-in hand-off, edge colours and share target are plain Swift and Java. Fastlane, TestFlight and Play work as with any native app.
- **Small and current.** No second UI framework, no JavaScript bundle in the app, the system web view of the device. React Native or Flutter would mean rewriting the UI. Pure WKWebView/WebView apps would mean writing the plumbing twice: splash, assets, plugins, CLI.
- **Not a TWA:** a Trusted Web Activity would need Digital Asset Links on every instance and is Android-only. Tauri's mobile support is still young.

The trade-off is the system web view: WKWebView on iOS (no service workers for arbitrary domains, see Offline) and Android System WebView, which is kept current through Play.

## License

[GNU Affero General Public License v3.0](LICENSE), like Flowplan.
