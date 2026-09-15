import { FPL_BASE_URL, CACHE_TTL_MS } from "./config";
import { cacheGet, cacheSet } from "./storage";
import { normalizeDisplayName } from "./displayText";
import type {
  Bootstrap,
  FplFixture,
  FplEntry,
  FplPicksResponse,
  LiveResponse,
  StandingsRow,
} from "./types";

export class FplFetchError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FplFetchError";
  }
}

const inMemory = new Map<string, { expires: number; cachedAt: number; value: unknown }>();
// Coalesce concurrent requests for the same endpoint. React Query, pull-to-refresh,
// and background enrichment can otherwise all ask FPL for the same resource at once.
const inFlight = new Map<string, Promise<{ data: unknown; stale: boolean; cachedAt: number }>>();

// Guards against a stalled TCP connection or a server that accepts the
// request but never responds — without this, a single hung fetch could
// block the retry loop (and therefore the whole war-room load) forever.
// A slow-but-alive response still has 3 full attempts to complete.
const REQUEST_TIMEOUT_MS = 12_000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch (err) {
    // Normalize the AbortController's DOMException into a message that
    // clearly identifies a timeout (vs. a generic network failure) for
    // logging/debugging, while still falling into the same retry/fallback
    // path as any other transient network error below.
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch JSON from the official FPL API with:
 *  - short-lived in-memory cache (per session)
 *  - persistent AsyncStorage cache (survives app restarts / offline)
 *  - exponential-backoff retry (3 attempts)
 *  - offline fallback to last-known-good persisted data, flagged as stale
 */
async function getJson<T>(
  path: string,
  ttlMs: number,
  opts?: { forceRefresh?: boolean },
): Promise<{ data: T; stale: boolean; cachedAt: number }> {
  const memHit = inMemory.get(path);
  if (!opts?.forceRefresh && memHit && memHit.expires > Date.now()) {
    return { data: memHit.value as T, stale: false, cachedAt: memHit.expires - ttlMs };
  }

  // Persistent cache is checked before network on normal reads. This is the
  // key startup optimization for Android: after the first successful session,
  // app launch can render from last-known-good FPL data immediately instead of
  // waiting for a fresh API round-trip. Force refresh explicitly bypasses it.
  if (!opts?.forceRefresh) {
    const persisted = await cacheGet<T>(path);
    if (persisted && persisted.cachedAt + ttlMs > Date.now()) {
      inMemory.set(path, { expires: persisted.cachedAt + ttlMs, cachedAt: persisted.cachedAt, value: persisted.value });
      return { data: persisted.value, stale: false, cachedAt: persisted.cachedAt };
    }
  }

  const existing = inFlight.get(path);
  if (existing) return (await existing) as { data: T; stale: boolean; cachedAt: number };

  const networkPromise = (async () => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchWithTimeout(`${FPL_BASE_URL}${path}`, REQUEST_TIMEOUT_MS);
        if (!response.ok) {
          const err = new FplFetchError(`FPL API returned ${response.status} for ${path}`, path, response.status);
          // 4xx client errors are permanent; retrying only adds latency.
          if (response.status >= 400 && response.status < 500) throw err;
          throw err;
        }
        const data = (await response.json()) as T;
        const cachedAt = Date.now();
        inMemory.set(path, { expires: cachedAt + ttlMs, cachedAt, value: data });
        // Cache persistence is never on the critical response path. The in-memory
        // result is already available to the caller; AsyncStorage can finish later.
        void cacheSet(path, data);
        return { data, stale: false, cachedAt };
      } catch (err) {
        lastErr = err;
        const status = err instanceof FplFetchError ? err.status : undefined;
        const isPermanentClientError = typeof status === "number" && status >= 400 && status < 500;
        if (isPermanentClientError) break;
        if (attempt < 2) await sleep(400 * 2 ** attempt);
      }
    }

    const persisted = await cacheGet<T>(path);
    if (persisted) return { data: persisted.value, stale: true, cachedAt: persisted.cachedAt };
    throw lastErr instanceof Error ? lastErr : new FplFetchError(String(lastErr), path);
  })();
  inFlight.set(path, networkPromise as Promise<{ data: unknown; stale: boolean; cachedAt: number }>);
  try {
    return (await networkPromise) as { data: T; stale: boolean; cachedAt: number };
  } finally {
    if (inFlight.get(path) === networkPromise) inFlight.delete(path);
  }
}

