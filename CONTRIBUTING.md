# Contributing to the Flowplan app

Thanks for your interest! Bug reports, ideas and pull requests are welcome. This is the native app for iPhone, iPad and Android (Expo / React Native); the Flowplan server and web interface live in [flowplan](https://github.com/yannicschuller/flowplan).

## Before you start

- **Questions and ideas:** ask in the [Flowplan Discord](https://discord.gg/bCEdB6MPrR).
- **Bugs:** open an issue with your device and OS version, the app version and build (shown at the bottom of the app settings), the Flowplan version of your instance, steps to reproduce, what you expected and what happened. Many problems are in the web interface the app shows – those belong to [flowplan](https://github.com/yannicschuller/flowplan/issues).
- **Larger changes:** open an issue first so we can agree on the approach before you invest time.
- **Security issues:** do not open a public issue – see [SECURITY.md](SECURITY.md).

## Development setup

See [README → Development](README.md#development). In short:

```sh
npm ci
npm run prebuild     # generates ios/ and android/ from app.config.ts
npm run ios          # or: npm run android
```

`ios/` and `android/` are generated and not committed: native changes go into config plugins (`plugins/`) or local modules (`modules/`).

## Pull requests

- Keep changes focused; one topic per pull request.
- Match the surrounding code: naming, comment density, no new dependencies without a reason.
- Add or update tests in `test/*.test.ts` for logic you change.
- Run `npm run check` (TypeScript and tests) before you push; CI also builds the JavaScript bundle and runs `expo prebuild`.
- Texts live in flat JSON catalogues, one file per language (`de.json`, `en.json`, `fr.json`, `zh.json` for Simplified Chinese), keys in German's order:
  - `locales/ui/` – the app's own screens, dialogs, notifications and widgets (`t("key")` from `src/i18n.ts`; the key type comes from `de.json`);
  - `plugins/capture/locales/` – the iOS share extension;
  - `plugins/intents/locales/` and `plugins/widget-suite/locales/` – Siri, Shortcuts, controls and the configurable iOS widgets (the English text is the key; `phrase.<name>` are Siri phrases, `gallery.<widget>.label` / `.description` the widget gallery).

  A new text goes into German and English (and French and Chinese if you can; an empty text reads as English) at the same place in every file. A `context.json` next to a catalogue holds notes for translators. `locales/{de,en,fr,zh}.json` (nested) keep the iOS and Android system texts, `store/` the store listings.
- Translations into French and Chinese – and corrections – come in as pull requests from [translate.flowplan.org](https://translate.flowplan.org); `test/catalogues.test.ts` checks that every language has German's keys and English's placeholders (`{name}`, `%@`, `%d`, `%1$s`, `${applicationName}`). German uses informal "du", French "vous".
- Update the documentation ([flowplan-docs](https://github.com/yannicschuller/flowplan-docs), page "Offline and apps") when behaviour changes.

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).

## Continuous integration and releases

Checks, builds and releases run on GitHub's runners. Only the maintainer can build signed apps or publish releases (**Actions → Build / Release**, see [README → Releasing](README.md#releasing)). Changes to `.github/` need the maintainer's review.
