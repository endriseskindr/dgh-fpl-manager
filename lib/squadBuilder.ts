import type { EnrichedPlayer, FplFixture, FplPick, LiveResponse, SquadPick } from "./types";

export function buildSquadPicks(picks: FplPick[], playerIndex: Map<number, EnrichedPlayer>, live: LiveResponse | null): SquadPick[] {
  const liveById = new Map((live?.elements ?? []).map((e) => [e.id, e.stats]));
  return picks
    .map((pick): SquadPick | null => {
      const player = playerIndex.get(pick.element);
      if (!player) return null;
      const stats = liveById.get(pick.element);
      return {
        playerId: pick.element,
        player,
        slot: pick.position,
        isXI: pick.position <= 11,
        isBench: pick.position > 11,
        benchOrder: pick.position > 11 ? pick.position - 11 : null,
        multiplier: pick.multiplier,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        // Keep raw official live points here; DGH/FPL scoring layers apply captain,
        // bench and automatic-substitution rules explicitly.
        livePoints: stats?.total_points ?? 0,
        purchasePrice: pick.purchase_price != null ? pick.purchase_price / 10 : undefined,
        sellingPrice: pick.selling_price != null ? pick.selling_price / 10 : undefined,
        liveBonus: stats?.bonus ?? 0,
        liveMinutes: stats?.minutes ?? 0,
        liveYellowCards: stats?.yellow_cards ?? 0,
        liveRedCards: stats?.red_cards ?? 0,
      };
    })
    .filter((p): p is SquadPick => p !== null)
    .sort((a, b) => a.slot - b.slot);
}


/** Official-live-feed points for a manager's current squad. This is the simple
 * FPL pick-multiplier view used by legacy callers. For the DGH live table use
 * calculateLiveDghScore(), which also applies automatic substitutions and DGH
 * chip deductions. */
export function calculateLiveSquadPoints(squad: SquadPick[]): number {
  return squad.reduce((sum, pick) => sum + pick.livePoints * pick.multiplier, 0);
}

export type LiveDghScore = {
  rawPoints: number;
  bonusPoints: number;
  transferHits: number;
  bbBenchPoints: number;
  tcExtraPoints: number;
  dghPoints: number;
  autoSubPoints: number;
  scoringPlayerIds: number[];
};

function hasPlayedThisGameweek(pick: SquadPick): boolean {
  // Official FPL definition: an appearance means minutes on the pitch OR a
  // card event. A player who has 0 minutes and no card has not appeared.
  return (pick.liveMinutes ?? 0) > 0 || (pick.liveYellowCards ?? 0) > 0 || (pick.liveRedCards ?? 0) > 0;
}

function positionOf(pick: SquadPick): string { return pick.player.position; }

function validFormation(picks: SquadPick[]): boolean {
  return picks.filter(p => positionOf(p) === 'GKP').length === 1
    && picks.filter(p => positionOf(p) === 'DEF').length >= 3
    && picks.filter(p => positionOf(p) === 'MID').length >= 2
    && picks.filter(p => positionOf(p) === 'FWD').length >= 1;
}

/**
 * DGH live score: FPL raw player points + live bonus already contained in
 * those raw points, minus transfer hits, minus Bench Boost bench points, and
 * minus the Triple Captain's extra (third) multiplier. Automatic substitutions
 * follow the official FPL bench order and formation rules.
 *
 * `allFixturesFinished` is optional. When false, zero-minute players are not
 * auto-substituted yet because their club may simply have a later fixture.
 */
