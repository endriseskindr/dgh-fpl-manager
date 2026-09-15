import type { EnrichedPlayer } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import { newsPenaltyScore } from "./newsIntel";

/**
 * Multi-GW transfer horizon, ported from x402-fpl-api-main's transfers.py
 * (`_player_value_score`). PORT_NOTES.md flagged this as open: DGH's
 * transferEngine.ts / projection.ts only project the NEXT gameweek; this
 * adds a GW / GW+1 / GW+2 weighted outlook as a SEPARATE signal shown
 * alongside the existing next-GW optimizer — it does not replace
 * transferEngine's beam search, so nothing already working changes.
 *
 * Weights (unchanged from source): this GW 1.0, GW+1 0.5, GW+2 0.3.
 *
 * OMITTED vs the source: x402 also adds a defensive-contribution-per-90
 * bonus for defenders. DGH's EnrichedPlayer/FplElement doesn't carry
 * `defensive_contribution_per_90` (not fetched from bootstrap-static today),
 * so that term is left out rather than approximated from something else.
 */
const GW_WEIGHTS = [1.0, 0.5, 0.3];
const UNAVAILABLE_STATUSES = new Set(["i", "d", "s", "u"]);

export type HorizonFixture = { event: number | null; opponentShort: string; isHome: boolean; difficulty: number; weight: number };

export type MultiGwValue = {
  playerId: number;
  score: number;
  horizonFixtures: HorizonFixture[];
};

export function multiGwValueScore(player: EnrichedPlayer, run: TeamFixtureRun | undefined): MultiGwValue {
  let fixtureScore = 0;
  const horizonFixtures: HorizonFixture[] = [];
  const fixtures = (run?.next ?? []).slice(0, GW_WEIGHTS.length);
  fixtures.forEach((f, i) => {
    const weight = GW_WEIGHTS[i] ?? 0.2;
    fixtureScore += (-f.difficulty * 1.0 + (f.isHome ? 0.5 : 0)) * weight;
    horizonFixtures.push({ ...f, weight });
  });

  let score = player.form * 2.0 + player.pointsPerGame * 1.0 + fixtureScore;
  if (UNAVAILABLE_STATUSES.has(player.status)) score -= 5;
  score += newsPenaltyScore(player.availability.news);

  return { playerId: player.id, score: Math.round(score * 100) / 100, horizonFixtures };
}

export function buildMultiGwHorizon(pool: EnrichedPlayer[], runsByTeam: Map<number, TeamFixtureRun>): Map<number, MultiGwValue> {
  const out = new Map<number, MultiGwValue>();
  for (const p of pool) out.set(p.id, multiGwValueScore(p, runsByTeam.get(p.teamId)));
  return out;
}
