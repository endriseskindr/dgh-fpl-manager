import { DGH_RULES } from "../config";
import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import { optimizeXI, type XIRecommendation } from "./xiOptimizer";
import { projectNextGw } from "./projection";
import {
  buildRivalImpacts,
  buildTransferScenarios,
  estimatePodiumProbability,
  type RivalImpact,
  type TransferScenario,
} from "./transferEngine";

export type Posture = "DEFENSIVE_SHIELD" | "BALANCED" | "AGGRESSIVE_DIFFERENTIAL";

export type WarRoomRecommendation = {
  posture: Posture;
  bestScenario: TransferScenario;
  allScenarios: TransferScenario[];
  xi: XIRecommendation;
  rivalImpacts: RivalImpact[];
  top1ProbabilityPct: number;
  top3ProbabilityPct: number;
  expectedRankMovement: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  why: string[];
  weeklyAwardMode: {
    ceilingCaptainPick: { pick: SquadPick; projected: number; ownershipPct: number; reason: string } | null;
    ceilingScenario: TransferScenario;
  };
};

function derivePosture(myRank: number, gapToLeaderPts: number): Posture {
  if (myRank <= DGH_RULES.leadingPositionThreshold) return "DEFENSIVE_SHIELD";
  if (gapToLeaderPts >= DGH_RULES.chasingGapPointsForDifferentials) return "AGGRESSIVE_DIFFERENTIAL";
  return "BALANCED";
}

/** Picks the scenario with the best net gain that also clears its DGH hit threshold. */
function pickBestScenario(scenarios: TransferScenario[], posture: Posture): TransferScenario {
  const eligible = scenarios.filter((s) => s.meetsDghThreshold);
  const pool = eligible.length ? eligible : [scenarios[0]];
  if (posture === "DEFENSIVE_SHIELD") {
    // When leading, prefer the lowest-risk scenario among those with positive net gain.
    const lowRisk = pool.filter((s) => s.riskLevel !== "HIGH").sort((a, b) => b.netGain - a.netGain);
    return lowRisk[0] ?? pool.sort((a, b) => b.netGain - a.netGain)[0];
  }
  // Balanced / aggressive: maximize net gain outright.
  return [...pool].sort((a, b) => b.netGain - a.netGain)[0];
}

export function buildWarRoomRecommendation(input: {
  squad: SquadPick[];
  pool: EnrichedPlayer[];
  rivals: RivalProfile[];
  bank: number;
  freeTransfers: number;
  myRank: number;
  myTotal: number;
  standingsTotals: number[];
  gameweeksRemaining: number;
}): WarRoomRecommendation {
  const leaderTotal = Math.max(...input.standingsTotals);
  const gapToLeader = leaderTotal - input.myTotal;
  const posture = derivePosture(input.myRank, gapToLeader);

  const scenarios = buildTransferScenarios(input.squad, input.pool, input.bank, input.freeTransfers);
  const best = pickBestScenario(scenarios, posture);

  const xi = optimizeXI(input.squad);
  const myProjectedTotal = xi.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + (xi.captain?.projected ?? 0);

  const rivalImpacts = buildRivalImpacts(myProjectedTotal, input.myTotal, input.myRank, input.rivals);
  const { top1Pct, top3Pct } = estimatePodiumProbability(input.myTotal, input.standingsTotals, input.gameweeksRemaining);

  const movingUp = rivalImpacts.filter((r) => r.expectedGainOnRival > 0).length;
  const expectedRankMovement =
    movingUp === 0
      ? "Hold position — no projected gains on all DGH rivals this GW"
      : `Projected to gain ground on ${movingUp}/${rivalImpacts.length} rivals this GW`;

  const anyHighRisk = best.riskLevel === "HIGH" || xi.startingXI.some((p) => p.player.availability.confidence === "SPECULATIVE");
  const risk: WarRoomRecommendation["risk"] = anyHighRisk ? "HIGH" : best.hits > 0 ? "MEDIUM" : "LOW";

  const why: string[] = [];
  why.push(
    posture === "DEFENSIVE_SHIELD"
      ? "Leading the mini-league — prioritizing template shields and avoiding unnecessary hits to protect rank."
      : posture === "AGGRESSIVE_DIFFERENTIAL"
        ? `Trailing the leader by ${gapToLeader.toFixed(0)} pts — favoring high-ceiling differentials to close the gap.`
        : "Mid-pack position — balancing safe EV with selective upside.",
  );
  if (best.hits > 0) why.push(`${best.hits} hit(s) taken because projected net gain (${best.netGain.toFixed(1)} pts) clears the DGH threshold for this hit size.`);
  else why.push("No hits taken — no transfer combination cleared the DGH net-gain threshold after cost.");
  if (xi.captain) why.push(`Captain ${xi.captain.pick.player.webName}: ${xi.captain.reason}`);

  const ceilingCaptain = xi.differentialCaptain
    ? xi.differentialCaptain
    : xi.captain
      ? { ...xi.captain, ownershipPct: xi.captain.pick.player.ownershipPct }
      : null;
  const ceilingScenario = [...scenarios].sort((a, b) => b.projectedGwPointsGain - a.projectedGwPointsGain)[0];

  return {
    posture,
    bestScenario: best,
    allScenarios: scenarios,
    xi,
    rivalImpacts,
    top1ProbabilityPct: top1Pct,
    top3ProbabilityPct: top3Pct,
    expectedRankMovement,
    risk,
    why,
    weeklyAwardMode: { ceilingCaptainPick: ceilingCaptain, ceilingScenario },
  };
}

/** Renders the required decisive-recommendation text block. */
export function formatWarRoomSummary(rec: WarRoomRecommendation, gameweek: number): string {
  const t = rec.bestScenario;
  const lines: string[] = [];
  lines.push(`BEST STRATEGY → ${rec.posture.replace(/_/g, " ")}`);
  lines.push(
    `TRANSFERS → ${t.moves.length === 0 ? "None (roll transfer)" : t.moves.map((m) => `${m.out.webName} OUT → ${m.in.webName} IN`).join(", ")}`,
  );
  lines.push(`XI → ${rec.xi.formation} (${rec.xi.startingXI.map((p) => p.player.webName).join(", ")})`);
  lines.push(`CAPTAIN → ${rec.xi.captain ? rec.xi.captain.pick.player.webName : "N/A"} (VC: ${rec.xi.viceCaptain ? rec.xi.viceCaptain.pick.player.webName : "N/A"})`);
  lines.push(`BENCH → ${rec.xi.bench.map((p) => p.player.webName).join(", ")}`);
  lines.push(`HIT/NO-HIT → ${t.hits === 0 ? "NO HIT" : `-${t.hitCost} (${t.hits} hit${t.hits > 1 ? "s" : ""})`}`);
  lines.push(`EXPECTED POINTS → ${t.projectedGwPointsGain.toFixed(1)} pts uplift from transfers, GW${gameweek}`);
  lines.push(`NET GAIN → ${t.netGain.toFixed(1)} pts after hit cost`);
  lines.push(`RIVAL IMPACT → ${rec.expectedRankMovement}`);
  lines.push(`RANK/PODIUM PROBABILITY → Top 1: ${rec.top1ProbabilityPct}% · Top 3: ${rec.top3ProbabilityPct}%`);
  lines.push(`RISK → ${rec.risk}`);
  lines.push(`WHY → ${rec.why.join(" ")}`);
  return lines.join("\n");
}
