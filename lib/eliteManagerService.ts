import { fpl } from "./fplClient";
import { buildSquadPicks } from "./squadBuilder";
import { mapWithConcurrency } from "./dataService";
import { OVERALL_LEAGUE_ID, type EliteManagerSquad } from "./analytics/eliteManager";
import type { EnrichedPlayer, LiveResponse } from "./types";

/** On-demand fetch only — never part of the main war-room load, since it
 * pulls ~50 additional official /entry/{id}/picks/ requests. Sampled from
 * the real top of the official global Overall league (id 314). */
export async function loadEliteManagers(
  gameweek: number,
  playerIndex: Map<number, EnrichedPlayer>,
  sampleSize = 50,
  forceRefresh = false,
  live: LiveResponse | null = null,
): Promise<{ elites: EliteManagerSquad[]; stale: boolean }> {
  const pages = Math.max(1, Math.ceil(sampleSize / 50));
  const standingsResult = await fpl.standings(OVERALL_LEAGUE_ID, forceRefresh, pages);
  const top = standingsResult.data.slice(0, sampleSize);

  const elites = await mapWithConcurrency(top, 4, async (row): Promise<EliteManagerSquad> => {
    try {
      const picksRes = await fpl.picks(row.entry, gameweek, forceRefresh);
      const squad = buildSquadPicks(picksRes.data.picks, playerIndex, live);
      return {
        entryId: row.entry,
        managerName: row.player_name,
        teamName: row.entry_name,
        overallRank: row.rank,
        squad,
        activeChip: picksRes.data.active_chip,
        fetchFailed: false,
      };
    } catch {
      return {
        entryId: row.entry,
        managerName: row.player_name,
        teamName: row.entry_name,
        overallRank: row.rank,
        squad: null,
        activeChip: null,
        fetchFailed: true,
      };
    }
  });

  return { elites, stale: standingsResult.stale };
}
