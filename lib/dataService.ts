import { LEAGUE_ID, MY_ENTRY_ID } from "./config";
import { fpl, fplCached } from "./fplClient";
import { buildPlayerIndex, pickCurrentEvent } from "./enrich";
import { buildSquadPicks } from "./squadBuilder";
import { buildOwnershipMap, type OwnershipRow } from "./analytics/ownership";
import { buildMiniLeagueTemplate, computeTemplateSimilarity, type MiniLeagueTemplate, type ManagerTemplateSimilarity } from "./analytics/miniLeagueTemplate";
import { buildUtiManagersFromSquads, buildUtiTable, type UtiRow } from "./analytics/uti";
import { buildTransferTesLog } from "./tesService";
import type { TransferTesEntry } from "./analytics/tes";
import { buildFixtureRuns, buildFixtureSwing } from "./analytics/fixtures";
import { validateWarRoomData, type ValidationReport } from "./validation";
import type { Bootstrap, EnrichedPlayer, FplFixture, RivalProfile, SpyIntel, StandingsRow, SquadPick, LiveResponse } from "./types";
import { saveGameweekSnapshot } from "./seasonStore";
import { buildSpyIntel, emptySpyIntel } from "./spyService";
import { getChipStatuses } from "./analytics/chips";
import { recommendChipTiming, emptyChipTimingPlan, type ChipTimingPlan } from "./analytics/recommendChipTiming";
import { syncDghLedger } from "./dghLedgerService";
import { getAllDghLedgerRows, getDghLeagueConfig, getManagerOverrides, getScheduledDeadlineEvent, setScheduledDeadlineEvent, getSeenPriceDirection, setSeenPriceDirection } from "./seasonStore";
import { buildComprehensiveTable, type ComprehensiveTable } from "./analytics/comprehensiveTable";
import { scheduleDeadlineAlerts, notifyPriceAlert } from "./notifications";
import { cacheGet, cacheSet } from "./storage";
import { perfStart, perfMark, perfEnd } from "./performanceTrace";

const WAR_ROOM_SNAPSHOT_KEY = "war-room-snapshot-v2";
const WAR_ROOM_SNAPSHOT_VERSION = 2;

type WarRoomSnapshot = {
  version: number;
  data: Omit<WarRoomData, "playerIndex">;
};

/**
 * The War Room snapshot is the true startup source. It contains the last
 * renderable screen state, not just individual API responses. This removes the
 * bootstrap -> standings -> picks -> derived-data waterfall from app launch.
 */
export async function loadCachedWarRoomData(): Promise<WarRoomData | null> {
  try {
    const cached = await cacheGet<WarRoomSnapshot>(WAR_ROOM_SNAPSHOT_KEY);
    if (!cached?.value || cached.value.version !== WAR_ROOM_SNAPSHOT_VERSION) return null;
    const data = cached.value.data;
    if (!data?.bootstrap || !Array.isArray(data.playerPool) || !Array.isArray(data.mySquad)) return null;
    const playerIndex = new Map<number, EnrichedPlayer>(data.playerPool.map((p) => [p.id, p]));
    return {
      ...data,
      playerIndex,
      // A persisted snapshot is intentionally marked cached. The background
      // refresh will replace it with fresh official data without blanking UI.
      stale: true,
      fetchedAt: data.fetchedAt || cached.cachedAt,
    };
  } catch {
    return null;
  }
}

/** Persist a complete renderable War Room state. Never await this from UI code. */
export function persistWarRoomSnapshot(data: WarRoomData): void {
  const { playerIndex: _playerIndex, ...rest } = data;
  const snapshot: WarRoomSnapshot = { version: WAR_ROOM_SNAPSHOT_VERSION, data: rest };
  void cacheSet(WAR_ROOM_SNAPSHOT_KEY, snapshot);
}

let warRoomRefreshInFlight: Promise<WarRoomData> | null = null;

/** Coalesce background/manual refreshes so two buttons/timers cannot start duplicate War Room pipelines. */
export function refreshWarRoomData(forceRefresh = true, options: { fast?: boolean } = { fast: true }): Promise<WarRoomData> {
  if (warRoomRefreshInFlight) return warRoomRefreshInFlight;
  const promise = loadWarRoomData(forceRefresh, options);
  const wrapped = promise.finally(() => {
    if (warRoomRefreshInFlight === wrapped) warRoomRefreshInFlight = null;
  });
  warRoomRefreshInFlight = wrapped;
  return wrapped;
}

