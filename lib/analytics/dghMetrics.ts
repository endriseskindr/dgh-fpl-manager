import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import type { DghLedgerRow } from "../seasonStore";
import {
  calculateHsfi,
  calculateBv,
  calculateMdi,
  calculateWcs,
  calculateDtq,
  calculateWcps,
  calculateDghPlayerMetrics,
  type DghPlayerMetrics as EngineDghPlayerMetrics,
  type TeamFixtureRun as EngineTeamFixtureRun
} from "../engine/dgh";

export type DghPlayerMetrics = EngineDghPlayerMetrics;

export type DghTeamMetrics = {
  avgHsfi: number;
  avgWcs: number;
  avgMdi: number;
  avgDtq: number;
  avgWcps: number;
  templateCoveragePct: number;
  swingPotential: number;
  miniLeagueEv: number;
  vbmPct: number | null;
  ldi: number;
  pps: number;
  captainImpact: number | null;
  posture: "ATTACK" | "BALANCED" | "DEFEND";
  strategyState: "DOMINATING" | "ATTACK" | "BALANCED" | "TOO SAFE" | "DISTRESSED";
  bestCaptain: { playerId: number; webName: string; wcps: number; ownershipPct: number } | null;
  viceCaptain: { playerId: number; webName: string; wcps: number; ownershipPct: number } | null;
};

export type PerformanceGate = {
  key: "GW_WIN_RATE" | "TOP3_RATE" | "RELEGATIONS" | "AVG_GDR" | "POSITIVE_TES";
  label: string;
  value: number | null;
  target: number;
  elite: number | null;
  passed: boolean | null;
  status: "PASS" | "ELITE" | "FAIL" | "PENDING";
};

export type PerformanceAudit = {
  sampleGws: number;
  gates: PerformanceGate[];
  failedCount: number;
  wildcardReset: boolean;
  status: "CONTINUE" | "WATCH" | "RESET" | "PENDING";
};

// Delegate directly to lib/engine/dgh.ts
export function hsfi(p: EnrichedPlayer, runsByTeam?: Map<number, TeamFixtureRun>): number {
  return calculateHsfi(p as any, runsByTeam as Map<number, EngineTeamFixtureRun>, p.setPieces);
}

export function bv(p: EnrichedPlayer, hsfiScore = hsfi(p, undefined)): number {
  return calculateBv(p as any, hsfiScore);
}

export function mdi(p: EnrichedPlayer, hsfiScore = hsfi(p, undefined), explosivenessIndex = 0): number {
  return calculateMdi(p as any, hsfiScore, explosivenessIndex);
}

export function wcs(p: EnrichedPlayer, runsByTeam?: Map<number, TeamFixtureRun>, recentHaulPct?: number, xgiVolatility?: number): number {
  return calculateWcs(p as any, runsByTeam as Map<number, EngineTeamFixtureRun>, recentHaulPct, xgiVolatility);
}

export function dtq(p: EnrichedPlayer, hsfiScore = hsfi(p, undefined)): number {
  return calculateDtq(p as any, hsfiScore);
}

export function wcps(p: EnrichedPlayer, hsfiScore = hsfi(p, undefined), wcsScore = wcs(p, undefined), miniOwnershipPct = p.ownershipPct): number {
  return calculateWcps(p as any, hsfiScore, wcsScore, miniOwnershipPct);
}

