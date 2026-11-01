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
- New texts go into `src/i18n.ts` (and `locales/` for store and system texts) in German, English and French.
- Update the documentation ([flowplan-docs](https://github.com/yannicschuller/flowplan-docs), page "Offline and apps") when behaviour changes.

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).

## Continuous integration and releases

Pull requests from collaborators and forks are checked on GitHub's macOS runners. Only work started by the maintainer runs on the project's own Mac, and only the maintainer can build signed apps or publish releases (**Actions → Build / Release**, see [README → Releasing](README.md#releasing)). Changes to `.github/` need the maintainer's review.
