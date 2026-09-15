import { DGH_RULES } from "../config";
import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import { optimizeXI } from "./xiOptimizer";
import { projectNextGw } from "./projection";
import { playerDghMetrics } from "./dghMetrics";

export type TransferMove = { out: EnrichedPlayer; in: EnrichedPlayer; outSellingPrice?: number };
export type TransferScenario = {
  id: "0-HIT" | "1-HIT" | "2-HIT" | "3-HIT";
  label: string;
  transfers: number;
  hits: number;
  hitCost: number;
  moves: TransferMove[];
  projectedGwPointsGain: number;
  netGain: number;
  bankAfter: number;
  totalSales: number;
  totalPurchases: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  meetsDghThreshold: boolean;
  rationale: string[];
  dghMdiGain: number;
  dghIncomingMdi: number;
  dghIncomingWcs: number;
  dghIncomingDtq: number;
};
export type RivalImpact = {
  entryId: number;
  managerName: string;
  currentGapToMe: number;
  projectedGapAfterGw: number;
  winProbabilityThisGw: number;
  expectedGainOnRival: number;
};

const ROUNDING = 10;
const BEAM_WIDTH = 1500;
// Bounds the number of same-position replacement candidates considered per
// beam-search depth. Without this, a position with a large available pool
// (e.g. 100+ midfielders) multiplies against BEAM_WIDTH states every depth,
// which is wasted work since only the highest-projected replacements can
// ever win a gain-maximizing search. Capped, not filtered by rank/ownership,
// so it never shrinks *which* players are eligible — only how many
// low-projection long-tail options are carried through the search.
const MAX_CANDIDATES_PER_POSITION = 40;

function round(n: number): number { return Math.round(n * ROUNDING) / ROUNDING; }

function riskForMoves(moves: TransferMove[], hits: number): TransferScenario["riskLevel"] {
  if (moves.some((m) => m.in.availability.confidence === "SPECULATIVE")) return "HIGH";
  if (hits >= 2 || moves.some((m) => m.in.availability.confidence === "PROBABLE")) return "MEDIUM";
  return "LOW";
}

function teamCounts(squad: SquadPick[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of squad) counts.set(p.player.teamId, (counts.get(p.player.teamId) ?? 0) + 1);
  return counts;
}

function legalReplacement(
  outgoing: EnrichedPlayer,
  incoming: EnrichedPlayer,
  currentSquad: SquadPick[],
  selectedOut: Set<number>,
  selectedIn: Set<number>,
): boolean {
  if (incoming.id === outgoing.id || selectedIn.has(incoming.id)) return false;
  if (incoming.position !== outgoing.position) return false;
  if (currentSquad.some((p) => p.playerId === incoming.id) && !selectedOut.has(incoming.id)) return false;
  const counts = teamCounts(currentSquad);
  for (const id of selectedOut) {
    const p = currentSquad.find((x) => x.playerId === id)?.player;
    if (p) counts.set(p.teamId, Math.max(0, (counts.get(p.teamId) ?? 0) - 1));
  }
  if ((counts.get(incoming.teamId) ?? 0) >= 3) return false;
  return true;
}

/**
 * Candidate ranking is deliberately capped so the optimizer stays fast on
 * mobile while still considering the strongest realistic market alternatives.
 */
function candidatePool(pool: EnrichedPlayer[], currentIds: Set<number>): EnrichedPlayer[] {
  return pool.filter((p) => !currentIds.has(p.id) && p.availability.confidence !== "SPECULATIVE");
}

export function rankSquadForTransferOut(squad: SquadPick[]): SquadPick[] {
  return [...squad].sort((a, b) => {
    const score = (x: SquadPick) => projectNextGw(x.player) - (x.player.availability.confidence === "SPECULATIVE" ? 3 : 0);
    return score(a) - score(b);
  });
}

