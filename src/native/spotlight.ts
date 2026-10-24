// The active profile's pages and open tasks in the phone's search (iOS
// Spotlight): fetched after a summary (GET /api/mobile/capture/spotlight),
// at most every 15 minutes and again when the profile changes; re-indexed
// only when something changed. Signed out, or before another profile's
// entries go in, the index is emptied. Instances without the endpoint, or
// offline: what is indexed stays.
import { Platform } from "react-native";
import { clearSpotlight, indexSpotlight } from "../../modules/flowplan-capture/src";
import { entriesKey, isSpotlightData, spotlightData, spotlightDomain, spotlightEntries } from "../capture";
import { locale } from "../i18n";
import { store } from "../store";
import type { Summary } from "../summary";

const EVERY_MS = 15 * 60_000;
let last = { domain: "", key: "", at: 0 };
let running: Promise<void> | null = null;

export function syncSpotlight(summary: Summary | null, options: { force?: boolean } = {}) {
  if (Platform.OS !== "ios") return Promise.resolve();
  if (!summary) {
    last = { domain: "", key: "", at: 0 };
    return clearSpotlight().then(() => {});
  }
  // One at a time; a summary during a run waits for the next one.
  running ??= update(options.force === true).finally(() => {
    running = null;
  });
  return running;
}

async function update(force: boolean) {
  const profile = store.profiles().active,
    server = store.server(),
    token = store.deviceToken();
  if (!profile || !server || !token) return;
  const domain = spotlightDomain(profile);
  if (!force && last.domain === domain && Date.now() - last.at < EVERY_MS) return;
  const answer = await spotlightData({ server, token, lang: locale() });
  if (!answer.ok || !isSpotlightData(answer.value)) return;
  // The profile changed meanwhile: its own refresh follows.
  if (store.profiles().active !== profile) return;
  const entries = spotlightEntries(answer.value, locale());
  const key = entriesKey(entries);
  if (last.domain === domain && last.key === key) {
    last.at = Date.now();
    return;
  }
  // First run of the app, or another profile: nothing else stays.
  if (last.domain !== domain) await clearSpotlight();
  if ((await indexSpotlight(domain, entries)) !== null) last = { domain, key, at: Date.now() };
}