export const fpl = {
  overallStandingsPage: (page: number, force?: boolean) =>
    getJson<{ standings: { results: StandingsRow[]; has_next: boolean } }>(`/leagues-classic/314/standings/?page_standings=${Math.max(1, Math.floor(page))}`, CACHE_TTL_MS.standings, { forceRefresh: force }),
  bootstrap: (force?: boolean) => getJson<Bootstrap>("/bootstrap-static/", CACHE_TTL_MS.bootstrap, { forceRefresh: force }),
  fixtures: (event?: number, force?: boolean) =>
    getJson<FplFixture[]>(event ? `/fixtures/?event=${event}` : "/fixtures/", CACHE_TTL_MS.fixtures, { forceRefresh: force }),
  live: (event: number, force?: boolean) => getJson<LiveResponse>(`/event/${event}/live/`, CACHE_TTL_MS.live, { forceRefresh: force }),
  entry: (entryId: number, force?: boolean) => getJson<FplEntry>(`/entry/${entryId}/`, CACHE_TTL_MS.entry, { forceRefresh: force }),
  picks: (entryId: number, event: number, force?: boolean) =>
    getJson<FplPicksResponse>(`/entry/${entryId}/event/${event}/picks/`, CACHE_TTL_MS.picks, { forceRefresh: force }),
  history: (entryId: number, force?: boolean) =>
    getJson<{
      current: { event: number; points: number; total_points: number; overall_rank: number; bank: number; value: number; event_transfers: number; event_transfers_cost: number; points_on_bench: number }[];
      chips: { name: string; event: number }[];
      past: { season_name: string; total_points: number; rank: number }[];
    }>(`/entry/${entryId}/history/`, CACHE_TTL_MS.history, { forceRefresh: force }),
  transfers: (entryId: number, force?: boolean) =>
    getJson<{ element_in: number; element_out: number; event: number; time: string }[]>(`/entry/${entryId}/transfers/`, CACHE_TTL_MS.entry, {
      forceRefresh: force,
    }),
  elementSummary: (playerId: number, force?: boolean) =>
    getJson<{
      history: { round: number; total_points: number; minutes: number; expected_goals: string; expected_assists: string; value: number }[];
      fixtures: { event: number; difficulty: number; is_home: boolean; team_h: number; team_a: number }[];
    }>(`/element-summary/${playerId}/`, CACHE_TTL_MS.elementSummary, { forceRefresh: force }),
  standings: async (
    leagueId: number,
    force?: boolean,
    maxPages = 25,
  ): Promise<{ data: StandingsRow[]; stale: boolean; cachedAt: number }> => {
    const pageLimit = Math.max(1, Math.min(25, Math.floor(maxPages)));
    // Page 1 tells us whether pagination exists. Remaining pages are independent
    // HTTP requests, so fetch them with a small bounded worker pool instead of
    // serially. This removes the worst-case 25-request waterfall on cold start.
    const first = await getJson<{ standings: { results: StandingsRow[]; has_next: boolean } }>(
      `/leagues-classic/${leagueId}/standings/?page_standings=1`,
      CACHE_TTL_MS.standings,
      { forceRefresh: force },
    );
    const pageResults: Array<{ data: { standings: { results: StandingsRow[]; has_next: boolean } }; stale: boolean; cachedAt: number }> = [first];
    if (first.data.standings?.has_next && pageLimit > 1) {
      let cursor = 2;
      const worker = async () => {
        while (true) {
          const page = cursor++;
          if (page > pageLimit) return;
          pageResults[page - 1] = await getJson<{ standings: { results: StandingsRow[]; has_next: boolean } }>(
            `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
            CACHE_TTL_MS.standings,
            { forceRefresh: force },
          );
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, pageLimit - 1) }, worker));
    }
    const rows: StandingsRow[] = [];
    let stale = false;
    let cachedAt = Date.now();
    for (const result of pageResults.filter(Boolean)) {
      stale = stale || result.stale;
      cachedAt = Math.min(cachedAt, result.cachedAt);
      const results = result.data.standings?.results ?? [];
      for (const r of results) {
        r.player_name = normalizeDisplayName(r.player_name);
        r.entry_name = normalizeDisplayName(r.entry_name);
      }
      rows.push(...results);
    }
    return { data: rows, stale, cachedAt };
  },
};

/**
 * Read only an existing in-memory/persisted cache entry. This is intentionally
 * network-free and is used by the War Room fast path so a cold launch never
 * blocks its first usable render on rival-manager requests.
 */
export async function getCachedJson<T>(path: string): Promise<{ data: T; stale: boolean; cachedAt: number } | null> {
  const memHit = inMemory.get(path);
  if (memHit) {
    return { data: memHit.value as T, stale: false, cachedAt: memHit.cachedAt };
  }
  const persisted = await cacheGet<T>(path);
  return persisted ? { data: persisted.value, stale: false, cachedAt: persisted.cachedAt } : null;
}

/** Network-free cached picks/history helpers for latency-sensitive first paint. */
export const fplCached = {
  picks: (entryId: number, event: number) =>
    getCachedJson<Awaited<ReturnType<typeof fpl.picks>> extends infer R ? R extends { data: infer T } ? T : never : never>(`/entry/${entryId}/event/${event}/picks/`),
  history: (entryId: number) =>
    getCachedJson<Awaited<ReturnType<typeof fpl.history>> extends infer R ? R extends { data: infer T } ? T : never : never>(`/entry/${entryId}/history/`),
  fixtures: (event?: number) =>
    getCachedJson<FplFixture[]>(event ? `/fixtures/?event=${event}` : "/fixtures/"),
};

export function clearInMemoryCache() {
  inMemory.clear();
}
