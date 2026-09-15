import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EnrichedPlayer } from "./types";

// Distinct prefix from lib/storage.ts's cache envelope keys — this is
// user-configured preference data, not a re-fetchable cache, so it must
// never be wiped by cacheClearAll()/"full update".
const ACTIVE_KEY = "dgh-fpl-settings:filters-active";
const SAVED_KEY = "dgh-fpl-settings:filters-saved";

export type PlayerPosition = "GKP" | "DEF" | "MID" | "FWD";

/**
 * Shared filter criteria, applied identically wherever a player pool needs
 * narrowing (Compare, Transfers, Ownership, Spy, Watchlist). A single shape
 * means a filter built on one screen behaves the same on every other.
 */
export type PlayerFilters = {
  search: string;
  positions: PlayerPosition[];
  clubIds: number[];
  minPrice: number | null;
  maxPrice: number | null;
  minPoints: number | null;
  maxPoints: number | null;
  /** "a" = available. Excluding this filters out injured/suspended/unavailable by default when set. */
  availableOnly: boolean;
};

export const EMPTY_FILTERS: PlayerFilters = {
  search: "",
  positions: [],
  clubIds: [],
  minPrice: null,
  maxPrice: null,
  minPoints: null,
  maxPoints: null,
  availableOnly: false,
};

export type SavedFilter = {
  id: string;
  name: string;
  filters: PlayerFilters;
  createdAt: number;
};

function isPlayerFilters(v: unknown): v is PlayerFilters {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.search === "string" &&
    Array.isArray(f.positions) &&
    Array.isArray(f.clubIds) &&
    typeof f.availableOnly === "boolean"
  );
}

/** Loads the last-active (unsaved, in-progress) filter state. Returns EMPTY_FILTERS if none saved yet or the payload is malformed. */
export async function loadActiveFilters(): Promise<PlayerFilters> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw);
    return isPlayerFilters(parsed) ? { ...EMPTY_FILTERS, ...parsed } : EMPTY_FILTERS;
  } catch {
    return EMPTY_FILTERS;
  }
}

export async function persistActiveFilters(filters: PlayerFilters): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(filters));
  } catch {
    // Non-fatal — filters just won't survive an app restart this time.
  }
}

/** Loads named saved-filter presets, most recently created first. Returns [] if none saved yet. */
export async function loadSavedFilters(): Promise<SavedFilter[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SavedFilter =>
        !!s && typeof s === "object" && typeof s.id === "string" && typeof s.name === "string" && isPlayerFilters(s.filters)
    );
  } catch {
    return [];
  }
}

async function persistSaved(list: SavedFilter[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Non-fatal.
  }
}

export async function saveNamedFilter(name: string, filters: PlayerFilters): Promise<SavedFilter[]> {
  const current = await loadSavedFilters();
  const entry: SavedFilter = { id: `${Date.now()}`, name: name.trim() || "Untitled filter", filters, createdAt: Date.now() };
  const next = [entry, ...current];
  await persistSaved(next);
  return next;
}

export async function deleteSavedFilter(id: string): Promise<SavedFilter[]> {
  const current = await loadSavedFilters();
  const next = current.filter((s) => s.id !== id);
  await persistSaved(next);
  return next;
}

/** True if any criterion differs from the empty/default state. */
export function hasActiveFilters(filters: PlayerFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.positions.length > 0 ||
    filters.clubIds.length > 0 ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.minPoints !== null ||
    filters.maxPoints !== null ||
    filters.availableOnly
  );
}

/** Applies a PlayerFilters criteria set to a player pool. Pure function — safe to memoize on (players, filters). */
export function applyPlayerFilters(players: EnrichedPlayer[], filters: PlayerFilters): EnrichedPlayer[] {
  const needle = filters.search.trim().toLowerCase();
  return players.filter((p) => {
    if (needle && !p.webName.toLowerCase().includes(needle) && !p.fullName.toLowerCase().includes(needle)) return false;
    if (filters.positions.length > 0 && !filters.positions.includes(p.position as PlayerPosition)) return false;
    if (filters.clubIds.length > 0 && !filters.clubIds.includes(p.teamId)) return false;
    if (filters.minPrice !== null && p.price < filters.minPrice) return false;
    if (filters.maxPrice !== null && p.price > filters.maxPrice) return false;
    if (filters.minPoints !== null && p.totalPoints < filters.minPoints) return false;
    if (filters.maxPoints !== null && p.totalPoints > filters.maxPoints) return false;
    if (filters.availableOnly && p.status !== "a") return false;
    return true;
  });
}