function buildScenario(
  id: TransferScenario["id"],
  transfers: number,
  moves: TransferMove[],
  bank: number,
  freeTransfers: number,
): TransferScenario {
  const hits = Math.max(0, transfers - freeTransfers);
  const hitCost = hits * DGH_RULES.hitCost;
  const projectedGwPointsGain = round(moves.reduce((sum, m) => sum + projectNextGw(m.in) - projectNextGw(m.out), 0));
  const netGain = round(projectedGwPointsGain - hitCost);
  const totalSales = round(moves.reduce((sum, m) => sum + (m.outSellingPrice ?? m.out.price), 0));
  const totalPurchases = round(moves.reduce((sum, m) => sum + m.in.price, 0));
  const spend = totalPurchases - totalSales;
  const threshold = hits === 0 ? -Infinity : hits === 1 ? DGH_RULES.minNetGainForHit : hits === 2 ? DGH_RULES.minNetGainForDoubleHit : DGH_RULES.minNetGainForTripleHit;
  const incomingMetrics = moves.map(m => playerDghMetrics(m.in));
  const outgoingMetrics = moves.map(m => playerDghMetrics(m.out));
  const dghIncomingMdi = incomingMetrics.length ? round(incomingMetrics.reduce((s, m) => s + m.mdi, 0) / incomingMetrics.length) : 0;
  const dghOutgoingMdi = outgoingMetrics.length ? round(outgoingMetrics.reduce((s, m) => s + m.mdi, 0) / outgoingMetrics.length) : 0;
  const dghMdiGain = round(dghIncomingMdi - dghOutgoingMdi);
  const dghIncomingWcs = incomingMetrics.length ? round(incomingMetrics.reduce((s, m) => s + m.wcs, 0) / incomingMetrics.length) : 0;
  const dghIncomingDtq = incomingMetrics.length ? round(incomingMetrics.reduce((s, m) => s + m.dtq, 0) / incomingMetrics.length) : 0;
  const riskLevel = riskForMoves(moves, hits);
  return {
    id, transfers, hits, hitCost, moves, projectedGwPointsGain, netGain,
    bankAfter: round(bank + totalSales - totalPurchases), totalSales, totalPurchases, riskLevel,
    meetsDghThreshold: netGain >= threshold,
    label: transfers === 0 ? "HOLD / ROLL" : hits === 0 ? `${transfers} FREE TRANSFER${transfers > 1 ? "S" : ""}` : `${transfers} TRANSFER${transfers > 1 ? "S" : ""} · -${hitCost}`,
    rationale: [
      ...moves.map((m) => `${m.out.webName} → ${m.in.webName}: ${projectNextGw(m.out).toFixed(1)} → ${projectNextGw(m.in).toFixed(1)} projected pts`),
      `DGH MDI ${dghMdiGain >= 0 ? "+" : ""}${dghMdiGain.toFixed(2)} · incoming WCS ${dghIncomingWcs.toFixed(1)} · DTQ ${dghIncomingDtq.toFixed(1)}`,
    ],
    dghMdiGain, dghIncomingMdi, dghIncomingWcs, dghIncomingDtq,
  };
}

type State = { moves: TransferMove[]; bank: number; outIds: Set<number>; inIds: Set<number>; gain: number };

/** Full constrained beam-search for 0–3 transfers, rather than greedy swaps. */
function optimizeTransferCount(squad: SquadPick[], pool: EnrichedPlayer[], bank: number, count: number): TransferMove[] {
  if (count === 0) return [];
  const currentIds = new Set(squad.map((p) => p.playerId));
  const outs = rankSquadForTransferOut(squad);
  const candidates = candidatePool(pool, currentIds);
  const byPosition = new Map<string, EnrichedPlayer[]>();
  for (const p of candidates) {
    const arr = byPosition.get(p.position) ?? [];
    arr.push(p);
    byPosition.set(p.position, arr);
  }
  for (const [position, arr] of byPosition) {
    if (arr.length > MAX_CANDIDATES_PER_POSITION) {
      byPosition.set(
        position,
        [...arr].sort((a, b) => projectNextGw(b) - projectNextGw(a)).slice(0, MAX_CANDIDATES_PER_POSITION),
      );
    }
  }

  let states: State[] = [{ moves: [], bank, outIds: new Set(), inIds: new Set(), gain: 0 }];
  for (let depth = 0; depth < count; depth += 1) {
    const next: State[] = [];
    for (const state of states) {
      for (const outPick of outs) {
        if (state.outIds.has(outPick.playerId)) continue;
        const outgoing = outPick.player;
        const options = byPosition.get(outgoing.position) ?? [];
        for (const incoming of options) {
          const outgoingSellingPrice = outPick.sellingPrice ?? outgoing.price;
          if (!legalReplacement(outgoing, incoming, squad, state.outIds, state.inIds)) continue;
          const moveGain = projectNextGw(incoming) - projectNextGw(outgoing);
          const outgoingPick = squad.find(p => p.playerId === outgoing.id);
          const moves = [...state.moves, { out: outgoing, in: incoming, outSellingPrice: outgoingPick?.sellingPrice ?? outgoing.price }];
          const outIds = new Set(state.outIds); outIds.add(outgoing.id);
          const inIds = new Set(state.inIds); inIds.add(incoming.id);
          next.push({ moves, bank: round(state.bank + outgoingSellingPrice - incoming.price), outIds, inIds, gain: state.gain + moveGain });
        }
      }
    }
    next.sort((a, b) => b.gain - a.gain);
    states = next.slice(0, BEAM_WIDTH);
    if (!states.length) break;
  }
  return states.filter((state) => state.bank >= -1e-9).sort((a, b) => b.gain - a.gain)[0]?.moves ?? [];
}

