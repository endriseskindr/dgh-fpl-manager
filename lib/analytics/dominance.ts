import type { RivalProfile } from "../types";
import type { Posture, WarRoomRecommendation } from "./warRoom";

export type DominanceMode = "DEFEND" | "BALANCED" | "ATTACK";
export type DominanceTarget = "LEADER" | "PODIUM" | "NEAREST_RIVAL" | "TOP_SCORER";

export type DominanceAssessment = {
  mode: DominanceMode;
  score: number;
  confidencePct: number;
  target: DominanceTarget;
  gapToLeader: number;
  nearestRivalGap: number;
  verifiedRivals: number;
  rivalCoveragePct: number;
  expectedSwing: number;
  ceilingSwing: number;
  reasons: string[];
};

/**
 * League-first strategy layer. It converts the raw War Room recommendation into
 * a mini-league objective: protect a lead, consolidate podium position, or attack.
 * It deliberately uses only data already verified by the War Room.
 */
export function assessDominance(input: {
  myRank: number;
  myTotal: number;
  standingsTotals: number[];
  rivals: RivalProfile[];
  recommendation: WarRoomRecommendation;
}): DominanceAssessment {
  const leaderTotal = Math.max(...input.standingsTotals, input.myTotal);
  const gapToLeader = Math.max(0, leaderTotal - input.myTotal);
  const nearestAhead = input.rivals
    .filter((r) => r.totalPoints > input.myTotal)
    .sort((a, b) => a.totalPoints - b.totalPoints)[0];
  const nearestRivalGap = nearestAhead ? nearestAhead.totalPoints - input.myTotal : 0;
  const verifiedRivals = input.rivals.filter((r) => !!r.squad && r.squad.length === 15).length;
  const rivalCoveragePct = input.rivals.length ? Math.round((verifiedRivals / input.rivals.length) * 100) : 100;

  let mode: DominanceMode;
  if (input.myRank <= 1) mode = "DEFEND";
  else if (input.myRank <= 3 && gapToLeader <= 15) mode = "BALANCED";
  else mode = "ATTACK";

  // Escalate only when the model itself sees a positive upside; never force a hit.
  if (mode === "ATTACK" && input.recommendation.bestScenario.netGain < 0) mode = "BALANCED";

  const target: DominanceTarget =
    input.myRank > 1 && gapToLeader > 0 ? "LEADER" :
    input.myRank <= 3 ? "PODIUM" :
    nearestAhead ? "NEAREST_RIVAL" : "TOP_SCORER";

  const expectedSwing = input.recommendation.rivalImpacts.length
    ? input.recommendation.rivalImpacts.reduce((sum, r) => sum + r.expectedGainOnRival, 0) / input.recommendation.rivalImpacts.length
    : input.recommendation.bestScenario.netGain;
  const ceilingSwing = Math.max(0, input.recommendation.weeklyAwardMode.ceilingScenario.projectedGwPointsGain);

  let score = 50;
  score += mode === "ATTACK" ? Math.min(18, gapToLeader) : mode === "DEFEND" ? 12 : 6;
  score += Math.max(-12, Math.min(15, expectedSwing * 2));
  score += input.recommendation.bestScenario.netGain > 0 ? Math.min(12, input.recommendation.bestScenario.netGain * 2) : -8;
  score += rivalCoveragePct >= 80 ? 5 : rivalCoveragePct >= 50 ? 1 : -5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const confidenceBase = input.recommendation.risk === "LOW" ? 88 : input.recommendation.risk === "MEDIUM" ? 76 : 62;
  const confidencePct = Math.max(35, Math.min(96, Math.round(confidenceBase * (0.7 + rivalCoveragePct / 333))));

  const reasons: string[] = [];
  if (mode === "DEFEND") reasons.push("You are leading — prioritize rank protection and avoid unnecessary hit exposure.");
  else if (mode === "ATTACK") reasons.push(`You are chasing a ${gapToLeader.toFixed(0)}-point leader gap — prioritize controlled upside and leverage.`);
  else reasons.push("You are close enough to the top that balanced EV and selective leverage are optimal.");
  if (input.recommendation.bestScenario.hits > 0) reasons.push(`${input.recommendation.bestScenario.hits} paid transfer(s) are only supported when the projected net gain clears the DGH threshold.`);
  if (verifiedRivals < input.rivals.length) reasons.push(`Rival intelligence is ${rivalCoveragePct}% verified; confidence is reduced for unavailable rival squads.`);
  if (ceilingSwing > input.recommendation.bestScenario.netGain + 2) reasons.push("A higher-ceiling weekly-award line exists, but it carries more variance than the core recommendation.");

  return {
    mode,
    score,
    confidencePct,
    target,
    gapToLeader,
    nearestRivalGap,
    verifiedRivals,
    rivalCoveragePct,
    expectedSwing: Math.round(expectedSwing * 10) / 10,
    ceilingSwing: Math.round(ceilingSwing * 10) / 10,
    reasons,
  };
}

export function modeFromPosture(posture: Posture): DominanceMode {
  if (posture === "DEFENSIVE_SHIELD") return "DEFEND";
  if (posture === "AGGRESSIVE_DIFFERENTIAL") return "ATTACK";
  return "BALANCED";
}