export function calculateLiveDghScore(
  squad: SquadPick[],
  activeChip: string | null,
  transferHits: number,
  fixtures: FplFixture[] = [],
  event?: number,
): LiveDghScore {
  const starters = squad.filter(p => p.slot <= 11).sort((a,b) => a.slot - b.slot);
  const bench = squad.filter(p => p.slot > 11).sort((a,b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));
  const teamFixturesFinished = (teamId: number) => {
    const teamFixtures = fixtures.filter(f => (event == null || f.event === event) && (f.team_h === teamId || f.team_a === teamId));
    return teamFixtures.length === 0 || teamFixtures.every(f => f.finished);
  };
  const hasPlayed = (p: SquadPick) => hasPlayedThisGameweek(p) || !teamFixturesFinished(p.player.teamId);
  const playingStarters = starters.filter(hasPlayed);
  // A starter is only eligible for automatic substitution once their own
  // club's fixture(s) for this gameweek have finished AND they didn't play.
  // `hasPlayed` already encodes both halves of that (see teamFixturesFinished
  // above), so missingStarters is simply its complement — no separate
  // "allFixturesFinished" flag is needed or correct here, since different
  // starters' clubs can finish their fixtures at different times (blank/
  // double gameweeks, postponements, etc). This keeps the sub decision
  // per-player and matches the official FPL automatic-substitution engine.
  const missingStarters = starters.filter(p => !hasPlayed(p));
  const usedBench = new Set<number>();
  const scoringXI: SquadPick[] = [...playingStarters];

  for (const missing of missingStarters.filter(p => positionOf(p) === 'GKP')) {
    const gk = bench.find(p => positionOf(p) === 'GKP' && !usedBench.has(p.playerId) && hasPlayedThisGameweek(p));
    if (gk) { usedBench.add(gk.playerId); scoringXI.push(gk); }
  }

  for (const missing of missingStarters.filter(p => positionOf(p) !== 'GKP').sort((a,b) => a.slot - b.slot)) {
    const candidate = bench.find(p => positionOf(p) !== 'GKP' && !usedBench.has(p.playerId) && hasPlayedThisGameweek(p) && validFormation([...scoringXI, p]));
    if (candidate) { usedBench.add(candidate.playerId); scoringXI.push(candidate); }
  }

  const uniqueXI = [...new Map(scoringXI.map(p => [p.playerId, p])).values()];
  const captain = starters.find(p => p.isCaptain);
  const vice = starters.find(p => p.isViceCaptain);
  const effectiveCaptain = captain && hasPlayed(captain) ? captain : (vice && hasPlayed(vice) ? vice : null);
  const isTriple = activeChip === '3xc';
  const captainMultiplier = effectiveCaptain ? (isTriple ? 3 : 2) : 1;

  // Bench Boost includes all 15 players. DGH removes the entire bench
  // contribution afterwards, neutralising the chip's advantage.
  const scorePool = activeChip === 'bboost' ? squad : uniqueXI;
  const basePoints = scorePool.reduce((sum,p) => sum + p.livePoints, 0);
  const captainExtra = effectiveCaptain ? effectiveCaptain.livePoints * (captainMultiplier - 1) : 0;
  const rawPoints = basePoints + captainExtra;
  const bonusPoints = scorePool.reduce((sum,p) => sum + (p.liveBonus ?? 0), 0);
  const bbBenchPoints = activeChip === 'bboost' ? bench.reduce((sum,p) => sum + p.livePoints, 0) : 0;
  const tcExtraPoints = isTriple && effectiveCaptain ? effectiveCaptain.livePoints : 0;
  const dghPoints = rawPoints - Math.max(0, transferHits) - bbBenchPoints - tcExtraPoints;
  const autoSubPoints = uniqueXI.filter(p => !starters.some(s => s.playerId === p.playerId)).reduce((sum,p) => sum + p.livePoints, 0);

  return {
    rawPoints: Math.round(rawPoints * 10) / 10,
    bonusPoints: Math.round(bonusPoints * 10) / 10,
    transferHits: Math.max(0, transferHits),
    bbBenchPoints: Math.round(bbBenchPoints * 10) / 10,
    tcExtraPoints: Math.round(tcExtraPoints * 10) / 10,
    dghPoints: Math.round(dghPoints * 10) / 10,
    autoSubPoints: Math.round(autoSubPoints * 10) / 10,
    scoringPlayerIds: uniqueXI.map(p => p.playerId),
  };
}
