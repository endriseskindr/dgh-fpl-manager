import type { SquadPick } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import { projectNextGw } from "./projection";

/**
 * Genuine per-gameweek forecast — unlike projectHorizon() (which blends a
 * whole 1/3/5-GW window into one number), this walks each real upcoming
 * gameweek individually using each fixture's actual `event` id, so blanks
 * (team has no fixture that GW) and doubles (team has two) show up exactly
 * where they happen rather than being smoothed away.
 *
 * Assumes the current XI/captain holds for the whole window — same
 * simplifying assumption projectHorizon() already makes, stated explicitly
 * here so callers can surface it in the UI.
 */
export type GwForecastPoint = {
  gw: number;
  expectedPoints: number;
  fixtureAdjusted: number;
  blanks: string[];
  doubles: string[];
};

function difficultyFactor(difficulty: number): number {
  return Math.max(0.78, Math.min(1.18, 1 + (3 - difficulty) * 0.07));
}

export function projectPerGw(squad: SquadPick[], runs: TeamFixtureRun[], numGws = 5): GwForecastPoint[] {
  const runByTeam = new Map(runs.map((r) => [r.teamId, r]));
  const xi = squad.filter((p) => p.isXI);
  const captain = squad.find((p) => p.isCaptain);

  const gwSet = new Set<number>();
  for (const r of runs) for (const f of r.next) if (f.event != null) gwSet.add(f.event);
  const gws = [...gwSet].sort((a, b) => a - b).slice(0, numGws);

  return gws.map((gw) => {
    let expectedPoints = 0;
    let fixtureAdjusted = 0;
    const blanks: string[] = [];
    const doubles: string[] = [];
    for (const p of xi) {
      const run = runByTeam.get(p.player.teamId);
      const fixturesThisGw = (run?.next ?? []).filter((f) => f.event === gw);
      const base = projectNextGw(p.player);
      const multiplier = captain?.playerId === p.playerId ? 2 : 1;
      if (fixturesThisGw.length === 0) {
        blanks.push(p.player.webName);
        continue;
      }
      if (fixturesThisGw.length > 1) doubles.push(p.player.webName);
      for (const f of fixturesThisGw) {
        expectedPoints += base * multiplier;
        fixtureAdjusted += base * multiplier * difficultyFactor(f.difficulty);
      }
    }
    return {
      gw,
      expectedPoints: Math.round(expectedPoints * 10) / 10,
      fixtureAdjusted: Math.round(fixtureAdjusted * 10) / 10,
      blanks,
      doubles,
    };
  });
}

/** Applies a set of already-validated {out,in} moves to a squad clone — used to
 * preview "squad after the recommended transfer" without touching real data. */
export function applyMovesToSquad(squad: SquadPick[], moves: { out: { id: number }; in: SquadPick["player"] }[]): SquadPick[] {
  let working = squad;
  for (const m of moves) {
    working = working.map((p) => (p.playerId === m.out.id ? { ...p, playerId: m.in.id, player: m.in, isCaptain: false, isViceCaptain: false, livePoints: 0 } : p));
  }
  return working;
}
