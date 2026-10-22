# Store material

Everything for the App Store and Google Play listings, in German (`de-DE`) and English (`en-US`). The folders follow the layout fastlane reads:

- `app-store/` for `deliver` (`fastlane ios metadata`);
- `google-play/` for `supply` (`fastlane android metadata`).

So texts and images can be uploaded with one command or copied into App Store Connect and Play Console by hand.

| What | Where |
| --- | --- |
| App name, subtitle, description, keywords, promotional text, release notes | `app-store/<locale>/*.txt` |
| Support, marketing and privacy URLs | `app-store/<locale>/{support,marketing,privacy}_url.txt` |
| Categories, copyright, age rating | `app-store/{primary,secondary}_category.txt`, `copyright.txt`, `app_rating_config.json` |
| Notes and name for App Review | `app-store/review_information/` (demo account and contact: environment, see below) |
| iPhone 6.9" (1320×2868), iPhone 6.5" (1284×2778), iPad 13" (2064×2752) | `app-store/screenshots/<locale>/` (7 each) |
| App preview video, 886×1920, 27 s, H.264 | `app-store/preview/<locale>/flowplan-preview-iphone.mp4` |
| Play title, short and full description, release notes | `google-play/<locale>/*.txt`, `changelogs/<versionCode>.txt` |
| Phone (1080×1920), 7" tablet (1200×1920), 10" tablet (1600×2560) | `google-play/<locale>/images/{phone,sevenInch,tenInch}Screenshots/` |
| Feature graphic 1024×500, icon 512×512 | `google-play/<locale>/images/featureGraphic.png`, `icon.png` |
| App icon 1024×1024 (App Store, no transparency) and 512×512 (Play) | `icons/` |
| Preview GIFs (README, website) | `preview/flowplan-{de,en}.gif` |

All icon sizes inside the apps are generated with `npm run icons`: the iOS asset catalog and the Android mipmaps, including adaptive icons and splash screens. Screenshots, video and GIFs are generated too; see the main README.

## One-click setup

**Actions → iOS setup → Run workflow** ([`ios-setup.yml`](../.github/workflows/ios-setup.yml), `fastlane ios setup`) does on the own Mac everything the App Store Connect API key allows. Re-running it is safe: what exists is kept.

1. Registers the App IDs `app.flowplan.mobile` (*App Groups*, *Push Notifications*) and `app.flowplan.mobile.widgets` (*App Groups*). The app uses no Associated Domains, iCloud or Sign in with Apple.
2. Creates or reuses the *Apple Distribution* certificate and the App Store profiles of both App IDs with **fastlane match**. They are stored encrypted in the private repository `yannicschuller/flowplan-certificates`. Only this workflow writes there; builds (`build.yml`, `release.yml`) read them when the match secrets exist. If a profile lacks the App Group or push, the setup renews it once.
3. Checks that the app exists in App Store Connect.
4. Uploads texts, categories, copyright, age rating, review information and screenshots for iPhone 6.9″, iPhone 6.5″ and iPad 13″, for the version in `package.json`. It does **not** submit for review unless *submit* is on.

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
| `submit` | off | Submit the version for review; needs a processed build of that version in TestFlight |

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
   - Do the same for `app.flowplan.mobile.widgets`.
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
7. **App preview video** (`app-store/preview/`): fastlane does not upload videos.
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
- on the device only: the addresses and names of the saved profiles (instances), per profile a device token for the widgets and the last summary the widgets show (in the keychain / Keystore), and the web view's own storage (session cookies per instance, offline data of the web app);
- push notifications through Expo's push service: the instance sends the app's push token, a general text ("something new in the inbox") and the number of unread notifications to Expo, which hands them to Apple or Google.

Apple and Google, however, count the data that the developer's own service receives through the app. For an account on **app.flowplan.org**, run by the developer, the answers below apply. A self-hosted instance is run by its operator and is not part of this listing – also when it is one of several profiles in the app: the app sends nothing of one profile to another instance or to the developer. Check that the privacy policy at flowplan.org/datenschutz names the app.

### App Store: App Privacy ("nutrition label")

- **Tracking:** No. No data is used to track people across apps or websites; there is no tracking domain in `PrivacyInfo.xcprivacy`.
- **Data collected** (all *linked to the user*, purpose *App Functionality*, not used for tracking):

  | Category | Type | Why |
  | --- | --- | --- |
  | Contact Info | Name, Email Address | Account |
  | User Content | Photos or Videos, Other User Content | Pages, uploads, comments |
  | Identifiers | User ID | Account |
  | Identifiers | Device ID | Push notifications (the push token) |

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
   - sharing into Flowplan (Android);
   - dark mode.
3. Update `release_notes.txt` (App Store) and `changelogs/<versionCode>.txt` (Play), then run `bundle exec fastlane ios metadata` / `android metadata`, or paste the texts.
4. **App Store Connect:**
   - choose the build;
   - fill App Privacy (above) and the age rating;
   - upload the preview video by hand (App Previews; fastlane does not upload videos);
   - set pricing *Free* and availability;
   - **Submit for Review**.
5. **Play Console:**
   - complete Store listing, Data safety, Content rating, Target audience, Ads (no) and App access (with the demo account);
   - promote the internal release to closed testing (if required), then to production;
   - for the promo video, upload `flowplan-preview-iphone.mp4` to YouTube and enter the URL in `google-play/<locale>/video.txt`.

### What the review notes say

`review_information/notes.txt` tells Apple what Flowplan is (open source, self-hostable) and why the first start asks for a server: to keep app.flowplan.org. It also points to the demo account (in the sign-in information fields, see above) and the **Try the demo** button and explains passkey/SSO sign-in through the system sheet. Apple sometimes rejects apps that "only wrap a website" (guideline 4.2). The native parts are worth naming if asked:

- browser hand-off sign-in;
- offline handling;
- quick actions;
- managed configuration for companies;
- profiles for several instances (work and private), each with its own device registration;
- system integration of the bars;
- share target on Android.

Push notifications and a share extension (main README → Ideas) would strengthen that case.