export function playerDghMetrics(p: EnrichedPlayer, options: { runsByTeam?: Map<number, TeamFixtureRun>; miniOwnershipPct?: number; recentHaulPct?: number; xgiVolatility?: number; explosivenessIndex?: number } = {}): DghPlayerMetrics {
  return calculateDghPlayerMetrics(p as any, {
    runsByTeam: options.runsByTeam as Map<number, EngineTeamFixtureRun>,
    miniOwnershipPct: options.miniOwnershipPct,
    recentHaulPct: options.recentHaulPct,
    xgiVolatility: options.xgiVolatility,
    explosivenessIndex: options.explosivenessIndex,
    setPieces: p.setPieces
  });
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10;

export function teamDghMetrics(
  squad: SquadPick[],
  playersById: Map<number, EnrichedPlayer>,
  rivals: RivalProfile[],
  runsByTeam?: Map<number, TeamFixtureRun>,
  dghLedgerRows: DghLedgerRow[] = []
): DghTeamMetrics {
  const starters = squad.filter(s => s.position <= 11);
  const startingPlayers = starters.map(s => playersById.get(s.element)).filter((p): p is EnrichedPlayer => p !== undefined);

  if (startingPlayers.length === 0) {
    return {
      avgHsfi: 0,
      avgWcs: 0,
      avgMdi: 0,
      avgDtq: 0,
      avgWcps: 0,
      templateCoveragePct: 0,
      swingPotential: 0,
      miniLeagueEv: 0,
      vbmPct: null,
      ldi: 0,
      pps: 0,
      captainImpact: null,
      posture: "BALANCED",
      strategyState: "BALANCED",
      bestCaptain: null,
      viceCaptain: null,
    };
  }

  const pMetrics = startingPlayers.map(p => playerDghMetrics(p, { runsByTeam }));
  const avgHsfi = round(pMetrics.reduce((a, b) => a + b.hsfi, 0) / pMetrics.length, 1);
  const avgWcs = round(pMetrics.reduce((a, b) => a + b.wcs, 0) / pMetrics.length, 1);
  const avgMdi = round(pMetrics.reduce((a, b) => a + b.mdi, 0) / pMetrics.length, 2);
  const avgDtq = round(pMetrics.reduce((a, b) => a + b.dtq, 0) / pMetrics.length, 1);
  const avgWcps = round(pMetrics.reduce((a, b) => a + b.wcps, 0) / pMetrics.length, 1);

  const totalRivals = rivals.length;
  let templateCoveragePct = 0;
  if (totalRivals > 0) {
    const rivalPlayerCounts = new Map<number, number>();
    for (const r of rivals) {
      for (const p of r.picks) {
        if (p.position <= 11) {
          rivalPlayerCounts.set(p.element, (rivalPlayerCounts.get(p.element) ?? 0) + 1);
        }
      }
    }
    const myCoverageSum = startingPlayers.reduce((acc, p) => {
      const ownedByRivals = rivalPlayerCounts.get(p.id) ?? 0;
      return acc + (ownedByRivals / totalRivals);
    }, 0);
    templateCoveragePct = round((myCoverageSum / 11) * 100, 1);
  }

  const sortedByWcps = [...startingPlayers]
    .map(p => ({ p, m: playerDghMetrics(p, { runsByTeam }) }))
    .sort((a, b) => b.m.wcps - a.m.wcps);

  const bestCaptain = sortedByWcps[0] ? {
    playerId: sortedByWcps[0].p.id,
    webName: sortedByWcps[0].p.webName,
    wcps: sortedByWcps[0].m.wcps,
    ownershipPct: sortedByWcps[0].p.ownershipPct
  } : null;

  const viceCaptain = sortedByWcps[1] ? {
    playerId: sortedByWcps[1].p.id,
    webName: sortedByWcps[1].p.webName,
    wcps: sortedByWcps[1].m.wcps,
    ownershipPct: sortedByWcps[1].p.ownershipPct
  } : null;

  const swingPotential = round(avgDtq * (1 - templateCoveragePct / 100), 1);
  const miniLeagueEv = round(avgWcps * 11, 0);

  let posture: "ATTACK" | "BALANCED" | "DEFEND" = "BALANCED";
  if (templateCoveragePct < 40 || swingPotential > 25) posture = "ATTACK";
  else if (templateCoveragePct > 70) posture = "DEFEND";

  let strategyState: "DOMINATING" | "ATTACK" | "BALANCED" | "TOO SAFE" | "DISTRESSED" = "BALANCED";
  if (avgWcps >= 65 && templateCoveragePct >= 50) strategyState = "DOMINATING";
  else if (avgWcps < 45) strategyState = "DISTRESSED";
  else if (posture === "DEFEND" && swingPotential < 10) strategyState = "TOO SAFE";
  else if (posture === "ATTACK") strategyState = "ATTACK";

  return {
    avgHsfi,
    avgWcs,
    avgMdi,
    avgDtq,
    avgWcps,
    templateCoveragePct,
    swingPotential,
    miniLeagueEv,
    vbmPct: null,
    ldi: round(avgMdi * 10, 1),
    pps: round(avgHsfi * 1.1, 1),
    captainImpact: bestCaptain ? round(bestCaptain.wcps * 2, 1) : null,
    posture,
    strategyState,
    bestCaptain,
    viceCaptain,
  };
}

export function auditPerformanceGws(dghLedgerRows: DghLedgerRow[] = []): PerformanceAudit {
  return {
    sampleGws: dghLedgerRows.length,
    gates: [],
    failedCount: 0,
    wildcardReset: false,
    status: "CONTINUE"
  };
}
