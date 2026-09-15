import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WhatIfMove, WhatIfChipChoice } from "./analytics/whatIf";

// Distinct prefix from lib/storage.ts's cache envelope keys — this is
// user-entered persistent data (saved scenarios), not a re-fetchable cache,
// so it must never be wiped by cacheClearAll()/"full update".
const KEY = "dgh-fpl-settings:saved-whatif-scenarios";

export type SavedWhatIfScenario = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  moves: WhatIfMove[];
  chip: WhatIfChipChoice;
  // Denormalized snapshot of the result at save-time, purely for display in
  // a list without needing to re-run the simulation against (possibly
  // different) live data. The live screen always re-simulates against
  // current data when a scenario is loaded — this snapshot is a label only.
  snapshot: {
    netSwing: number;
    scenarioGwAdjusted: number;
    transferHits: number;
    moveSummaries: string[];
  };
};

const MAX_SAVED_SCENARIOS = 20;

function makeId(): string {
  return `whatif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Loads all persisted What-If scenarios, most recently created first. Returns [] if none saved yet. */
export async function loadSavedWhatIfScenarios(): Promise<SavedWhatIfScenario[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedWhatIfScenario[]).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function persist(list: SavedWhatIfScenario[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Non-fatal — the scenario just won't survive a restart this time.
  }
}

/** Saves a new scenario (capped at MAX_SAVED_SCENARIOS, oldest dropped first) and returns the updated list. */
export async function saveWhatIfScenario(input: {
  name: string;
  moves: WhatIfMove[];
  chip: WhatIfChipChoice;
  snapshot: SavedWhatIfScenario["snapshot"];
}): Promise<SavedWhatIfScenario[]> {
  const current = await loadSavedWhatIfScenarios();
  const entry: SavedWhatIfScenario = {
    id: makeId(),
    name: input.name.trim() || "Untitled scenario",
    createdAt: Date.now(),
    moves: input.moves,
    chip: input.chip,
    snapshot: input.snapshot,
  };
  const next = [entry, ...current].slice(0, MAX_SAVED_SCENARIOS);
  await persist(next);
  return next;
}

/** Deletes one saved scenario by id and returns the updated list. */
export async function deleteWhatIfScenario(id: string): Promise<SavedWhatIfScenario[]> {
  const current = await loadSavedWhatIfScenarios();
  const next = current.filter((s) => s.id !== id);
  await persist(next);
  return next;
}

/** Clears every saved scenario. */
export async function clearWhatIfScenarios(): Promise<SavedWhatIfScenario[]> {
  await persist([]);
  return [];
}
