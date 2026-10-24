// Siri, Shortcuts and Focus filters (iOS, plugins/intents): the app hands
// its profiles to the Focus filter's choices, and follows the filter – the
// Focus's profile and workspace when it starts, the profile before when it
// ends (focus.ts) – and tells the active profile's instance which push
// notifications to hold back meanwhile.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { focusFilterText, setIntentProfiles } from "../../modules/flowplan-intents/src";
import { focusRule, focusStep, parseFocusFilter, parseFocusMemory, type FocusStep } from "../focus";
import type { ProfileState } from "../profiles";
import type { Connection } from "../widgets/api";

const MEMORY_KEY = "flowplan.focus.memory";
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// Names and addresses only; nothing of the sign-in.
export function syncIntentProfiles(state: ProfileState) {
  if (Platform.OS !== "ios") return;
  setIntentProfiles(JSON.stringify({ active: state.active, profiles: state.profiles.map(({ id, name, server }) => ({ id, name, server })) }));
}

// The step for a change of the filter the app has not followed yet.
export function takeFocusStep(state: ProfileState): FocusStep | null {
  if (Platform.OS !== "ios") return null;
  let memory = null;
  try {
    memory = parseFocusMemory(SecureStore.getItem(MEMORY_KEY, options));
  } catch {}
  const step = focusStep(parseFocusFilter(focusFilterText()), state, memory);
  if (step)
    try {
      SecureStore.setItem(MEMORY_KEY, JSON.stringify(step.memory), options);
    } catch {}
  return step;
}

// The Focus filter tells the instance itself when it changes; after a
// switch of profiles the new one's instance hears it from here (once per
// filter, profile and rule).
let lastRule = "";
export async function sendFocusRule(connection: Connection | null, active: string | null) {
  if (Platform.OS !== "ios" || !connection) return;
  const filter = parseFocusFilter(focusFilterText());
  if (!filter) return;
  const rule = focusRule(filter, active);
  const key = [connection.server, connection.token, active, filter.at, rule.hide, rule.workspaceId].join("|");
  if (key === lastRule) return;
  try {
    const response = await fetch(`${connection.server}/api/mobile/intents/focus?lang=${encodeURIComponent(connection.lang)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    // Answered (also by an instance without Focus filters): not again.
    if (response.status) lastRule = key;
  } catch {}
}