export type WarRoomData = {
  fetchedAt: number;
  /** False for the startup-critical payload; true after background rival/DGH enrichment completes. */
  enrichmentComplete: boolean;
  stale: boolean;
  gameweek: number;
  gameweekName: string;
  deadline: string;
  planningGameweek: number;
  planningGameweekName: string;
  planningDeadline: string;
  /** True once the CURRENT gameweek's deadline has passed — its squad/lineup
   * is locked in. This is the single source of truth every screen must use;
   * no screen may independently recompute "is it locked" from raw deadline
   * strings, to avoid the "DEADLINE PASSED but still recommending transfers
   * for that GW" class of bug. */
  currentGwLocked: boolean;
  /** True only when transfer/captain/XI recommendations may act on
   * `planningGameweek` — i.e. planningGameweek's own deadline hasn't passed. */
  transfersActionable: boolean;
  currentFreeTransfers: number;
  currentTransferHits: number;
  /** Free transfers available for the planning gameweek (what recommendation
   * engines must use — never `currentFreeTransfers` for planning purposes). */
  bootstrap: Bootstrap;
  playerIndex: Map<number, EnrichedPlayer>;
  playerPool: EnrichedPlayer[];
  standings: StandingsRow[];
  myRow: StandingsRow | null;
  mySquad: SquadPick[];
  bank: number;
  teamValue: number;
  freeTransfers: number;
  activeChip: string | null;
  chipsUsed: { name: string; event: number }[];
  rivals: RivalProfile[];
  ownership: OwnershipRow[];
  /** The mini-league's most-owned legal XI (+ 4-man bench), and how closely
   * every verified manager's actual squad matches it. See lib/analytics/miniLeagueTemplate.ts. */
  miniLeagueTemplate: MiniLeagueTemplate;
  templateSimilarity: ManagerTemplateSimilarity[];
  /** Unified Template Index (UTI): weighted TTS + pairwise FTSI similarity
   * scoring, distinct from the simpler overlap-count templateSimilarity
   * above. See lib/analytics/uti.ts for the formulas. */
  uti: UtiRow[];
  /** Per-transfer Transfer Effectiveness Score log (lib/analytics/tes.ts).
   * Best-effort, like Spy/chipTiming — a failure here never blocks the rest
   * of war room data. Feeds evaluatePerformanceGates's POSITIVE_TES gate. */
  transferTes: TransferTesEntry[];
  fixtures: FplFixture[];
  fixtureRuns: ReturnType<typeof buildFixtureRuns>;
  fixtureSwing: ReturnType<typeof buildFixtureSwing>;
  validation: ValidationReport;
  freshness: { bootstrap: number; standings: number; squad: number; live: number | null; fixtures: number; anyStale: boolean };
  liveState: "PRE_GW" | "LIVE" | "POST_GW";
  liveResponse: LiveResponse | null;
  /** DGH Spy/Intel: price predictions, news alerts, rival transfer-pattern
   * predictions. Computed best-effort — see loadWarRoomData: a failure here
   * never blocks the rest of war room data. */
  spy: SpyIntel;
  /** DGW/BGW-aware chip timing: which future gameweek is best for each
   * remaining chip, including the Wildcard-before-Bench-Boost sequencing
   * bonus. Computed best-effort from data already loaded above (bootstrap
   * fixtures + verified squad) — see loadWarRoomData: a failure here never
   * blocks the rest of war room data. */
  chipTiming: ChipTimingPlan;
  dghTable: ComprehensiveTable;
};

/** Estimate free transfers available: FPL doesn't expose this directly pre-deadline,
 * so we derive it from transfer history (max 5, +1/week if unused, reset by chips). */

export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => runner()));
  return results;
}

