import { fpl, FplFetchError } from "./fplClient";
import { buildSquadPicks } from "./squadBuilder";
import { cacheGet, cacheSet } from "./storage";
import type { EnrichedPlayer, LiveResponse, SquadPick } from "./types";

export type ManagerRankHistoryPoint = {
  event: number;
  points: number;
  totalPoints: number;
  overallRank: number;
  bank: number;
  value: number;
  eventTransfers: number;
  eventTransfersCost: number;
  pointsOnBench: number;
};

export type ManagerSeasonSummary = {
  seasonName: string;
  totalPoints: number;
  rank: number;
};

export type ManagerChipUsage = { name: string; event: number };

export type ManagerProfile = {
  entryId: number;
  managerName: string;
  teamName: string;
  overallPoints: number;
  overallRank: number;
  currentEventPoints: number;
  currentEvent: number;
  bank: number;
  teamValue: number;
  totalTransfers: number;
  rankHistory: ManagerRankHistoryPoint[];
  chipsUsed: ManagerChipUsage[];
  pastSeasons: ManagerSeasonSummary[];
  /** Current gameweek's squad, if the requested event's picks are published
   * and the manager's team isn't private. null (not fabricated) otherwise. */
  currentSquad: SquadPick[] | null;
  squadFetchFailed: boolean;
};

export class ManagerLookupError extends Error {
  constructor(
    message: string,
    public readonly kind: "NOT_FOUND" | "PRIVATE_OR_UNAVAILABLE" | "NETWORK",
  ) {
    super(message);
    this.name = "ManagerLookupError";
  }
}

/**
 * Manager profile lookup — item 27 of the master feature list. Unlike
 * RivalProfile (which only ever covers managers already inside the
 * configured mini-league's standings), this looks up ANY entry ID directly
 * against the official FPL API, independent of league membership. There is
 * no public FPL endpoint for searching by manager/team *name* — only by
 * numeric entry ID — so this is an ID-based lookup, same as every other
 * manager-scoped call the app already makes (rival squads, DGH ledger,
 * etc.) via lib/fplClient.ts.
 */
export async function lookupManagerProfile(
  entryId: number,
  playerIndex: Map<number, EnrichedPlayer>,
  liveResponse: LiveResponse | null,
  currentEventId: number,
  force = false,
): Promise<ManagerProfile> {
  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new ManagerLookupError("Enter a valid numeric FPL entry ID.", "NOT_FOUND");
  }

  let entry;
  try {
    entry = await fpl.entry(entryId, force);
  } catch (err) {
    if (err instanceof FplFetchError && err.status === 404) {
      throw new ManagerLookupError(`No manager found with entry ID ${entryId}.`, "NOT_FOUND");
    }
    throw new ManagerLookupError(`Could not reach the FPL API for entry ${entryId}.`, "NETWORK");
  }

  let history;
  try {
    const historyResult = await fpl.history(entryId, force);
    history = historyResult.data;
  } catch {
    history = { current: [], chips: [], past: [] };
  }

  const rankHistory: ManagerRankHistoryPoint[] = history.current.map((row) => ({
    event: row.event,
    points: row.points,
    totalPoints: row.total_points,
    overallRank: row.overall_rank,
    bank: row.bank / 10,
    value: row.value / 10,
    eventTransfers: row.event_transfers,
    eventTransfersCost: row.event_transfers_cost,
    pointsOnBench: row.points_on_bench,
  }));

  let currentSquad: SquadPick[] | null = null;
  let squadFetchFailed = false;
  try {
    const picks = await fpl.picks(entryId, currentEventId, force);
    currentSquad = buildSquadPicks(picks.data.picks, playerIndex, liveResponse);
  } catch {
    // Private team, or this event's picks aren't published yet — never
    // fabricate a squad, just flag it, matching RivalProfile's convention.
    squadFetchFailed = true;
  }

  return {
    entryId: entry.data.id,
    managerName: `${entry.data.player_first_name} ${entry.data.player_last_name}`.trim(),
    teamName: entry.data.name,
    overallPoints: entry.data.summary_overall_points,
    overallRank: entry.data.summary_overall_rank,
    currentEventPoints: entry.data.summary_event_points,
    currentEvent: entry.data.current_event,
    bank: entry.data.last_deadline_bank / 10,
    teamValue: entry.data.last_deadline_value / 10,
    totalTransfers: entry.data.last_deadline_total_transfers,
    rankHistory,
    chipsUsed: history.chips,
    pastSeasons: history.past.map((p) => ({ seasonName: p.season_name, totalPoints: p.total_points, rank: p.rank })),
    currentSquad,
    squadFetchFailed,
  };
}

const RECENT_LOOKUPS_KEY = "dgh_recent_manager_lookups";
const MAX_RECENT = 10;

export async function getRecentManagerLookups(): Promise<{ entryId: number; managerName: string; teamName: string }[]> {
  try {
    const cached = await cacheGet<{ entryId: number; managerName: string; teamName: string }[]>(RECENT_LOOKUPS_KEY);
    return cached?.value ?? [];
  } catch {
    return [];
  }
}

export async function pushRecentManagerLookup(entry: { entryId: number; managerName: string; teamName: string }): Promise<void> {
  try {
    const existing = (await cacheGet<{ entryId: number; managerName: string; teamName: string }[]>(RECENT_LOOKUPS_KEY))?.value ?? [];
    const next = [entry, ...existing.filter((e) => e.entryId !== entry.entryId)].slice(0, MAX_RECENT);
    await cacheSet(RECENT_LOOKUPS_KEY, next);
  } catch {
    // Best-effort — recent-lookups history is a convenience, never blocking.
  }
}
