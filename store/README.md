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
| Notes and contact for App Review | `app-store/review_information/` |
| iPhone 6.9" (1320×2868), iPhone 6.5" (1284×2778), iPad 13" (2064×2752) | `app-store/screenshots/<locale>/` (7 each) |
| App preview video, 886×1920, 27 s, H.264 | `app-store/preview/<locale>/flowplan-preview-iphone.mp4` |
| Play title, short and full description, release notes | `google-play/<locale>/*.txt`, `changelogs/<versionCode>.txt` |
| Phone (1080×1920), 7" tablet (1200×1920), 10" tablet (1600×2560) | `google-play/<locale>/images/{phone,sevenInch,tenInch}Screenshots/` |
| Feature graphic 1024×500, icon 512×512 | `google-play/<locale>/images/featureGraphic.png`, `icon.png` |
| App icon 1024×1024 (App Store, no transparency) and 512×512 (Play) | `icons/` |
| Preview GIFs (README, website) | `preview/flowplan-{de,en}.gif` |

All icon sizes inside the apps are generated with `npm run icons`: the iOS asset catalog and the Android mipmaps, including adaptive icons and splash screens. Screenshots, video and GIFs are generated too; see the main README.

## Privacy answers

The app itself collects nothing. It has:

- no analytics, ads or tracking SDKs;
- no third-party code apart from Capacitor;
- no data on the device except the server address and the web view's own storage (session cookie, offline data of the web app).

Apple and Google, however, count the data that the developer's own service receives through the app. For an account on **app.flowplan.org**, run by the developer, the answers below apply. A self-hosted instance is run by its operator and is not part of this listing. Check that the privacy policy at flowplan.org/datenschutz names the app.

### App Store: App Privacy ("nutrition label")

- **Tracking:** No. No data is used to track people across apps or websites; there is no tracking domain in `PrivacyInfo.xcprivacy`.
- **Data collected** (all *linked to the user*, purpose *App Functionality*, not used for tracking):

  | Category | Type | Why |
  | --- | --- | --- |
  | Contact Info | Name, Email Address | Account |
  | User Content | Photos or Videos, Other User Content | Pages, uploads, comments |
  | Identifiers | User ID | Account |

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
- No location, no contacts, no financial info, no app activity for analytics, no device IDs.
- **Ads:** no. **Target audience:** 18+ (work and productivity app, not designed for children). **News app:** no. **Government app:** no.

### Age rating

- **App Store:** every content question is "None" (`app_rating_config.json`). With *Unrestricted Web Access* set to "No" the rating is 4+. The app only shows the user's own Flowplan instance, and other sites open in the system browser.
- **Google Play (IARC questionnaire):** category *Utility, Productivity, Communication, or Other*. No violence, sexuality, language, controlled substances or gambling. Users can interact and share content with each other within their workspace (comments, shared pages), which the questionnaire asks about; there is no public sharing to strangers in the app. Expected rating: Everyone / PEGI 3 / USK 0.

### Categories

- **App Store:** Productivity, secondary Business.
- **Google Play:** Productivity.

## Submission checklist

### Once: accounts and app records

1. **Apple Developer Program** (99 USD/year) at developer.apple.com, as an organisation (needs a D-U-N-S number) or as an individual. The seller name in the store is the account's name.
2. In **Certificates, Identifiers & Profiles**, register the App ID `app.flowplan.mobile`, capabilities default: no push yet.
3. In **App Store Connect → Apps → +**, create the app:
   - platform iOS, name "Flowplan – Notizen & Projekte" (or the English name);
   - primary language German or English;
   - bundle ID `app.flowplan.mobile`, SKU e.g. `flowplan-ios`.
4. Create an **App Store Connect API key** (Users and Access → Integrations) and store it and the team ID as secrets (main README → Signing).
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
  - Enter it in App Store Connect → App Review Information, and in `review_information/demo_user.txt` / `demo_password.txt` if you upload with fastlane.
  - Do not commit real passwords: fill those two files locally only, or type the account into App Store Connect.
- [ ] Contact for App Review: e-mail and phone in `review_information/`, or in App Store Connect.
- [ ] Privacy policy at flowplan.org/datenschutz mentions the apps (no tracking, data on the chosen server).

### Each release

1. Run **Actions → Release** (patch/minor/major, upload on). iOS lands in TestFlight and Android in internal testing.
2. Test on real devices:
   - first start;
   - e-mail sign-in, passkey and SSO sign-in;
   - offline page;
   - links to other sites;
   - **Change server**;
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

`review_information/notes.txt` tells Apple what Flowplan is (open source, self-hostable) and why the first start asks for a server: to keep app.flowplan.org. It also points to the demo account and the **Try the demo** button and explains passkey/SSO sign-in through the system sheet. Apple sometimes rejects apps that "only wrap a website" (guideline 4.2). The native parts are worth naming if asked:

- browser hand-off sign-in;
- offline handling;
- quick actions;
- managed configuration for companies;
- system integration of the bars;
- share target on Android.

Push notifications and a share extension (main README → Ideas) would strengthen that case.
