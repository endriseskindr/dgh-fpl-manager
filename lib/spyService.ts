import { fpl } from "./fplClient";
import { buildFixtureRuns } from "./analytics/fixtures";
import { buildPricePredictions } from "./analytics/priceIntel";
import { buildNewsAlerts } from "./analytics/newsIntel";
import { buildFixtureRunLookup, predictTransferIn, predictTransferOut } from "./analytics/rivalIntel";
import type { Bootstrap, EnrichedPlayer, FplFixture, RivalPrediction, RivalProfile, SpyIntel, SquadPick } from "./types";

/**
 * DGH Spy — assembles the net-new intelligence feed: price predictions,
 * news/injury alerts (mine + rivals'), and rival transfer-pattern
 * predictions. This is the feature PORT_NOTES.md flagged as not existing
 * anywhere in either DGH or fpl_spy-main — built from scratch here, on top
 * of the ported priceIntel/newsIntel/rivalIntel modules.
 *
 * Deliberately isolated from dataService.ts's main load path in its own
 * try/catch at the call site: a Spy computation failure (e.g. a rival's
 * /transfers/ endpoint erroring) must never block the core war room data
 * the rest of the app depends on.
 */


export async function buildSpyIntel(input: {
  bootstrap: Bootstrap;
  fixtures: FplFixture[];
  planningGameweek: number;
  pool: EnrichedPlayer[];
  mySquad: SquadPick[];
  rivals: RivalProfile[];
  forceRefresh?: boolean;
}): Promise<SpyIntel> {
  const { risers, fallers } = buildPricePredictions(input.pool);

  const newsSubjects: { player: EnrichedPlayer; ownerLabel: string; isMine: boolean }[] = [
    ...input.mySquad.map((s) => ({ player: s.player, ownerLabel: "My squad", isMine: true })),
    ...input.rivals.flatMap((r) => (r.squad ?? []).map((s) => ({ player: s.player, ownerLabel: r.teamName, isMine: false }))),
  ];
  const newsAlerts = buildNewsAlerts(newsSubjects);

  // Next-GW-only fixture view for urgency/weakness scoring — the source
  // material reasons about a single target gameweek, not a multi-GW average.
  const nextGwRuns = buildFixtureRuns(input.bootstrap, input.fixtures, input.planningGameweek, 1);
  const fixtureRunByTeam = buildFixtureRunLookup(nextGwRuns);

  // Every manager in the DGH mini-league is a rival. Never rank/filter/cap
  // this pool for analytics; unavailable squad/history data is represented by
  // an empty prediction so the rival itself remains in the result set.
  const allRivals = [...input.rivals];

  const playerNameById = new Map(input.pool.map((p) => [p.id, p.webName]));

  const rivalPredictions = await Promise.all(
    allRivals.map(async (rival): Promise<RivalPrediction> => {
      if (!rival.squad) return {
        entryId: rival.entryId, managerName: rival.managerName, teamName: rival.teamName,
        recentTransfers: [], likelyOut: [], likelyIn: [],
      };
      let recentTransfers: RivalPrediction["recentTransfers"] = [];
      try {
        const transfersRes = await fpl.transfers(rival.entryId, input.forceRefresh);
        recentTransfers = transfersRes.data
          .filter((t) => t.event >= input.planningGameweek - 2)
          .slice(0, 6)
          .map((t) => ({
            gw: t.event,
            inName: playerNameById.get(t.element_in) ?? `#${t.element_in}`,
            outName: playerNameById.get(t.element_out) ?? `#${t.element_out}`,
          }));
      } catch {
        recentTransfers = []; // non-fatal — prediction still runs from squad state
      }
      const rivalPlayerIds = new Set(rival.squad.map((s) => s.playerId));
      return {
        entryId: rival.entryId,
        managerName: rival.managerName,
        teamName: rival.teamName,
        recentTransfers,
        likelyOut: predictTransferOut(rival.squad, fixtureRunByTeam),
        likelyIn: predictTransferIn(input.pool, rivalPlayerIds, fixtureRunByTeam),
      };
    }),
  );

  return {
    computedAt: Date.now(),
    priceRisers: risers,
    priceFallers: fallers,
    newsAlerts,
    rivalPredictions,
  };
}

export function emptySpyIntel(): SpyIntel {
  return { computedAt: Date.now(), priceRisers: [], priceFallers: [], newsAlerts: [], rivalPredictions: [] };
}
