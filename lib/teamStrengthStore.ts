import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TeamStrengthOverride, TeamStrengthOverrideMap } from "./analytics/teamStrength";

// Distinct prefix from lib/storage.ts's cache envelope keys — this is
// user-entered persistent data, not a re-fetchable cache, so it must never be
// wiped by cacheClearAll()/"full update".
const KEY = "dgh-fpl-settings:team-strength-overrides";

/** Loads all persisted per-team strength overrides. Returns {} if none saved yet. */
export async function loadTeamStrengthOverrides(): Promise<TeamStrengthOverrideMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as TeamStrengthOverrideMap) : {};
  } catch {
    return {};
  }
}

async function persist(map: TeamStrengthOverrideMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Non-fatal — the override just won't survive a restart this time.
  }
}

/** Sets (merges) an override for one team and persists the full map. Passing `undefined`/`null` for a field clears just that field. */
export async function setTeamStrengthOverride(teamId: number, patch: TeamStrengthOverride): Promise<TeamStrengthOverrideMap> {
  const current = await loadTeamStrengthOverrides();
  const merged: TeamStrengthOverride = { ...current[teamId], ...patch };
  // Strip null/undefined fields so an override object never claims a field
  // it doesn't actually set (keeps "no override => official value" honest).
  const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null)) as TeamStrengthOverride;
  const next: TeamStrengthOverrideMap = { ...current };
  if (Object.keys(cleaned).length) next[teamId] = cleaned;
  else delete next[teamId];
  await persist(next);
  return next;
}

/** Resets one team back to 100% official values. */
export async function resetTeamStrengthOverride(teamId: number): Promise<TeamStrengthOverrideMap> {
  const current = await loadTeamStrengthOverrides();
  const next = { ...current };
  delete next[teamId];
  await persist(next);
  return next;
}

/** Resets every team back to official values. */
export async function resetAllTeamStrengthOverrides(): Promise<TeamStrengthOverrideMap> {
  await persist({});
  return {};
}
