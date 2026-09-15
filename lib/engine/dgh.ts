/**
 * Pure, Independent, Deterministic DGH Metric Engine
 * Contains all canonical DGH formulas: HSFI, BV, MDI, WCS, DTQ, WCPS, TES, GDR, Posture, and Strategy State.
 * Framework-agnostic with backward-compatible defaults.
 */

import type { FplPlayer } from "./fpl";

export interface TeamFixtureRun {
  teamId: number;
  next: { gameweek: number; opponentId: number; isHome: boolean; difficulty: number }[];
}

export interface DghPlayerMetrics {
  hsfi: number;
  bv: number;
  mdi: number;
  wcs: number;
  dtq: number;
  wcps: number;
  miniOwnershipPct: number;
  explosivenessIndex: number;
  recentHaulPct: number;
  xgiVolatility: number;
  fixtureFdr: number;
  estimated: boolean;
}

export interface DghTeamMetrics {
  avgHsfi: number;
  avgWcs: number;
  avgMdi: number;
  avgDtq: number;
  avgWcps: number;
  templateCoveragePct: number;
  swingPotential: number;
  miniLeagueEv: number;
  vbmPct: number | null;
  posture: "ATTACK" | "BALANCED" | "DEFEND";
  strategyState: "DOMINATING" | "ATTACK" | "BALANCED" | "TOO SAFE" | "DISTRESSED";
  bestCaptain: { playerId: number; webName: string; wcps: number; ownershipPct: number } | null;
  viceCaptain: { playerId: number; webName: string; wcps: number; ownershipPct: number } | null;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10;

function fdrFor(p: FplPlayer, runsByTeam?: Map<number, TeamFixtureRun>): number {
  return runsByTeam?.get(p.teamId)?.next[0]?.difficulty ?? 3;
}

function minutesPct(p: FplPlayer): number {
  const confidence = p.chanceNextRound;
  if (confidence !== null && confidence !== undefined) return clamp(confidence);
  if (p.status === "a") return clamp((p.minutes / 900) * 100);
  return p.status === "d" ? 60 : 20;
}

function setPieceScore(p: FplPlayer, penalties = false, corners = false, freeKicks = false): number {
  return (penalties ? 50 : 0) + (corners ? 25 : 0) + (freeKicks ? 25 : 0);
}

function fixtureScore(fdr: number): number {
  return clamp(((5 - fdr) / 4) * 100);
}

/**
 * Canonical HSFI (High-Structure Form Index) formula.
 */
export function calculateHsfi(p: FplPlayer, runsByTeam?: Map<number, TeamFixtureRun>, setPieces?: { penalties?: boolean; corners?: boolean; freeKicks?: boolean }): number {
  const xg90 = p.minutes > 0 ? (p.xG * 90) / p.minutes : 0;
  const xa90 = p.minutes > 0 ? (p.xA * 90) / p.minutes : 0;
  const formScore = clamp(p.form * 20);
  const setPieceVal = setPieceScore(p, setPieces?.penalties, setPieces?.corners, setPieces?.freeKicks);
  
  const score =
    clamp(xg90 * 100) * 0.25 +
    clamp(xa90 * 100) * 0.20 +
    formScore * 0.15 +
    minutesPct(p) * 0.20 +
    setPieceVal * 0.10 +
    fixtureScore(fdrFor(p, runsByTeam)) * 0.10;

  return round(clamp(score), 1);
}

export function calculateBv(p: FplPlayer, hsfiScore = calculateHsfi(p)): number {
  return round((hsfiScore / Math.max(0.1, p.price)) * (1 - p.ownershipPct / 100), 2);
}

export function calculateMdi(p: FplPlayer, hsfiScore = calculateHsfi(p), explosivenessIndex = 0): number {
  const differentialFactor = 1 + (1 - p.ownershipPct / 100) * 0.5;
  const ceilingMultiplier = 1 + clamp(explosivenessIndex, 0, 1) * 0.3;
  return round((hsfiScore * differentialFactor * ceilingMultiplier) / Math.max(0.1, p.price), 2);
}

function estimatedExplosiveness(p: FplPlayer): number {
  const formRatio = p.points > 0 ? clamp(p.form / (p.points / 10), 0, 2) / 2 : 0.5;
  const xgi = clamp(p.xGI / 1.0, 0, 1);
  return clamp(formRatio * 0.55 + xgi * 0.45);
}

function estimatedRecentHaulPct(p: FplPlayer): number {
  return clamp(estimatedExplosiveness(p) * 100);
}

function estimatedXgiVolatility(p: FplPlayer): number {
  const mean = Math.max(0.05, p.xGI);
  const spread = Math.abs(p.form - p.points / 10) / Math.max(1, p.points / 10);
  return clamp(spread * 70 + clamp(mean * 25));
}

export function calculateWcs(p: FplPlayer, runsByTeam?: Map<number, TeamFixtureRun>, recentHaulPct?: number, xgiVolatility?: number): number {
  const fdr = fdrFor(p, runsByTeam);
  const haul = recentHaulPct ?? estimatedRecentHaulPct(p);
  const volatility = xgiVolatility ?? estimatedXgiVolatility(p);
  return round(clamp(haul * 0.40 + volatility * 0.30 + fixtureScore(fdr) * 0.30), 1);
}

function priceTierFactor(price: number): number {
  if (price <= 5.0) return 1.3;
  if (price <= 7.0) return 1.5;
  if (price <= 9.0) return 1.2;
  return 1.0;
}

export function calculateDtq(p: FplPlayer, hsfiScore = calculateHsfi(p)): number {
  return round(((100 - p.ownershipPct) * hsfiScore * priceTierFactor(p.price)) / 100, 1);
}

export function calculateOwnershipBonus(ownershipPct: number): number {
  if (ownershipPct < 30) return 30;
  if (ownershipPct <= 50) return 15;
  if (ownershipPct <= 70) return 0;
  return -20;
}

export function calculateWcps(p: FplPlayer, hsfiScore = calculateHsfi(p), wcsScore = calculateWcs(p), miniOwnershipPct = p.ownershipPct): number {
  return round(clamp(hsfiScore * 0.4 + wcsScore * 0.3 + calculateOwnershipBonus(miniOwnershipPct) * 0.3), 1);
}

/**
 * Calculates complete DGH Player Metrics package for any player.
 */
export function calculateDghPlayerMetrics(
  p: FplPlayer,
  options: {
    runsByTeam?: Map<number, TeamFixtureRun>;
    miniOwnershipPct?: number;
    recentHaulPct?: number;
    xgiVolatility?: number;
    explosivenessIndex?: number;
    setPieces?: { penalties?: boolean; corners?: boolean; freeKicks?: boolean };
  } = {}
): DghPlayerMetrics {
  const h = calculateHsfi(p, options.runsByTeam, options.setPieces);
  const wi = calculateWcs(p, options.runsByTeam, options.recentHaulPct, options.xgiVolatility);
  const ex = options.explosivenessIndex ?? estimatedExplosiveness(p);
  const own = options.miniOwnershipPct ?? p.ownershipPct;

  return {
    hsfi: h,
    bv: calculateBv(p, h),
    mdi: calculateMdi(p, h, ex),
    wcs: wi,
    dtq: calculateDtq(p, h),
    wcps: calculateWcps(p, h, wi, own),
    miniOwnershipPct: own,
    explosivenessIndex: round(ex, 2),
    recentHaulPct: round(options.recentHaulPct ?? estimatedRecentHaulPct(p), 1),
    xgiVolatility: round(options.xgiVolatility ?? estimatedXgiVolatility(p), 1),
    fixtureFdr: fdrFor(p, options.runsByTeam),
    estimated: options.recentHaulPct === undefined,
  };
}

/**
 * Calculates Transfer Efficiency Score (TES) for a given transfer.
 */
export function calculateTes(
  playerOut: DghPlayerMetrics,
  playerIn: DghPlayerMetrics,
  costPenalty: number
): { tesScore: number; status: "STRONG_BUY" | "BUY" | "HOLD" | "AVOID" } {
  const rawDelta = playerIn.wcps - playerOut.wcps;
  const netDelta = rawDelta - costPenalty * 2.5;
  const tesScore = round(netDelta, 1);

  let status: "STRONG_BUY" | "BUY" | "HOLD" | "AVOID" = "HOLD";
  if (tesScore >= 15) status = "STRONG_BUY";
  else if (tesScore >= 5) status = "BUY";
  else if (tesScore < -5) status = "AVOID";

  return { tesScore, status };
}