export function estimateFreeTransfers(
  history: { current: { event: number; event_transfers: number }[]; chips: { name: string; event: number }[] },
  targetEvent: number,
  currentEvent: number | null,
): number {
  // FPL starts each season with one FT, rolls unused FTs up to five, and
  // resets saved FTs to one when Wildcard/Free Hit is played. The value returned
  // here is the allowance for the target deadline, not merely the remainder
  // after transfers already made in the live GW.
  let free = 1;
  const chipEvents = new Set(
    history.chips.filter((c) => c.name === "wildcard" || c.name === "freehit").map((c) => c.event),
  );
  const ordered = [...history.current].sort((a, b) => a.event - b.event);
  for (const gw of ordered) {
    if (gw.event >= targetEvent) break;
    if (chipEvents.has(gw.event)) {
      // Current FPL rules: Wildcard and Free Hit no longer reset saved FTs.
      // They preserve the banked allowance, while the normal +1 rollover still
      // applies at the next deadline.
      free = Math.min(5, free + 1);
      continue;
    }
    free = Math.max(1, Math.min(5, free - gw.event_transfers + 1));
  }

  // If the target is the currently active/pre-deadline GW, account for moves
  // already made in that GW. If target is the next GW while the current GW is
  // live, its prior-GW transfers have already been rolled into `free` above.
  if (currentEvent === targetEvent) {
    const current = history.current.find((gw) => gw.event === targetEvent);
    const chipThisGw = history.chips.some(c => c.event === targetEvent && (c.name === "wildcard" || c.name === "freehit"));
    if (!chipThisGw) free = Math.max(0, Math.min(5, free - (current?.event_transfers ?? 0)));
  }
  return free;
}