export function buildTransferScenarios(squad: SquadPick[], pool: EnrichedPlayer[], bank: number, freeTransfers: number): TransferScenario[] {
  const ft = Math.max(0, Math.min(5, Math.floor(freeTransfers || 0)));
  const scenarios: TransferScenario[] = [buildScenario("0-HIT", 0, [], bank, ft)];
  const ids: TransferScenario["id"][] = ["1-HIT", "2-HIT", "3-HIT"];
  for (let count = 1; count <= 3; count += 1) {
    const moves = optimizeTransferCount(squad, pool, bank, count);
    scenarios.push(buildScenario(ids[count - 1], count, moves, bank, ft));
  }
  return scenarios;
}

function winProbabilityFromGap(myProjected: number, rivalProjected: number): number {
  const z = (myProjected - rivalProjected) / (13 * Math.sqrt(2));
  return 1 / (1 + Math.exp(-1.7 * z));
}

export function buildRivalImpacts(myProjectedTotal: number, myCurrentTotal: number, _myRank: number, rivals: RivalProfile[]): RivalImpact[] {
  return rivals.map((rival) => {
    // Captain treatment must be identical for the user and every rival: the
    // XI sum already counts the captain once at base value, so we add their
    // projection a second time to apply the standard 2x multiplier — exactly
    // the same arithmetic used for "my" projected total in warRoom.ts /
    // transfers.tsx. Never compare a captain-doubled "my" score against a
    // plain, undoubled rival score (that was issue #13's root cause).
    const rivalProjectedGw = rival.squad
      ? (() => {
          const xi = optimizeXI(rival.squad);
          const base = xi.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0);
          return base + (xi.captain?.projected ?? 0);
        })()
      : rival.gameweekPoints;
    const currentGap = (rival.dghTotalPoints ?? rival.totalPoints) - myCurrentTotal;
    const projectedGapAfterGw = currentGap - (myProjectedTotal - rivalProjectedGw);
    return {
      entryId: rival.entryId,
      managerName: rival.managerName,
      currentGapToMe: currentGap,
      projectedGapAfterGw: round(projectedGapAfterGw),
      winProbabilityThisGw: round(winProbabilityFromGap(myProjectedTotal, rivalProjectedGw) * 1000) / 1000,
      expectedGainOnRival: round(myProjectedTotal - rivalProjectedGw),
    };
  }).sort((a, b) => a.currentGapToMe - b.currentGapToMe);
}

export function estimatePodiumProbability(myTotal: number, standingsTotals: number[], gameweeksRemaining: number) {
  const sorted = [...standingsTotals].sort((a, b) => b - a);
  const leaderGap = Math.max(0, sorted[0] - myTotal);
  const thirdGap = Math.max(0, (sorted[2] ?? sorted[sorted.length - 1] ?? myTotal) - myTotal);
  const varianceFactor = Math.max(4, Math.sqrt(Math.max(1, gameweeksRemaining)) * 13);
  const top1 = 1 / (1 + Math.exp((leaderGap / varianceFactor) * 1.1));
  const top3 = 1 / (1 + Math.exp((thirdGap / varianceFactor) * 1.1));
  return { top1Pct: round(Math.max(0, Math.min(1, top1)) * 100), top3Pct: round(Math.max(top1, Math.min(1, top3)) * 100) };
}
