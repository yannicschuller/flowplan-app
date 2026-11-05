# Store material

Everything for the App Store and Google Play listings, in German (`de-DE`), English (`en-US`) and French (`fr-FR`). The folders follow the layout fastlane reads:

- `app-store/` for `deliver` (`fastlane ios metadata`);
- `google-play/` for `supply` (`fastlane android metadata`).

So texts and images can be uploaded with one command or copied into App Store Connect and Play Console by hand.

| What | Where |
| --- | --- |
| App name, subtitle, description, keywords, promotional text, release notes | `app-store/<locale>/*.txt` |
| Support, marketing and privacy URLs | `app-store/<locale>/{support,marketing,privacy}_url.txt` |
| Categories, copyright, age rating | `app-store/{primary,secondary}_category.txt`, `copyright.txt`, `app_rating_config.json` |
| Notes and name for App Review | `app-store/review_information/` (demo account and contact: environment, see below) |
| iPhone 6.9" (1320×2868), iPhone 6.5" (1284×2778), iPad 13" (2064×2752) | `app-store/screenshots/<locale>/NN-name-<device>.png` (8 each, see [Screenshots](#screenshots)) |
| Product page header 3840×1646 (21:9) and search results image 3840×2560 (3:2), iOS 27 | `app-store/creative/<locale>/{header,search-results}.png` (see [Creative assets](#creative-assets)) |
| App preview video, 886×1920, about 23 s, 30 fps, H.264 with a silent AAC track | `app-store/preview/<locale>/flowplan-preview-iphone.mp4` (see [Preview video](#preview-video)) |
| Play title, short and full description, release notes | `google-play/<locale>/*.txt`, `changelogs/<versionCode>.txt` |
| Phone (1080×1920), 7" tablet (1200×1920), 10" tablet (1600×2560) | `google-play/<locale>/images/{phone,sevenInch,tenInch}Screenshots/N.png` |
| Feature graphic 1024×500, icon 512×512 | `google-play/<locale>/images/featureGraphic.png`, `icon.png` |
| App icon 1024×1024 (App Store, no transparency) and 512×512 (Play) | `icons/` |
| Preview GIFs (README, website) | `preview/flowplan-{de,en,fr}.gif` |

All icon sizes inside the apps are generated with `npm run icons`: the iOS asset catalog and the Android mipmaps, including adaptive icons and splash screens. Screenshots, video and GIFs are generated too (below and the main README).

`npm test` (part of `npm run check`) checks the listing: App Store and Play limits for every language (name and subtitle 30 characters, keywords 100 bytes without spaces after commas, promotional text 170, descriptions 4000, Play short description 80, changelogs 500), no other apps' names, and every screenshot's size, PNG without alpha and count ([`test/store.test.ts`](../test/store.test.ts)).

## Screenshots

Eight frames per device and language, the same order everywhere: a headline of a few words (Instrument Serif, ending in Flowplan's orange dot) and one line below it on the warm paper background, with the screen in a device frame.

| Frame | Shows |
| --- | --- |
| `01-home` | Start page: greeting, recently edited pages |
| `02-widgets` | Home screen with the widgets (tasks to check off, today, time this week with a running timer, journal and habits, quick capture; on iPad also counter and favorites) and the timer as Live Activity |
| `03-board` | The projects database as board |
| `04-document` | A kick-off document with a callout, tasks with mentions and a table |
| `05-plan` | Phones: the journal (streaks, "On this day"); wide screens: the projects as timeline |
| `06-inbox` | Inbox with mentions, a comment and an assigned task |
| `07-whiteboard` | Whiteboard with notes, a flow and a mind map |
| `08-profiles` | App settings: two profiles (app.flowplan.org and a self-hosted instance), app lock, Live Activities |

The app's screens are the real Flowplan web app (its demo workspace, in the listing's language, plus a few made-up pages, people and notifications – no real persons or companies). The widgets and the settings are native and cannot be driven by Playwright; [`scripts/store-mockups.mjs`](../scripts/store-mockups.mjs) draws them after `plugins/widget-suite/ios/SuiteViews.swift` (with the widget gallery's sample data and texts) and `src/screens/Settings.tsx`.

To make them again, with the Flowplan repository next to this one and its dependencies installed:

```sh
npm run screenshots          # starts a Flowplan dev server per language, writes store/.cache/raw/
npm run store:images         # frames, captions, PNG for both stores and the feature graphic
npm run store:images -- --contact /tmp/review   # also contact-<locale>.png, all frames side by side
npm test                     # sizes, alpha, counts
```

`npm run screenshots -- --locales fr --only iphone-69,ipad-13 --shots 02-widgets` redoes a part (then run `store:images` again). Captions are in `scripts/store-images.mjs` (`CAPTIONS`), the made-up content in `scripts/screenshots.mjs` (`seed`). Dates on the screens are relative to the day they are made. `CHROMIUM_PATH` (or `--chromium`) points Playwright to another Chromium. The PNGs are written with a 256-colour palette (sharp), about 150–250 KB each.

## Preview video

One App Store preview per language (`app-store/preview/<locale>/flowplan-preview-iphone.mp4`), in the style of the screenshots: for each scene a short card with the screenshot's headline, then the real screen in motion – start page, widgets (a task and a habit checked off, the timer running), projects board, the kick-off document, whiteboard, switching profiles – joined by cross-fades, ending on the app icon. 886×1920 (the size for 6.9″ and 6.5″ iPhones), 30 fps, H.264 with a silent AAC track, about 23 s (Apple: 15–30 s), about 3 MB.

```sh
npm run preview                                  # all languages; needs ffmpeg and ../flowplan
npm run preview -- --locales fr --stills /tmp/review   # one language, a few frames to look at
```

It also writes `preview/flowplan-<de|en|fr>.gif`. fastlane does not upload videos: in App Store Connect, open the version, choose the language and drag the file into *App Previews* for the 6.9″ iPhone (it is used for 6.5″ too). The same file can go to YouTube for Google Play's promo video (`google-play/<locale>/video.txt`).

## Creative assets

Since iOS 27 and iPadOS 27 (App Store Connect since 5 October 2026) a product page can have a **header** and its own **search results** image – in App Store Connect the version's tab *Header and Search Results* (German: *Kopfzeile und Suchergebnisse*), and the new *Asset Library* where all images and videos of the app live. Both are optional; without a search results image the App Store shows the screenshots there as before.

| File | Placement | Size | Shows |
| --- | --- | --- | --- |
| `app-store/creative/<locale>/header.png` | Product page header | 3840×1646 (21:9) | A line in Instrument Serif in the middle, the iPad with the projects board on the left, iPhones with the start page and a document on the right |
| `app-store/creative/<locale>/search-results.png` | Search results | 3840×2560 (3:2) | Icon and name, the line "Notes, tasks and projects in one app.", the iPad with the board between iPhones with the start page and the widgets |

Apple's rules (App Store Connect Help → *Creative assets specifications*, developer.apple.com → *App Store asset best practices*):

- Header: 21:9 at exactly 3840×1646, JPEG or PNG – or a "universal" 16:9 PNG at 5244×2950 that can serve both placements. Search results: 3:2 from 1920×1280 to 3840×2560, JPEG or PNG. **No alpha channel or transparency.** Videos are possible too (5–30 s, 30/60 fps, muted, looping); there are none yet.
- One file per language, no light/dark variants. Assets must suit a 4+ rating and follow guideline 2.3: no prices, URLs, awards, other platforms' logos or Apple badges; text short and localized.
- The iPhone in portrait shows only a centred part (Apple's templates; about 1646×661 of the header and 2168×1030 of the search image). The line and the main device stay in there; the devices at the sides are only seen on iPad and in landscape. `npm run store:creative -- --guides /tmp/review` writes copies with that area drawn in.

```sh
npm run store:images         # first: the creative assets are cut from the finished screenshots
npm run store:creative       # header.png and search-results.png per language
npm test                     # sizes, 3:2, no alpha
```

The lines are in `scripts/creative-assets.mjs` (`TEXT`); a line that is too long is set smaller until it fits.

**Upload.** `fastlane ios creative`, or **Actions → iOS setup** with *creative* on (after the listing, before a submit). It uses the App Store Connect API's Asset Library (API 4.5.1; fastlane 2.241 has no action for it): it reads the specifications and placement groups from `appAssetLibraryRefData`, uploads each image once (category *Creative assets*, named `Flowplan <asset> <locale> <hash>`), waits for processing and places it as `PRODUCT_PAGE_HEADER_ASSET` / `APP_STORE_SEARCH_RESULTS_ASSET` on the language of the version in preparation, in every placement group (iPhone, iPad) the file fits. Running it again keeps what is already placed; a changed file replaces the placement, the old image stays in the Asset Library. The assets go to App Review with the version. If a placement cannot be made (the version is already in review or approved), the run names the image and ends red with the step below.

**By hand** (App Store Connect; German labels where known, Apple's English ones from its help in brackets), for each language:

1. *Apps* → Flowplan → in the sidebar the iOS version in preparation.
2. Top right, choose the language (*Deutsch*, *Englisch (USA)*, *Französisch*).
3. Under the product page information the tab **Kopfzeile und Suchergebnisse** (*Header and Search Results*) → **Kopfzeile** (*Header*): drag `app-store/creative/<locale>/header.png` into the field – or, if the run already uploaded it, *Browse Assets* and choose `Flowplan header <locale> …` → Save.
4. **Suchergebnisse** (*Search Results*): the same with `search-results.png`. Leave *Use header asset in search results* off – it only works with a universal 16:9 asset.
5. *Preview* shows both on iPhone and iPad, in both orientations; check that the line is not cut off.
6. Submit the version as usual. Approved assets can later be swapped on the live version without a new version: same tab → *Browse Assets* → choose → *Next* → *Publish*. Or upload and submit them on their own: sidebar *Asset Library* → **+** → *Upload Creative Assets*, then *Edit* → select → *Add for Review*.

## One-click setup

**Actions → iOS setup → Run workflow** ([`ios-setup.yml`](../.github/workflows/ios-setup.yml), `fastlane ios setup`) does on GitHub's macOS runner everything the App Store Connect API key allows. Re-running it is safe: what exists is kept.

1. Registers the App IDs `app.flowplan.mobile` (*App Groups*, *Push Notifications*), `app.flowplan.mobile.widgets`, `app.flowplan.mobile.share` and `app.flowplan.mobile.notifications` (*App Groups*). The app uses no Associated Domains, iCloud or Sign in with Apple.
2. Creates or reuses the *Apple Distribution* certificate and the App Store profiles of all App IDs with **fastlane match**. They are stored encrypted in the private repository `yannicschuller/flowplan-certificates`. Only this workflow writes there; builds (`build.yml`, `release.yml`) read them when the match secrets exist. If a profile lacks the App Group or push, the setup renews it once.
3. Checks that the app exists in App Store Connect.
4. Uploads texts, categories, copyright, age rating, review information and screenshots for iPhone 6.9″, iPhone 6.5″ and iPad 13″, for the version in `package.json`. It does **not** submit for review unless *submit* is on.
5. With *creative* on: the product page header and search results image of every language ([Creative assets](#creative-assets)).

The API cannot create the app record or register the App Group. When one of them is missing, the run does everything else and then ends red, with the exact values in the log and on the run's summary page. Do the step in the browser and run it again.

### Secrets and variables

Settings → Secrets and variables → Actions:

| Name | Kind | Where to find it |
| --- | --- | --- |
| `IOS_TEAM_ID` | variable | developer.apple.com → Account → Membership details → *Team ID* |
| `APP_STORE_CONNECT_API_KEY_ID` | secret | App Store Connect → Users and Access → Integrations → App Store Connect API → *Team Keys* → **+**, name e.g. "GitHub Actions", access **Admin** → column *Key ID*. Admin is needed for certificates, identifiers and profiles. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | secret | Same page, *Issuer ID* above the list |
| `APP_STORE_CONNECT_API_KEY` | secret | Content of the downloaded `AuthKey_<KeyID>.p8`, as text. It can be downloaded only once. |
| `MATCH_PASSWORD` | secret | A new random password (`openssl rand -base64 32`); also keep it in the password manager. It encrypts the certificates repository. |
| `MATCH_GIT_BASIC_AUTHORIZATION` | secret | `printf 'yannicschuller:<token>' \| base64` (see below) |
| `DEMO_USER`, `DEMO_PASSWORD`, `REVIEW_EMAIL`, `REVIEW_PHONE` | secrets | App Review's demo account and contact (below) |
| `MATCH_GIT_URL` | variable, optional | Only if the certificates live elsewhere (default `https://github.com/yannicschuller/flowplan-certificates.git`) |

**Certificates repository.** Create it at github.com/new: owner `yannicschuller`, name `flowplan-certificates`, **Private**, empty. match writes `certs/` and `profiles/` there, encrypted with `MATCH_PASSWORD`.

**Access to it** is a token sent over HTTPS, not a deploy key. This needs one secret and no SSH set-up on the Mac. Create a fine-grained personal access token (GitHub → Settings → Developer settings → Fine-grained tokens):

- resource owner `yannicschuller`;
- *Only select repositories*: `flowplan-certificates`;
- *Repository permissions → Contents*: **Read and write**.

Store `printf 'yannicschuller:github_pat_…' | base64` as `MATCH_GIT_BASIC_AUTHORIZATION`. Renew the token before it expires; builds stop signing with match without it.

**Fallback.** Without the two match secrets, builds still sign as before: with `IOS_DISTRIBUTION_CERTIFICATE` and the profile secrets if set, otherwise with Xcode's cloud signing (main README → Signing).

### Run

Actions → **iOS setup** → Run workflow, from `main`, with the default inputs. The first run usually ends with the two browser steps below; after them, run it again until it is green.

| Input | Default | What |
| --- | --- | --- |
| `identifiers` | on | App IDs and capabilities |
| `signing` | on | Certificate and profiles (match) |
| `force_profiles` | off | Renew the profiles anyway, e.g. after a capability changed |
| `listing` | on | Texts, age rating, review information |
| `screenshots` | on | … and the screenshots; replaces those in App Store Connect |
| `creative` | off | Product page header and search results image onto the version (iOS 27) |
| `submit` | off | Submit the version for review; needs a processed build of that version in TestFlight. Once Apple approves it, it is released to everyone automatically |

### What stays in the browser

1. **Agreements.** The Account Holder accepts the current agreement in App Store Connect → Business (and at developer.apple.com → Account). Flowplan is free: the *Paid Apps* agreement, tax forms and banking are only needed for paid apps or in-app purchases.
2. **App record**, if the run asks for it: App Store Connect → Apps → **+** → New App.
   - Platforms: **iOS**
   - Name: **Flowplan – Notes & Projects**. If the name is taken, use *Flowplan – Notizen & Projekte*.
   - Primary Language: **English (U.S.)**. It is the fallback in every country without a German listing.
   - Bundle ID: **Flowplan - app.flowplan.mobile** (registered by the run before)
   - SKU: **flowplan-ios**
   - User Access: **Full Access**
3. **App Group**, if the run asks for it: developer.apple.com → Certificates, Identifiers & Profiles.
   - Identifiers → **+** → *App Groups*. Description `Flowplan`, identifier **`group.app.flowplan.mobile`** → Register.
   - Identifiers → `app.flowplan.mobile` → App Groups → *Configure* → tick `group.app.flowplan.mobile` → Save.
   - Do the same for `app.flowplan.mobile.widgets`, `app.flowplan.mobile.share` and `app.flowplan.mobile.notifications`.
   - The next run renews the profiles by itself.
4. **App Privacy** (App Store Connect → the app → App Privacy). The API key cannot set it. Answers, as above:
   - Privacy policy URL: `https://flowplan.org/datenschutz`.
   - *Do you or your third-party partners collect data from this app?* **Yes.**
   - Data types:
     - *Contact Info*: **Name**, **Email Address**;
     - *User Content*: **Photos or Videos**, **Other User Content**;
     - *Identifiers*: **User ID**, **Device ID**.
   - For each type:
     - purpose **App Functionality** only;
     - *linked to the user's identity*: **Yes**;
     - *used for tracking*: **No**.
   - Leave everything else unselected (no Diagnostics, Usage Data, Location, Contacts, Financial Info), then **Publish**.
5. **Age rating, newer questions.** `app_rating_config.json` answers every content question with "None". It also answers "No" for advertising, age assurance, parental controls, health/wellness, gambling and unrestricted web access. Two questions are left to you in App Information → Age Rating:
   - *Messaging and Chat*;
   - *User-Generated Content*. Flowplan has comments, shared pages and public share links, so the honest answer is probably *Yes*.
6. **Pricing and Availability:** price **Free** (USD 0.00), all countries or regions.
7. **App preview video** (`app-store/preview/<locale>/`, German, English, French): fastlane does not upload videos; drag each into App Previews of its language.
8. **Submit:** choose the build on the version page and press *Add for Review* → *Submit*, or run iOS setup with *submit* on.

## App Review: demo account and contact

`review_information/` holds only what may be public: the notes (`notes.txt`) and the name. The demo account and the contact for App Review are **not files in the repository** – `fastlane ios metadata` takes them from the environment and sends them along with the metadata:

| Variable | App Store Connect field |
| --- | --- |
| `DEMO_USER` | Sign-in information → user name |
| `DEMO_PASSWORD` | Sign-in information → password |
| `REVIEW_EMAIL` | Contact information → e-mail |
| `REVIEW_PHONE` | Contact information → phone (with country code, e.g. `+49 30 1234567`) |

Set them for the shell that runs fastlane (`DEMO_USER=… DEMO_PASSWORD=… bundle exec fastlane ios metadata`) or as secrets of the build machine; fastlane warns when the demo account is missing. Without `DEMO_USER`/`DEMO_PASSWORD` the account fields in App Store Connect are not written, but `deliver` then marks the version as needing no sign-in – so set the variables, or check the sign-in information in App Store Connect after the upload. `notes.txt` refers to "the sign-in information of this App Review record", which is exactly these fields.

## Privacy answers

The app itself collects nothing. It has:

- no analytics, ads or tracking SDKs;
- no third-party code apart from Expo and React Native;
- on the device only: the addresses and names of the saved profiles (instances), per profile a device token for the widgets and the last summary the widgets show – for administrators also the instance's numbers (counts and states, no personal data) – (in the keychain / Keystore), and the web view's own storage (session cookies per instance, offline data of the web app);
- for the configurable widgets: each widget's settings (ids of pages, views and properties) and the last answers they show (task titles, appointments, names of favorites …), per profile – iOS in the App Group the app shares with its widget extension (the device token in the App Group's keychain), Android in the app's own files. Pages behind a journal PIN or end-to-end encrypted show only their state; switching or leaving a profile removes its answers;
- voice memos and photos from the capture screen, what is shared through the share extension and scanned documents (with the text recognised on the device) go straight to the user's instance (a scan's PDF is deleted from the phone once it is saved);
- iOS Spotlight: titles, places and short excerpts of the active profile's pages and open tasks, in the phone's own search index (never sent anywhere); emptied when signing out or switching profiles;
- push notifications through the Flowplan push relay (push.flowplan.org, run by the developer): the app registers its APNs / FCM token there for the instance's address and gets an opaque relay token, which it hands the instance together with a public key made on the phone (the private key never leaves the device). The instance sends the notification end-to-end encrypted to that key through the relay to Apple or Google; the relay sees the device token (stored encrypted), the instance's address, the badge number and the category, never the content. The app decrypts on the device. Live Activities' push tokens are registered the same way; what an instance sends to a Live Activity is not encrypted (the system renders it). Older instances without the relay send through Expo's push service as before (push token, a general text, the badge).

Apple and Google, however, count the data that the developer's own service receives through the app. For an account on **app.flowplan.org**, run by the developer, the answers below apply. A self-hosted instance is run by its operator and is not part of this listing – also when it is one of several profiles in the app: the app sends nothing of one profile to another instance or to the developer – except, for push, the device's push token and the instance's address to the developer's push relay (also for self-hosted instances; no content). Check that the privacy policy at flowplan.org/datenschutz names the app and the push relay.

### App Store: App Privacy ("nutrition label")

- **Tracking:** No. No data is used to track people across apps or websites; there is no tracking domain in `PrivacyInfo.xcprivacy`.
- **Data collected** (all *linked to the user*, purpose *App Functionality*, not used for tracking):

  | Category | Type | Why |
  | --- | --- | --- |
  | Contact Info | Name, Email Address | Account |
  | User Content | Photos or Videos, Other User Content | Pages, uploads, comments |
  | Identifiers | User ID | Account |
  | Identifiers | Device ID | Push notifications (the push token) |
  | User Content | Audio Data | Voice memos from the capture screen (widgets, Siri), uploaded to the user's pages |

  The hosted service also writes logs of IP addresses for security. Apple's *Diagnostics* category covers crash and performance data, so leave it unselected unless the server stores such data for analysis.
- Privacy policy URL: `https://flowplan.org/datenschutz`

### Google Play: Data safety

- Does the app collect or share user data? **Yes, collects; does not share.**
- Is all data encrypted in transit? **Yes** (HTTPS only; HTTP only for local development addresses).
- Can users request deletion? **Yes**: account deletion, see the checklist.
- Data types, all *collected*, *required*, purpose *App functionality* and *Account management*:
  - **Personal info:** name, email address, user IDs;
  - **Photos and videos:** photos (if uploaded);
  - **Files and docs:** files and docs (pages, uploads).
  - **Audio:** voice or sound recordings (voice memos the user records for a page; optional).
  - **Device or other IDs:** the push token, for push notifications (shared with no one; Expo, Apple and Google only deliver).
- No location, no contacts, no financial info, no app activity for analytics.
- **Ads:** no. **Target audience:** 18+ (work and productivity app, not designed for children). **News app:** no. **Government app:** no.

### Age rating

- **App Store:** every content question is "None" (`app_rating_config.json`, in App Store Connect's current keys). With *Unrestricted Web Access* set to "No" the rating is 4+. *Messaging and Chat* and *User-Generated Content* are answered in the browser (One-click setup → What stays in the browser). The app only shows the user's own Flowplan instance, and other sites open in the system browser.
- **Google Play (IARC questionnaire):** category *Utility, Productivity, Communication, or Other*. No violence, sexuality, language, controlled substances or gambling. Users can interact and share content with each other within their workspace (comments, shared pages), which the questionnaire asks about; there is no public sharing to strangers in the app. Expected rating: Everyone / PEGI 3 / USK 0.

### Categories

- **App Store:** Productivity, secondary Business.
- **Google Play:** Productivity.

## Submission checklist

### Once: accounts and app records

1. **Apple Developer Program** (99 USD/year) at developer.apple.com, as an organisation (needs a D-U-N-S number) or as an individual. The seller name in the store is the account's name.
2. **Actions → iOS setup** (One-click setup above) does steps 2 and 3 as far as Apple allows. By hand: in **Certificates, Identifiers & Profiles**, register the App IDs `app.flowplan.mobile` (capabilities *Push Notifications* and *App Groups*: `group.app.flowplan.mobile`) and `app.flowplan.mobile.widgets` (*App Groups*). With cloud signing (API key with role *Admin*) Xcode does this itself on the first build.
3. In **App Store Connect → Apps → +**, create the app with the values in One-click setup → What stays in the browser:
   - platform iOS, name "Flowplan – Notes & Projects" (or the German name);
   - primary language English (U.S.);
   - bundle ID `app.flowplan.mobile`, SKU `flowplan-ios`, full access.
4. Create an **App Store Connect API key** (Users and Access → Integrations, access *Admin*) and store it and the team ID as secrets (One-click setup above, main README → Signing).
5. **Google Play Console** (one-time 25 USD) at play.google.com/console:
   - Personal accounts created after November 2023 must run a **closed test with at least 12 testers for 14 days** before production access. Organisation accounts are exempt (D-U-N-S needed).
   - Plan time for this.
6. In **Play Console → Create app**: name, default language, app (not game), free. Accept the declarations.
7. Create the **upload keystore** and a **service account** for the Play Developer API (Google Cloud → IAM → service account → JSON key), invite it in Play Console with release rights, and store both as secrets.
8. The very first Android upload must be done by hand in Play Console. Afterwards the API, and so the release workflow, can upload:
   - run **Release** without the Play secret;
   - download `Flowplan-<version>-android.aab` from the GitHub release;
   - upload it to *Internal testing*.

### Before the first review: blockers

- [ ] **Account deletion inside the app.** Apple requires it for apps in which an account can be created (guideline 5.1.1(v)), and Google asks for a deletion URL.
  - Flowplan currently lets only administrators delete accounts.
  - Needed: **Delete my account** in the profile settings of the web app.
  - Needed: a web page that explains deletion, for Google's *Delete account URL* field, e.g. docs.flowplan.org.
- [ ] **Sign-in hand-off texts.** The server's hand-off pages still say "Flowplan Desktop" (`/api/auth/desktop`). On iOS they are visible for a moment, on Android until you tap **open**. Make them neutral ("Flowplan-App") or detect the mobile app.
- [ ] **Deploy** the Flowplan version with mobile detection (`FlowplanMobile/` in `components/login.tsx`) to app.flowplan.org. Without it, the passkey button there tries WebAuthn inside the app and fails.
- [ ] **Demo account for Apple** on app.flowplan.org with sample content.
  - Enter it in App Store Connect → App Review Information, or set `DEMO_USER` and `DEMO_PASSWORD` for `fastlane ios metadata` (above).
  - Never commit the account: it lives in the environment or in App Store Connect only.
- [ ] Contact for App Review: `REVIEW_EMAIL` and `REVIEW_PHONE` for fastlane (above), or in App Store Connect.
- [ ] Privacy policy at flowplan.org/datenschutz mentions the apps (no tracking, data on the chosen server).

### Each release

1. Run **Actions → Release** (patch/minor/major, *upload* on and the version it becomes typed into *confirm*, e.g. `1.0.1`). iOS lands in TestFlight and Android in internal testing; without the confirmation nothing is uploaded.
2. Test on real devices:
   - first start;
   - e-mail sign-in, passkey and SSO sign-in;
   - offline page;
   - links to other sites;
   - **Profiles**: add a second instance, switch with the quick action **Switch profile** and in the app settings, rename, **Sign out and remove the profile**; after switching, widgets, badge and notifications show the active profile only, and switching back finds you still signed in;
   - an update from a version with a single address keeps that instance (as the first profile) and its sign-in;
   - **Widgets** (add each from the gallery – it shows sample data): *Flowplan* and *Flowplan Inbox* show *Open Flowplan to sign in* until you have signed in, then your tasks and inbox, and follow changes within seconds; as an administrator *Flowplan Instance*, *Flowplan Live* and *Flowplan Storage* show the instance (others see *Administrators only*), each opens its page of the administration; edit each one's setting (Live: error rate → the lock screen gauge);
   - **Configurable widgets**: add each of the nine without changing anything (it works with its defaults; *Database counter* and *Form responses* ask for a page), then edit its settings (iOS: long press → Edit Widget, lists come from the instance; Android: long press → settings). Check off a task, a habit, mark a mention read, start and stop the timer – on the home screen, without opening the app. Sign out in the page: every widget says *Open Flowplan to sign in* and keeps its settings; sign in again: they fill at once. Switch profiles: nothing of the other instance stays;
   - **Live Activities / ongoing notifications**: start focus (Control Center or quick action), a meeting in a calendar view that runs now (*Open notes*), an import (indeterminate bar), a voice memo (lock the screen, *Stop* from the lock screen); as an administrator an incident (e.g. a failed backup) appears and ends when it is fixed;
   - **Siri / Shortcuts** in German, English, French: "Notiz zu Flowplan hinzufügen", "Was steht heute in Flowplan an", "Timer in Flowplan starten"; Control Center controls and the Action button (iOS 18); Android Quick Settings tile *New note*;
   - **Back**: the swipe from the left edge (iOS) and Android's back close an open dialog or menu first, then go from a record to its database, from a settings section to the overview and from a page to the previous one; on the start page the iOS gesture is off and Android's back leaves the app;
   - sharing into Flowplan (Android);
   - dark mode.
3. Update `release_notes.txt` (App Store) and `changelogs/<versionCode>.txt` (Play), then run `bundle exec fastlane ios metadata` / `android metadata`, or paste the texts.
4. **App Store Connect:**
   - choose the build;
   - fill App Privacy (above) and the age rating;
   - upload the preview video by hand for each language (App Previews; fastlane does not upload videos, see [Preview video](#preview-video));
   - set pricing *Free* and availability;
   - **Submit for Review**.
5. **Play Console:**
   - complete Store listing, Data safety, Content rating, Target audience, Ads (no) and App access (with the demo account);
   - promote the internal release to closed testing (if required), then to production;
   - for the promo video, upload `flowplan-preview-iphone.mp4` to YouTube and enter the URL in `google-play/<locale>/video.txt`.

### Widgets, Live Activities, Siri: what Apple and Google look at

- **Background audio (iOS) and the microphone foreground service (Android).** Voice memos keep recording when the screen locks (`UIBackgroundModes: audio`, expo-audio's `enableBackgroundRecording`); the recording shows as Live Activity / ongoing notification with *Stop*. In App Review's notes and in Play Console (App content → **Foreground service permissions** → `FOREGROUND_SERVICE_MICROPHONE`: "user-initiated voice memo recording that continues with the screen off") explain this, with a short screen recording for Play.
- **Camera (Android).** expo-image-picker brings the `CAMERA` permission for "Take a photo" on the capture screen; Play's Data safety needs no extra entry (the photo is uploaded as user content).
- **Live Activities** are started only by the person's own actions or what runs for them (focus, meeting, import, voice memo; incidents only for administrators), never for marketing.
- **Siri phrases** exist in German, English and French (`AppShortcuts.strings`); Apple checks that each names the app.

### Screenshots of the widgets

The store set has a drawn home screen with the widgets (`02-widgets`, above). Screenshots from a simulator or device are optional; they help with guideline 4.2:

1. Sign in on a simulator (iPhone 6.9″, iPad 13″) or the Pixel emulator with an account that has tasks with due dates, a journal with a habits database, a recent timer and a form with responses (seed them by hand; the screenshot script does not create them).
2. Add from the gallery, from top left: *Tasks* (medium, filter *Due today*), *Today* (small), *Database counter* (small, the roadmap database), *Journal and habits* (medium), *Time this week* (small) and on the lock screen *Tasks* (rectangular) and *Database counter* (circular). Start focus from Control Center for the Dynamic Island.
3. Light and dark, German, English and French. To use one instead of the drawn frame, save it (the whole screen, at the device's size in points times its scale) as `store/.cache/raw/<de|en|fr>/<device>/02-widgets.png` with `{"full": true}` in `02-widgets.json`, then run `npm run store:images`.

### What the review notes say

`review_information/notes.txt` tells Apple what Flowplan is (open source, self-hostable) and why the first start asks for a server: to keep app.flowplan.org. It also points to the demo account (in the sign-in information fields, see above) and the **Try the demo** button and explains passkey/SSO sign-in through the system sheet. Apple sometimes rejects apps that "only wrap a website" (guideline 4.2). The native parts are worth naming if asked:

- browser hand-off sign-in;
- offline handling;
- quick actions;
- managed configuration for companies;
- profiles for several instances (work and private), each with its own device registration;
- system integration of the bars;
- share target on Android;
- configurable widgets with buttons (check off tasks and habits, timer), Live Activities, Control Center controls, App Shortcuts and Siri phrases, a native capture screen for notes, voice memos and photos.

A share extension (main README → Ideas) would strengthen that case further.
