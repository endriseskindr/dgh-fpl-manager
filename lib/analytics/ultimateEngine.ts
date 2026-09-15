import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import { DGH_RULES } from "../config";
import { optimizeXI } from "./xiOptimizer";
import { projectNextGw as authoritativeProjectNextGw, captainVolatility as authoritativeCaptainVolatility } from "./projection";

export type DghVerdict = "MUST MAKE" | "STRONG OPTION" | "CONSIDER" | "HOLD";
export type DghRisk = "LOW" | "MEDIUM" | "HIGH";

export type CaptainRegret = {
  player: SquadPick;
  expectedPoints: number;
  volatility: number;
  regretPoints: number;
  regretProbabilityPct: number;
  ownershipPct: number;
  label: "SAFE" | "BEST EV" | "DIFFERENTIAL" | "RISKY";
};

export type PriceSignal = {
  label: "LIKELY RISE" | "POSSIBLE RISE" | "STABLE" | "POSSIBLE FALL" | "LIKELY FALL";
  confidencePct: number;
  netTransferSignal: number;
};

export type WhatIfScenario = {
  id: string;
  label: string;
  projectedPoints: number;
  deltaVsHold: number;
  hitCost: number;
  netDelta: number;
  risk: DghRisk;
  verdict: DghVerdict;
  isBaseline?: boolean;
};

export type DghDecisionScore = {
  score: number;
  confidencePct: number;
  risk: DghRisk;
  verdict: DghVerdict;
  components: {
    expectedValue: number;
    fixture: number;
    minutes: number;
    ownershipLeverage: number;
    rivalImpact: number;
    price: number;
    riskPenalty: number;
  };
};

