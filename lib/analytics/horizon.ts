import type { EnrichedPlayer, SquadPick } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import { projectNextGw } from "./projection";

export type HorizonProjection = { horizon: 1 | 3 | 5; expectedPoints: number; fixtureAdjusted: number };

/** Lightweight multi-GW outlook using the same authoritative next-GW projection and
 * official FPL fixture difficulty. It is deliberately an outlook, not a fake xPts model. */
/** Average a team's fixture difficulty over just the first `windowSize` upcoming
 * fixtures (not the full lookahead), so a 1-GW horizon reflects GW1's difficulty
 * only, a 3-GW horizon reflects the difficulty of those specific 3 games, etc.
 * This also naturally reflects blanks (fewer than windowSize fixtures found). */
function windowedDifficulty(run: TeamFixtureRun | undefined, windowSize: number): { avgDifficulty: number; gamesFound: number } {
  if (!run || run.next.length === 0) return { avgDifficulty: 3, gamesFound: 0 };
  const slice = run.next.slice(0, windowSize);
  const avgDifficulty = slice.reduce((s, f) => s + f.difficulty, 0) / slice.length;
  return { avgDifficulty, gamesFound: slice.length };
}

export function projectHorizon(squad: SquadPick[], runs: TeamFixtureRun[]): HorizonProjection[] {
  const runByTeam = new Map(runs.map((r) => [r.teamId, r]));
  const xi = squad.filter((p) => p.isXI);
  const captain = squad.find((p) => p.isCaptain);
  const perGwBase = xi.reduce((sum, p) => sum + projectNextGw(p.player), 0) + (captain ? projectNextGw(captain.player) : 0);

  return [1, 3, 5].map((h) => {
    // Per-player fixture factor for exactly this horizon's window, then averaged —
    // not a single blended 5-GW-lookahead number reused for every horizon.
    let weightedFactor = 0;
    let totalGamesFound = 0;
    for (const p of xi) {
      const { avgDifficulty, gamesFound } = windowedDifficulty(runByTeam.get(p.player.teamId), h);
      const factor = Math.max(0.78, Math.min(1.18, 1 + (3 - avgDifficulty) * 0.07));
      weightedFactor += factor * gamesFound;
      totalGamesFound += gamesFound;
    }
    const avgGamesPerPlayer = xi.length > 0 ? totalGamesFound / xi.length : h;
    const fixtureFactor = totalGamesFound > 0 ? weightedFactor / totalGamesFound : 1;
    // Use the actual average number of fixtures found in this window (accounts for
    // blanks/doubles) rather than assuming exactly `h` games are played.
    const expectedPoints = perGwBase * avgGamesPerPlayer;
    return {
      horizon: h as 1 | 3 | 5,
      expectedPoints: Math.round(expectedPoints * 10) / 10,
      fixtureAdjusted: Math.round(expectedPoints * fixtureFactor * 10) / 10,
    };
  });
}

export function fixtureAdjustedPlayerProjection(player: EnrichedPlayer, run: TeamFixtureRun | undefined, horizon: 3 | 5): number {
  const difficulty = run?.averageDifficulty ?? 3;
  const factor = Math.max(0.78, Math.min(1.18, 1 + (3 - difficulty) * 0.07));
  return Math.round(projectNextGw(player) * horizon * factor * (horizon === 3 ? 0.98 : 0.96) * 10) / 10;
}