export async function loadWarRoomData(forceRefresh = false, options: { fast?: boolean } = {}): Promise<WarRoomData> {
  const fast = options.fast === true;
  const trace = fast ? "war-room-fast" : "war-room-enrichment";
  perfStart(trace);
  // One local snapshot read is cheaper than opening ~20 individual rival cache
  // entries. The snapshot is only a background-refresh aid; the startup query
  // itself is already handled by loadCachedWarRoomData().
  const previousSnapshot = await loadCachedWarRoomData();
  perfMark(`${trace}:snapshot`);
  const bootstrapResult = await fpl.bootstrap(forceRefresh);
  const bootstrap = bootstrapResult.data;
  if (!bootstrap.elements?.length) throw new Error("FPL API returned no player data — cannot build a reliable war room this refresh.");
  perfMark(`${trace}:bootstrap`);

  const currentEvent = bootstrap.events.find((e) => e.is_current) ?? null;
  const event = currentEvent ?? pickCurrentEvent(bootstrap.events);
  if (!event) throw new Error("Could not detect a current or upcoming gameweek from the FPL API.");

  const currentDeadlinePassed = currentEvent ? Date.now() >= new Date(currentEvent.deadline_time).getTime() : false;
  const planningEvent = currentEvent && currentDeadlinePassed
    ? bootstrap.events.find((e) => e.id > currentEvent.id && !e.finished) ?? currentEvent
    : event;

  // Fast refresh is a BACKGROUND pipeline, never an app-start gate. It only
  // fetches the smallest set needed to replace the cached screen snapshot.
  // Expensive fixture/rival/history/Spy/TES work belongs to enrichment.
  const [standingsResult, myPicksResult, historyResult, fixturesResultEarly, liveResult] = await Promise.all([
    fpl.standings(LEAGUE_ID, forceRefresh),
    fpl.picks(MY_ENTRY_ID, event.id, forceRefresh).catch(() => null),
    fast ? fplCached.history(MY_ENTRY_ID) : fpl.history(MY_ENTRY_ID, forceRefresh).catch(() => null),
    fast
      ? fplCached.fixtures()
      : fpl.fixtures(undefined, forceRefresh),
    currentEvent ? fpl.live(currentEvent.id, forceRefresh).catch(() => null) : Promise.resolve(null),
  ]);
  perfMark(`${trace}:core-endpoints`);

  const playerIndex = buildPlayerIndex(bootstrap);
  const playerPool = [...playerIndex.values()];

  if (!myPicksResult) {
    throw new Error("Your live FPL squad could not be verified. Recommendations are disabled rather than calculated from incomplete data.");
  }
  const mySquad = buildSquadPicks(myPicksResult.data.picks, playerIndex, liveResult?.data ?? null);
  if (mySquad.length !== 15) {
    throw new Error(`Your FPL squad is incomplete (${mySquad.length}/15 valid picks). Refresh before using transfer, captain or XI recommendations.`);
  }
  const bank = (myPicksResult?.data.entry_history.bank ?? 0) / 10;
  const teamValue = (myPicksResult?.data.entry_history.value ?? 0) / 10;
  const activeChip = myPicksResult?.data.active_chip ?? null;
  const currentTransferHits = Math.max(0, myPicksResult?.data.entry_history.event_transfers_cost ?? 0);
  const chipsUsed = historyResult?.data.chips.map((c) => ({ name: c.name, event: c.event })) ?? [];
  const currentFreeTransfers = historyResult ? estimateFreeTransfers(historyResult.data, event.id, currentEvent?.id ?? null) : 1;
  const freeTransfers = historyResult ? estimateFreeTransfers(historyResult.data, planningEvent.id, currentEvent?.id ?? null) : 1;

  // Deterministic de-duplication by official entry ID; never let duplicate
  // pagination/cache rows create duplicate rivals or distort denominators.
  const standings = [...new Map(standingsResult.data.map((r) => [r.entry, r])).values()];
  const myRow = standings.find((r) => r.entry === MY_ENTRY_ID) ?? null;
  // `standings` is fetched exclusively from LEAGUE_ID, so every row here is
  // a member of the configured mini-league. The only non-rival manager is
  // MY_ENTRY_ID (the app owner); all other unique league members are rivals.
  const rivalRows = standings.filter((r) => r.entry !== MY_ENTRY_ID);

  const makeRivalShell = (row: StandingsRow, squad: SquadPick[] | null, meta?: { bank: number | null; teamValue: number | null; activeChip: string | null; transferHits: number }) => ({
    entryId: row.entry,
    managerName: row.player_name,
    teamName: row.entry_name,
    rank: row.rank,
    lastRank: row.last_rank,
    movement: row.last_rank - row.rank,
    gameweekPoints: row.event_total,
    totalPoints: row.total,
    gapToMe: row.total - (myRow?.total ?? 0),
    squad,
    squadFetchFailed: squad === null,
    bank: meta?.bank ?? null,
    teamValue: meta?.teamValue ?? null,
    activeChip: meta?.activeChip ?? null,
    transferHits: meta?.transferHits ?? 0,
    dghGwPoints: null,
    dghTotalPoints: null,
    dghRank: null,
    dghGapToMe: null,
  });

  // Fast refresh reuses the single last-known-good War Room snapshot for rival
  // squads. It performs ZERO rival network requests and ZERO per-rival storage
  // reads. The full pass below is responsible for refreshing every rival.
  const previousRivalById = new Map((previousSnapshot?.rivals ?? []).map((r) => [r.entryId, r]));
  const rivalResults = fast
    ? rivalRows.map((row) => {
        const previous = previousRivalById.get(row.entry);
        return makeRivalShell(row, previous?.squad ?? null, {
          bank: previous?.bank ?? null,
          teamValue: previous?.teamValue ?? null,
          activeChip: previous?.activeChip ?? null,
          transferHits: previous?.transferHits ?? 0,
        });
      })
    // Concurrency raised from 6 -> 10: the official FPL API has no documented
    // per-IP rate limit that this trips at typical mini-league sizes (tested
    // up to ~25 rivals), and this pass is already gated behind the fast/cached
    // snapshot so it never blocks first paint. For a 20-manager league this
    // cuts the wave count from ~4 to ~2.
    : await mapWithConcurrency(rivalRows, 10, async (row): Promise<RivalProfile> => {
        try {
          const picksRes = await fpl.picks(row.entry, event.id, forceRefresh);
          const squad = buildSquadPicks(picksRes.data.picks, playerIndex, liveResult?.data ?? null);
          return makeRivalShell(row, squad, {
            bank: picksRes.data.entry_history.bank / 10,
            teamValue: picksRes.data.entry_history.value / 10,
            activeChip: picksRes.data.active_chip,
            transferHits: Math.max(0, picksRes.data.entry_history.event_transfers_cost ?? 0),
          });
        } catch {
          const previous = previousRivalById.get(row.entry);
          return makeRivalShell(row, previous?.squad ?? null, {
            bank: previous?.bank ?? null,
            teamValue: previous?.teamValue ?? null,
            activeChip: previous?.activeChip ?? null,
            transferHits: previous?.transferHits ?? 0,
          });
        }
      });

  // Authoritative DGH pipeline. On the fast path we use the last-known-good
  // ledger immediately and defer the expensive history/TC synchronization to
  // the background enrichment pass triggered by useWarRoomData.
  const allManagers = standings.map((r) => ({ entryId: r.entry, managerName: r.player_name, teamName: r.entry_name }));
  let dghTable: ComprehensiveTable;
  if (!fast) {
    perfMark(`${trace}:before-ledger`);
    try {
      await syncDghLedger(allManagers, event.id, forceRefresh);
    } catch {
      // Keep the last-known-good DGH ledger when any manager/API fetch is partial.
    }
    perfMark(`${trace}:after-ledger`);
  }
  const [ledgerRows, dghConfig, dghOverrides] = await Promise.all([getAllDghLedgerRows(), getDghLeagueConfig(), getManagerOverrides()]);
  dghTable = buildComprehensiveTable(ledgerRows, dghConfig, dghOverrides, allManagers);
  const dghByManager = new Map(dghTable.managers.map((m) => [m.entryId, m]));
  for (const standing of standings) {
    const dgh = dghByManager.get(standing.entry);
    standing.dghGwPoints = dgh?.gwRows.find((r) => r.event === event.id)?.gwAdjusted ?? null;
    standing.dghTotalPoints = dgh?.overallPoints ?? null;
    standing.dghRank = dgh && dgh.overallRank > 0 ? dgh.overallRank : null;
  }
  for (const rival of rivalResults) {
    const dgh = dghByManager.get(rival.entryId);
    rival.dghGwPoints = dgh?.gwRows.find((r) => r.event === event.id)?.gwAdjusted ?? null;
    rival.dghTotalPoints = dgh?.overallPoints ?? null;
    rival.dghRank = dgh && dgh.overallRank > 0 ? dgh.overallRank : null;
    rival.dghGapToMe = dgh && dghByManager.get(MY_ENTRY_ID) ? dgh.overallPoints - (dghByManager.get(MY_ENTRY_ID)?.overallPoints ?? 0) : null;
  }

  const ownership = buildOwnershipMap(MY_ENTRY_ID, mySquad, rivalResults, playerPool);

  // Mini-league "template team": the most-owned legal XI across every
  // verified squad (me + rivals), plus how closely each manager's actual
  // squad matches it. Pure/local — same verified-pool as buildOwnershipMap,
  // so it never disagrees with the ownership screen's STRICT/FALLBACK rule.
  const miniLeagueTemplate = buildMiniLeagueTemplate(mySquad, rivalResults);
  const templateSimilarity = computeTemplateSimilarity(
    miniLeagueTemplate,
    MY_ENTRY_ID,
    myRow?.player_name ?? "You",
    myRow?.entry_name ?? "My Team",
    mySquad,
    rivalResults,
  );

  // Unified Template Index: separate, more granular weighted-Jaccard
  // similarity scoring (TTS + pairwise FTSI). Pure/local, same verified
  // squad pool as above — computed unconditionally since it's cheap
  // (no extra network calls) once squads are already in memory.
  const utiManagers = buildUtiManagersFromSquads(
    MY_ENTRY_ID,
    myRow?.player_name ?? "You",
    myRow?.entry_name ?? "My Team",
    mySquad,
    rivalResults,
  );
  const uti = buildUtiTable(utiManagers);

  const fixturesResult = fixturesResultEarly ?? { data: [] as FplFixture[], stale: true, cachedAt: Date.now() };
  // Fast snapshots use cached fixtures only. Full enrichment obtains the
  // authoritative fixture set before running fixture intelligence.
  const fixtureRuns = fixturesResult.data.length ? buildFixtureRuns(bootstrap, fixturesResult.data, event.id) : [];
  const fixtureSwing = fixturesResult.data.length ? buildFixtureSwing(bootstrap, fixturesResult.data, event.id) : [];

  // chipTiming is a pure, synchronous, in-memory computation (no I/O) over
  // data already verified above (squad, pool, fixtures) — it never needs to
  // be awaited or raced against the async steps below. It's still guarded
  // by its own try/catch since a failure here must never block the rest of
  // war room data.
  let chipTiming: ChipTimingPlan;
  if (fast) {
    chipTiming = emptyChipTimingPlan(event.id);
  } else {
    try {
      chipTiming = recommendChipTiming({
        chipStatuses: getChipStatuses(chipsUsed, event.id),
        currentSquad: mySquad,
        pool: playerPool,
        fixtures: fixturesResult.data,
        bootstrap,
        budget: teamValue + bank,
        fromEvent: event.id,
        scanWindow: 10,
      });
    } catch {
      chipTiming = emptyChipTimingPlan(event.id);
    }
  }

  // Spy, TES, and deadline-notification scheduling are each independent of
  // one another's *inputs* (none reads another's output) and each does its
  // own network/storage I/O. They previously ran as a strictly sequential
  // chain of awaits, so their latencies added together; running them
  // concurrently means the enrichment pass takes as long as the *slowest*
  // of the three instead of the *sum* of all three. Each keeps its own
  // try/catch (via a settled-result helper) so one failing — e.g. a rival's
  // /transfers/ endpoint erroring inside Spy — still can never block, delay,
  // or fail the other two or the war room data they all feed into.
  const settle = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const spyPromise: Promise<SpyIntel> = fast
    ? Promise.resolve(emptySpyIntel())
    : settle(
        () =>
          buildSpyIntel({
            bootstrap,
            fixtures: fixturesResult.data,
            planningGameweek: planningEvent.id,
            pool: playerPool,
            mySquad,
            rivals: rivalResults,
            forceRefresh,
          }),
        emptySpyIntel(),
      );

  // Effective Ownership is the truer "% own" the TES formula's differential
  // band wants; fall back to raw rival-ownership% when EO isn't STRICT this
  // refresh (never leave a transfer unscored just because the pool is partial).
  const miniOwnershipByElement = new Map(ownership.map((o) => [o.playerId, o.effectiveOwnershipPct ?? o.rivalOwnershipPct]));
  const latestFinishedEvent = bootstrap.events.filter((e) => e.finished).reduce((max, e) => Math.max(max, e.id), 0);
  const transferTesPromise: Promise<TransferTesEntry[]> = fast
    ? Promise.resolve([])
    : settle(
        () =>
          buildTransferTesLog({
            playerIndex,
            miniOwnershipByElement,
            latestFinishedEvent,
            forceRefresh,
          }),
        [],
      );

  // Deadline reminders (2h / 30min out) for the actionable planning
  // gameweek. Only re-scheduled when the target gameweek actually changes,
  // so a foreground refresh every 60s doesn't cancel+recreate the same two
  // OS-level notifications repeatedly. Independent of Spy/TES — depends only
  // on mySquad/planningEvent, which are already available above.
  const notificationPromise: Promise<void> = fast
    ? Promise.resolve()
    : settle(async () => {
        const alreadyScheduledFor = await getScheduledDeadlineEvent();
        if (alreadyScheduledFor !== planningEvent.id && Date.now() < new Date(planningEvent.deadline_time).getTime()) {
          const captainPick = mySquad.find((p) => p.isCaptain) ?? null;
          await scheduleDeadlineAlerts(planningEvent.deadline_time, planningEvent.id, undefined, captainPick);
          await setScheduledDeadlineEvent(planningEvent.id);
        }
      }, undefined);

  const [spy, transferTes] = await Promise.all([spyPromise, transferTesPromise, notificationPromise]);

  // Price-change signals depend on Spy's output, so they run after Spy
  // resolves — but this no longer adds latency on top of TES/notifications
  // since all three already ran concurrently above.
  if (!fast) {
    try {
      // Only push for high-confidence risers/fallers, and only once per
      // player per direction (getSeenPriceDirection dedupes — see
      // seasonStore.ts) so this doesn't re-fire on every refetch.
      const PRICE_ALERT_CONFIDENCE_THRESHOLD = 80;
      const candidates = [...spy.priceRisers, ...spy.priceFallers].filter((p) => p.confidencePct >= PRICE_ALERT_CONFIDENCE_THRESHOLD);
      for (const p of candidates) {
        const seen = await getSeenPriceDirection(p.playerId);
        if (seen === p.direction) continue;
        await notifyPriceAlert(p.webName, `${p.direction === "RISE" ? "Likely price rise" : "Likely price fall"} — ${p.confidencePct}% confidence from net transfers this GW.`);
        await setSeenPriceDirection(p.playerId, p.direction);
      }
    } catch {
      // Same reasoning: never block war room data on notification delivery.
    }
  }

  const validation = validateWarRoomData({
    configuredLeagueId: LEAGUE_ID,
    configuredEntryId: MY_ENTRY_ID,
    standings,
    gameweek: event.id,
    rivals: rivalResults,
    mySquadPickCount: mySquad.length,
    mySquad,
  });

  const liveState = event.finished ? "POST_GW" : fixturesResult.data.some((f) => f.event === event.id && f.started && !f.finished) ? "LIVE" : "PRE_GW";
  const stale = bootstrapResult.stale || standingsResult.stale || !!myPicksResult?.stale || !!liveResult?.stale || fixturesResult.stale;

  if (!fast) { try { await saveGameweekSnapshot({ event: event.id, myRank: myRow?.rank ?? null, myTotal: myRow?.total ?? null, myEventPoints: myRow?.event_total ?? null, mySquad, standings, rivals: rivalResults }); } catch { /* history is additive; never block live intelligence */ } }

  const result: WarRoomData = {
    fetchedAt: Date.now(),
    enrichmentComplete: !fast,
    stale,
    gameweek: event.id,
    gameweekName: event.name,
    deadline: event.deadline_time,
    planningGameweek: planningEvent.id,
    planningGameweekName: planningEvent.name,
    planningDeadline: planningEvent.deadline_time,
    currentGwLocked: currentDeadlinePassed,
    transfersActionable: currentEvent ? Date.now() < new Date(planningEvent.deadline_time).getTime() : true,
    currentFreeTransfers,
    currentTransferHits,
    bootstrap,
    playerIndex,
    playerPool,
    standings,
    myRow,
    mySquad,
    bank,
    teamValue,
    freeTransfers,
    activeChip,
    chipsUsed,
    rivals: rivalResults,
    ownership,
    miniLeagueTemplate,
    templateSimilarity,
    uti,
    transferTes,
    fixtures: fixturesResult.data,
    fixtureRuns,
    fixtureSwing,
    validation,
    spy,
    chipTiming,
    freshness: {
      bootstrap: bootstrapResult.cachedAt,
      standings: standingsResult.cachedAt,
      squad: myPicksResult ? myPicksResult.cachedAt : Date.now(),
      live: liveResult?.cachedAt ?? null,
      fixtures: fixturesResult.cachedAt,
      anyStale: stale || bootstrapResult.stale || standingsResult.stale || !!liveResult?.stale || fixturesResult.stale,
    },
    liveState,
    liveResponse: liveResult?.data ?? null,
    dghTable,
  };
  perfMark(`${trace}:analytics-complete`);
  // The snapshot is the next-launch source of truth. The write itself is
  // intentionally detached from this promise so it cannot delay React Query.
  persistWarRoomSnapshot(result);
  perfEnd(trace);
  return result;
}