export const projectNextGw = authoritativeProjectNextGw;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normal(rng: () => number): number {
  const u = Math.max(Number.EPSILON, rng());
  const v = Math.max(Number.EPSILON, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function volatilityFor(p: EnrichedPlayer): number { return authoritativeCaptainVolatility(p); }

/** Genuine seeded Monte-Carlo captain regret model; deterministic for repeatable tests. */
export function rankCaptainRegret(candidates: SquadPick[], simulations = 1500, seed = 170174): CaptainRegret[] {
  const viable = candidates.filter((p) => p.isXI);
  if (!viable.length) return [];
  const rng = seededRandom(seed);
  const samples = viable.map((pick) => ({ pick, expected: projectNextGw(pick.player), volatility: volatilityFor(pick.player), regrets: 0, regretCount: 0 }));
  for (let i = 0; i < simulations; i += 1) {
    const outcomes = samples.map((s) => Math.max(0, s.expected + normal(rng) * s.volatility));
    const best = Math.max(...outcomes);
    samples.forEach((s, idx) => {
      s.regrets += Math.max(0, best - outcomes[idx]) * 2;
      if (best - outcomes[idx] > 4) s.regretCount += 1;
    });
  }
  const sorted = samples.map((s) => ({
    player: s.pick,
    expectedPoints: Math.round(s.expected * 10) / 10,
    volatility: Math.round(s.volatility * 10) / 10,
    regretPoints: Math.round((s.regrets / simulations) * 10) / 10,
    regretProbabilityPct: Math.round((s.regretCount / simulations) * 1000) / 10,
    ownershipPct: s.pick.player.ownershipPct,
    label: "BEST EV" as const,
  })).sort((a, b) => a.regretPoints - b.regretPoints);
  const safe = [...sorted].sort((a, b) => b.expectedPoints - a.expectedPoints)[0]?.player.playerId;
  const diff = [...sorted].filter((x) => x.ownershipPct < 15).sort((a, b) => b.expectedPoints - a.expectedPoints)[0]?.player.playerId;
  return sorted.map((x, i) => ({
    ...x,
    label: x.player.playerId === diff ? "DIFFERENTIAL" : x.player.playerId === safe ? "SAFE" : x.regretProbabilityPct > 40 ? "RISKY" : "BEST EV",
  }));
}

/** Price-change signal only; it never claims an official FPL threshold. */
export function predictPriceSignal(p: EnrichedPlayer): PriceSignal {
  const signal = p.transfersInEvent - p.transfersOutEvent;
  const magnitude = Math.abs(signal);
  const confidencePct = Math.min(95, 45 + Math.round(magnitude / 2500));
  if (signal >= 30000) return { label: "LIKELY RISE", confidencePct, netTransferSignal: signal };
  if (signal >= 12000) return { label: "POSSIBLE RISE", confidencePct, netTransferSignal: signal };
  if (signal <= -30000) return { label: "LIKELY FALL", confidencePct, netTransferSignal: signal };
  if (signal <= -12000) return { label: "POSSIBLE FALL", confidencePct, netTransferSignal: signal };
  return { label: "STABLE", confidencePct: Math.min(90, confidencePct + 10), netTransferSignal: signal };
}

function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }

export function calculateDghDecisionScore(input: {
  incoming?: EnrichedPlayer;
  outgoing?: EnrichedPlayer;
  bank: number;
  rivalImpacts?: { expectedGainOnRival: number }[];
}): DghDecisionScore {
  const p = input.incoming ?? input.outgoing;
  if (!p) return { score: 0, confidencePct: 0, risk: "HIGH", verdict: "HOLD", components: { expectedValue: 0, fixture: 0, minutes: 0, ownershipLeverage: 0, rivalImpact: 0, price: 0, riskPenalty: 100 } };
  const projected = projectNextGw(p);
  const expectedValue = clamp(projected * 8);
  // Fixture component intentionally reuses the same authoritative projection
  // (not raw epNext) — projectNextGw() already blends official ep_next with
  // form/underlying/minutes, so this must never diverge from expectedValue's source.
  const fixture = clamp(projected * 9);
  const minutes = clamp((p.minutes / 900) * 100);
  const ownershipLeverage = clamp(p.ownershipPct < 15 ? 85 : p.ownershipPct < 30 ? 65 : p.ownershipPct < 60 ? 45 : 25);
  const rivalImpact = clamp(50 + (input.rivalImpacts?.reduce((s, r) => s + r.expectedGainOnRival, 0) ?? 0) * 2);
  const price = clamp(50 + (p.transfersInEvent - p.transfersOutEvent) / 1000);
  const riskPenalty = p.availability.confidence === "SPECULATIVE" ? 35 : p.availability.confidence === "PROBABLE" ? 18 : p.availability.confidence === "SUPPORTED" ? 8 : 2;
  const score = Math.round(clamp(expectedValue * .27 + fixture * .17 + minutes * .18 + ownershipLeverage * .12 + rivalImpact * .12 + price * .04 + (100 - riskPenalty) * .10));
  const confidencePct = Math.round(clamp(55 + score * .35 - riskPenalty * .35));
  const risk: DghRisk = riskPenalty >= 25 ? "HIGH" : riskPenalty >= 12 ? "MEDIUM" : "LOW";
  const verdict: DghVerdict = score >= 82 ? "MUST MAKE" : score >= 70 ? "STRONG OPTION" : score >= 58 ? "CONSIDER" : "HOLD";
  return { score, confidencePct, risk, verdict, components: { expectedValue: Math.round(expectedValue), fixture: Math.round(fixture), minutes: Math.round(minutes), ownershipLeverage: Math.round(ownershipLeverage), rivalImpact: Math.round(rivalImpact), price: Math.round(price), riskPenalty } };
}

export function buildWhatIfScenarios(input: {
  squad: SquadPick[];
  holdProjection?: number;
  alternatives?: { id: string; label: string; incoming: EnrichedPlayer; outgoing: EnrichedPlayer; hitCost: number }[];
}): WhatIfScenario[] {
  const xi = optimizeXI(input.squad);
  const hold = input.holdProjection ?? xi.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + (xi.captain ? projectNextGw(xi.captain.pick.player) : 0);
  const rows: WhatIfScenario[] = [{ id: "HOLD", label: "Hold / Roll", projectedPoints: round(hold), deltaVsHold: 0, hitCost: 0, netDelta: 0, risk: "LOW", verdict: "HOLD", isBaseline: true }];
  for (const a of input.alternatives ?? []) {
    const delta = projectNextGw(a.incoming) - projectNextGw(a.outgoing);
    const netDelta = delta - a.hitCost;
    const score = netDelta >= 4 ? "MUST MAKE" : netDelta >= 2 ? "STRONG OPTION" : netDelta >= 0 ? "CONSIDER" : "HOLD";
    rows.push({ id: a.id, label: a.label, projectedPoints: round(hold + delta), deltaVsHold: round(delta), hitCost: a.hitCost, netDelta: round(netDelta), risk: a.hitCost >= 8 ? "HIGH" : a.hitCost >= 4 ? "MEDIUM" : "LOW", verdict: score });
  }
  return rows.sort((a, b) => b.netDelta - a.netDelta);
}

export function buildUltimateSnapshot(squad: SquadPick[], rivals: RivalProfile[]) {
  const xi = optimizeXI(squad);
  const captains = rankCaptainRegret(squad);
  const rivalImpacts = rivals.map((r) => ({ expectedGainOnRival: xi.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) - (r.squad ? r.squad.reduce((s, p) => s + projectNextGw(p.player), 0) : r.gameweekPoints) }));
  const score = calculateDghDecisionScore({ incoming: xi.captain?.pick.player, bank: 0, rivalImpacts });
  return { xi, captains, score };
}

function round(n: number): number { return Math.round(n * 10) / 10; }
