import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadCachedWarRoomData, refreshWarRoomData } from "../lib/dataService";
import { cacheClearAll } from "../lib/storage";
import { clearInMemoryCache } from "../lib/fplClient";

export const WAR_ROOM_QUERY_KEY = ["war-room-data"];

export function useWarRoomData() {
  const queryClient = useQueryClient();
  const coreRefreshInFlight = useRef(false);
  const enrichmentInFlight = useRef(false);

  const query = useQuery({
    queryKey: WAR_ROOM_QUERY_KEY,
    // TRUE startup path: this query is network-free. It hydrates the last
    // complete renderable snapshot from AsyncStorage, so first paint never
    // waits on FPL, analytics, or a JSON/network waterfall.
    queryFn: loadCachedWarRoomData,
    staleTime: 300_000,
    refetchOnMount: false,
  });

  // Once a usable snapshot exists, refresh the core FPL payload in the
  // background. If there is no snapshot (first install), this same refresh
  // populates the UI after the shell is already interactive.
  useEffect(() => {
    // Avoid re-hitting FPL on rapid tab remounts when the persisted snapshot
    // was refreshed moments ago. Manual pull-to-refresh still forces a fetch.
    if (coreRefreshInFlight.current || enrichmentInFlight.current) return;
    if (query.data && Date.now() - query.data.fetchedAt < 60_000) return;
    coreRefreshInFlight.current = true;
    void queryClient.fetchQuery({
      queryKey: WAR_ROOM_QUERY_KEY,
      queryFn: () => refreshWarRoomData(true, { fast: true }),
      staleTime: 0,
    }).catch(() => {
      // Cached/shell UI remains usable when FPL is offline.
    }).finally(() => {
      coreRefreshInFlight.current = false;
    });
  }, [query.data, queryClient]);

  // Once core data is present, perform the expensive rival/DGH/Spy/TES pass
  // without replacing the visible fast snapshot while it runs.
  useEffect(() => {
    const data = query.data;
    if (!data || data.enrichmentComplete || coreRefreshInFlight.current || enrichmentInFlight.current) return;
    enrichmentInFlight.current = true;
    void queryClient.fetchQuery({
      queryKey: WAR_ROOM_QUERY_KEY,
      queryFn: () => refreshWarRoomData(false, { fast: false }),
      staleTime: 0,
    }).catch(() => {
      // Fast data remains visible; a later refresh can retry enrichment.
    }).finally(() => {
      enrichmentInFlight.current = false;
    });
  }, [query.data, queryClient]);

  /** Manual refresh: coalesced core refresh, followed by the normal enrichment effect. */
  const refresh = useCallback(async () => {
    await queryClient.fetchQuery({
      queryKey: WAR_ROOM_QUERY_KEY,
      queryFn: () => refreshWarRoomData(true, { fast: true }),
      staleTime: 0,
    });
  }, [queryClient]);

  /** Full Update: wipes cache, performs the fast critical path, then lets the
   * normal background enrichment repopulate all rival/intelligence data. */
  const fullUpdate = useCallback(async () => {
    clearInMemoryCache();
    await cacheClearAll();
    await queryClient.fetchQuery({
      queryKey: WAR_ROOM_QUERY_KEY,
      queryFn: () => refreshWarRoomData(true, { fast: true }),
      staleTime: 0,
    });
  }, [queryClient]);

  return { ...query, refresh, fullUpdate };
}