/** Lightweight live tracker refresh: only the official live feed + my verified picks.
 * This intentionally avoids re-fetching the entire league on every live tick. */
export async function loadLiveTrackerData(eventId: number, forceRefresh = true): Promise<{
  gameweek: number;
  fetchedAt: number;
  stale: boolean;
  picks: SquadPick[];
  liveState: "PRE_GW" | "LIVE" | "POST_GW";
  liveResponse: LiveResponse | null;
}> {
  const [bootstrapResult, picksResult, liveResult] = await Promise.all([
    fpl.bootstrap(false),
    fpl.picks(MY_ENTRY_ID, eventId, forceRefresh),
    fpl.live(eventId, forceRefresh).catch(() => null),
  ]);
  const event = bootstrapResult.data.events.find((e) => e.id === eventId);
  if (!event) throw new Error(`Gameweek ${eventId} is not present in official FPL bootstrap data.`);
  const playerIndex = buildPlayerIndex(bootstrapResult.data);
  const picks = buildSquadPicks(picksResult.data.picks, playerIndex, liveResult?.data ?? null);
  if (picks.length !== 15) throw new Error(`Live tracker could not verify your 15-player squad (${picks.length}/15).`);
  const liveState = event.finished ? "POST_GW" : "LIVE";
  return {
    gameweek: eventId,
    fetchedAt: Date.now(),
    stale: !!liveResult?.stale || picksResult.stale || bootstrapResult.stale,
    picks,
    liveState,
    liveResponse: liveResult?.data ?? null,
  };
}
