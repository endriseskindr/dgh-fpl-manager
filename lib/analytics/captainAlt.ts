import type { EnrichedPlayer } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import { newsPenaltyScore } from "./newsIntel";

/**
 * ALTERNATIVE captain signal, ported from x402-fpl-api-main's captain.py
 * (v3.0, multiplicative fixture model, weights backtested against GW1-29
 * actuals in the source repo).
 *
 * PORT_NOTES.md was explicit that this should NOT silently replace DGH's
 * existing projection.ts: "recommend backtesting both against real results
 * before replacing anything." This module is exported and surfaced as a
 * second opinion in the Captain UI — projection.ts remains the primary
 * signal everywhere else in the app (transfers, XI, chip optimizer all keep
 * using projectNextGw unchanged).
 *
 * score = base_score × fixture_multiplier
 * fixture_multiplier = 1.0 + fdr_bonus + home_bonus
 *   fdr_bonus ∈ [-0.25, +0.25], linear across FDR 5→1 (source docstring)
 *   home_bonus = +0.10 if home, 0 if away
 *
 * OMITTED vs the source (fields DGH's FplElement doesn't fetch from
 * bootstrap-static): "dreamteam" appearance count, and
 * defensive_contribution_per_90. Both terms are left out rather than
 * approximated from something else — the resulting score is a partial port,
 * not a faithful reproduction of the backtested original.
 */
const WEIGHTS = {
  xg90: 1.07,
  xa90: 0.92,
  form: 3.43,
  ppg: 5.92,
  epNext: 0.49,
  home: 0.10,
  ict: 0.01,
  bonusPg: 1.31,
  penalty: 1.9,
  setPiece: 0.84,
  playingChanceMaxPenalty: -10.0,
};

const INJURY_STATUSES = new Set(["i", "d", "s", "u"]);

export type CaptainAltScore = {
  playerId: number;
  webName: string;
  baseScore: number;
  fixtureMultiplier: number;
  score: number;
  reasoning: string[];
};

function playingChancePenalty(p: EnrichedPlayer): number {
  const chance = p.availability.chanceNextRound;
  if (chance === null) return INJURY_STATUSES.has(p.status) ? WEIGHTS.playingChanceMaxPenalty : 0;
  return WEIGHTS.playingChanceMaxPenalty * (1 - chance / 100);
}

function fixtureMultiplier(run: TeamFixtureRun | undefined): { multiplier: number; label: string } {
  const fixture = run?.next[0];
  if (!fixture) return { multiplier: 0, label: "Blank GW" };
  const fdrBonus = ((3 - fixture.difficulty) / 2) * 0.25;
  const homeBonus = fixture.isHome ? WEIGHTS.home : 0;
  const multiplier = 1.0 + fdrBonus + homeBonus;
  return { multiplier, label: `${fixture.isHome ? "vs" : "at"} ${fixture.opponentShort} (FDR ${fixture.difficulty})` };
}

export function scoreCaptainAlt(p: EnrichedPlayer, run: TeamFixtureRun | undefined): CaptainAltScore {
  const minutesCertainty = Math.min(1, p.minutes / 900);
  const per90 = p.minutes > 0 ? 90 / p.minutes : 0;
  const xg90 = p.xG * per90;
  const xa90 = p.xA * per90;
  const bonusPerGame = p.starts > 0 ? p.bonus / p.starts : 0;
  const setPiece = p.setPieces.corners || p.setPieces.freeKicks || p.setPieces.penalties ? 1 : 0;
  const penaltyTaker = p.setPieces.penalties ? 1 : 0;

  const baseScore =
    p.pointsPerGame * WEIGHTS.ppg +
    p.form * WEIGHTS.form +
    bonusPerGame * WEIGHTS.bonusPg +
    penaltyTaker * WEIGHTS.penalty +
    xg90 * WEIGHTS.xg90 +
    xa90 * WEIGHTS.xa90 +
    minutesCertainty * 1.04 +
    setPiece * WEIGHTS.setPiece +
    p.ictIndex * WEIGHTS.ict +
    p.epNext * WEIGHTS.epNext +
    playingChancePenalty(p) +
    newsPenaltyScore(p.availability.news);

  const { multiplier, label } = fixtureMultiplier(run);
  const score = Math.round(baseScore * multiplier * 100) / 100;

  const reasoning = [
    `PPG ${p.pointsPerGame.toFixed(1)} · form ${p.form.toFixed(1)} · xGI/90 ${(xg90 + xa90).toFixed(2)}`,
    `Fixture ${label} → ×${multiplier.toFixed(2)}`,
  ];
  if (penaltyTaker) reasoning.push("On penalties");
  if (p.availability.news) reasoning.push(`News: ${p.availability.news.trim()}`);

  return { playerId: p.id, webName: p.webName, baseScore: Math.round(baseScore * 100) / 100, fixtureMultiplier: Math.round(multiplier * 100) / 100, score, reasoning };
}

export function rankCaptainAlt(pool: EnrichedPlayer[], runsByTeam: Map<number, TeamFixtureRun>, topN = 5): CaptainAltScore[] {
  return pool
    .map((p) => scoreCaptainAlt(p, runsByTeam.get(p.teamId)))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
