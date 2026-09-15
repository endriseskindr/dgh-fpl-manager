import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "dgh-fpl-cache:";

export type CacheEnvelope<T> = {
  value: T;
  cachedAt: number; // epoch ms
  key: string;
};

/**
 * Persist a value with a timestamp so the UI can always show "last updated"
 * and fall back to last-known-good data when the network fails.
 */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const envelope: CacheEnvelope<T> = { value, cachedAt: Date.now(), key };
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — non-fatal, live data still works this session.
  }
}

export async function cacheGet<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

export async function cacheClearAll(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(PREFIX));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}

export function formatAge(cachedAt: number): string {
  const seconds = Math.floor((Date.now() - cachedAt) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
