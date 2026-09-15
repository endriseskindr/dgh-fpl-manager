import AsyncStorage from "@react-native-async-storage/async-storage";

// Distinct prefix from lib/storage.ts's cache envelope keys — this is
// user-entered persistent data (starred players), not a re-fetchable cache,
// so it must never be wiped by cacheClearAll()/"full update".
const KEY = "dgh-fpl-settings:watchlist";

/** Loads the starred player ids, most recently starred first. Returns [] if none saved yet. */
export async function loadWatchlist(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

async function persist(ids: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Non-fatal — the star just won't survive a restart this time.
  }
}

/** Adds a player to the watchlist (most-recent-first) and returns the updated list. No-op if already starred. */
export async function addToWatchlist(playerId: number): Promise<number[]> {
  const current = await loadWatchlist();
  if (current.includes(playerId)) return current;
  const next = [playerId, ...current];
  await persist(next);
  return next;
}

/** Removes a player from the watchlist and returns the updated list. */
export async function removeFromWatchlist(playerId: number): Promise<number[]> {
  const current = await loadWatchlist();
  const next = current.filter((id) => id !== playerId);
  await persist(next);
  return next;
}

/** Toggles a player's starred state and returns the updated list. */
export async function toggleWatchlist(playerId: number): Promise<number[]> {
  const current = await loadWatchlist();
  return current.includes(playerId) ? removeFromWatchlist(playerId) : addToWatchlist(playerId);
}
