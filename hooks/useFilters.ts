import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnrichedPlayer } from "../lib/types";
import {
  EMPTY_FILTERS,
  applyPlayerFilters,
  deleteSavedFilter,
  hasActiveFilters,
  loadActiveFilters,
  loadSavedFilters,
  persistActiveFilters,
  saveNamedFilter,
  type PlayerFilters,
  type SavedFilter,
} from "../lib/filtersStore";

/**
 * Cross-screen player filter state (search, position, price/points range,
 * clubs, availability) plus named saved presets. Ties Compare, Transfers,
 * Ownership, Spy and Watchlist together — a filter set on one screen is
 * available (via saved presets) on every other, and the in-progress filter
 * survives navigating away and back.
 */
export function useFilters() {
  const [filters, setFiltersState] = useState<PlayerFilters>(EMPTY_FILTERS);
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadActiveFilters(), loadSavedFilters()]).then(([active, savedList]) => {
      if (!cancelled) {
        setFiltersState(active);
        setSaved(savedList);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setFilters = useCallback((next: PlayerFilters | ((prev: PlayerFilters) => PlayerFilters)) => {
    setFiltersState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: PlayerFilters) => PlayerFilters)(prev) : next;
      void persistActiveFilters(resolved);
      return resolved;
    });
  }, []);

  const patchFilters = useCallback(
    (patch: Partial<PlayerFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    [setFilters]
  );

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const applyPreset = useCallback((preset: SavedFilter) => setFilters(preset.filters), [setFilters]);

  const savePreset = useCallback(
    async (name: string) => {
      const next = await saveNamedFilter(name, filters);
      setSaved(next);
    },
    [filters]
  );

  const removePreset = useCallback(async (id: string) => {
    const next = await deleteSavedFilter(id);
    setSaved(next);
  }, []);

  const isActive = useMemo(() => hasActiveFilters(filters), [filters]);

  const apply = useCallback((players: EnrichedPlayer[]) => applyPlayerFilters(players, filters), [filters]);

  return {
    filters,
    loaded,
    setFilters,
    patchFilters,
    resetFilters,
    isActive,
    apply,
    savedFilters: saved,
    applyPreset,
    savePreset,
    removePreset,
  };
}
