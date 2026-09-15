import { useCallback, useEffect, useState } from "react";
import { loadWatchlist, toggleWatchlist } from "../lib/watchlistStore";

/**
 * Lightweight, locally-persisted "star a player" watchlist. Ties the Spy,
 * Transfers and Forecast tabs together — star a player from any of them and
 * it surfaces on the others — without a network round trip.
 */
export function useWatchlist() {
  const [ids, setIds] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWatchlist().then((list) => {
      if (!cancelled) {
        setIds(list);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((playerId: number) => {
    // Optimistic local update so the star flips instantly; persisted write
    // happens in the background and reconciles the source of truth.
    setIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [playerId, ...prev]));
    void toggleWatchlist(playerId);
  }, []);

  const isStarred = useCallback((playerId: number) => ids.includes(playerId), [ids]);

  return { watchlistIds: ids, loaded, toggle, isStarred };
}
