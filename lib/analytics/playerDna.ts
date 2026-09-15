import type { EnrichedPlayer } from "../types";
import { projectNextGw } from "./projection";
import { predictPriceSignal, type PriceSignal } from "./ultimateEngine";

/**
 * DGH Player DNA — a single composite profile combining official FPL fields
 * into a transparent 0-100 score, a BUY/HOLD/SELL/AVOID verdict, rotation
 * risk, form trend and set-piece role. Every input is a real official FPL
 * field (form, ICT, xGI, minutes, starts, chance-of-playing, transfer
 * deltas, set-piece order). Nothing here is invented or scraped.
 */

export type DghPlayerVerdict = "BUY" | "HOLD" | "SELL" | "AVOID";
export type RotationRisk = "LOW" | "MEDIUM" | "HIGH";
export type FormTrend = "RISING" | "STABLE" | "FALLING";

export type PlayerDna = {
  dghScore: number; // 0-100
  verdict: DghPlayerVerdict;
  rotationRisk: RotationRisk;
  trend: FormTrend;
  priceSignal: PriceSignal;
  setPieceRoles: string[];
  components: { form: number; underlying: number; minutes: number; fixture: number; value: number };
  reasons: string[];
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeSetPieceRoles(p: EnrichedPlayer): string[] {
  const roles: string[] = [];
  if (p.setPieces.corners) roles.push("Corners / indirect free kicks");
  if (p.setPieces.freeKicks) roles.push("Direct free kicks");
  if (p.setPieces.penalties) roles.push("Penalties");
  return roles;
}

/** Ratio of starts to gameweeks played so far, adjusted for flagged availability. */
export function computeRotationRisk(p: EnrichedPlayer, gameweeksPlayed: number): RotationRisk {
  const denominator = Math.max(1, gameweeksPlayed);
  const startRatio = p.starts / denominator;
  let risk: RotationRisk = startRatio >= 0.75 ? "LOW" : startRatio >= 0.45 ? "MEDIUM" : "HIGH";
  if (p.availability.confidence === "SPECULATIVE") risk = "HIGH";
  else if (p.availability.confidence === "PROBABLE" && risk === "LOW") risk = "MEDIUM";
  return risk;
}

/** FPL's own "form" field is already a short recent-form rolling average, so
 * comparing it to the season-long points-per-game is a legitimate, non-fabricated trend signal. */
export function computeFormTrend(p: EnrichedPlayer): FormTrend {
  if (p.pointsPerGame <= 0) return p.form > 0 ? "RISING" : "STABLE";
  const ratio = p.form / p.pointsPerGame;
  if (ratio >= 1.15) return "RISING";
  if (ratio <= 0.85) return "FALLING";
  return "STABLE";
}

export function computePlayerDna(
  p: EnrichedPlayer,
  ctx: { gameweeksPlayed: number; fixtureAdjustedNextGw?: number },
): PlayerDna {
  const projected = ctx.fixtureAdjustedNextGw ?? projectNextGw(p);
  const rotationRisk = computeRotationRisk(p, ctx.gameweeksPlayed);
  const trend = computeFormTrend(p);
  const priceSignal = predictPriceSignal(p);
  const setPieceRoles = computeSetPieceRoles(p);

  const formComponent = clamp(p.form * 11);
  const underlyingComponent = clamp(p.xGI * 45 + p.ictIndex * 0.5);
  const minutesComponent = clamp((p.minutes / 900) * 100);
  const fixtureComponent = clamp(projected * 9);
  const valueComponent = clamp(100 - p.price * 4.2);

  const riskPenalty = rotationRisk === "HIGH" ? 30 : rotationRisk === "MEDIUM" ? 14 : 4;
  const availabilityPenalty =
    p.availability.confidence === "SPECULATIVE" ? 25 : p.availability.confidence === "PROBABLE" ? 10 : 0;

  const rawScore =
    formComponent * 0.28 +
    underlyingComponent * 0.22 +
    minutesComponent * 0.18 +
    fixtureComponent * 0.2 +
    valueComponent * 0.12;
  const dghScore = Math.round(clamp(rawScore - riskPenalty * 0.4 - availabilityPenalty * 0.4));

  let verdict: DghPlayerVerdict;
  if (p.availability.confidence === "SPECULATIVE" || rotationRisk === "HIGH") {
    verdict = dghScore >= 70 ? "HOLD" : "AVOID";
  } else if (dghScore >= 72) {
    verdict = "BUY";
  } else if (dghScore >= 50) {
    verdict = "HOLD";
  } else {
    verdict = "SELL";
  }

  const reasons: string[] = [
    `Form ${p.form.toFixed(1)} vs season PPG ${p.pointsPerGame.toFixed(1)} → ${trend}`,
    `${rotationRisk} rotation risk (${p.starts} starts through GW${ctx.gameweeksPlayed})`,
  ];
  if (p.availability.confidence !== "CONFIRMED") {
    reasons.push(`Availability: ${p.availability.confidence}${p.availability.news ? ` — ${p.availability.news}` : ""}`);
  }
  reasons.push(`Price signal: ${priceSignal.label} (${priceSignal.confidencePct}% confidence)`);
  if (setPieceRoles.length) reasons.push(`Set pieces: ${setPieceRoles.join(", ")}`);

  return {
    dghScore,
    verdict,
    rotationRisk,
    trend,
    priceSignal,
    setPieceRoles,
    components: {
      form: Math.round(formComponent),
      underlying: Math.round(underlyingComponent),
      minutes: Math.round(minutesComponent),
      fixture: Math.round(fixtureComponent),
      value: Math.round(valueComponent),
    },
    reasons,
  };
}

export function verdictColor(theme: { success: string; primary: string; warning: string; error: string }, v: DghPlayerVerdict) {
  if (v === "BUY") return theme.success;
  if (v === "HOLD") return theme.primary;
  if (v === "SELL") return theme.warning;
  return theme.error;
}

/** Given a small set of alternatives, identify which is the strongest fit for
 * THIS squad — not just the statistically best player — by factoring
 * affordability against bank + the selling price of a same-position player
 * already owned, on top of the DGH score. */
export function bestFitForSquad(
  candidates: { player: EnrichedPlayer; dna: PlayerDna }[],
  bank: number,
  ownedInSamePosition: EnrichedPlayer[],
): { playerId: number; reasoning: string } | null {
  if (!candidates.length) return null;
  const cheapestOwned = ownedInSamePosition.length
    ? Math.min(...ownedInSamePosition.map((o) => o.price))
    : 0;
  const affordableBudget = bank + cheapestOwned;
  const scored = candidates.map((c) => {
    const affordable = c.player.price <= affordableBudget + 0.05;
    const budgetPenalty = affordable ? 0 : (c.player.price - affordableBudget) * 20;
    return { ...c, adjusted: c.dna.dghScore - budgetPenalty, affordable };
  });
  scored.sort((a, b) => b.adjusted - a.adjusted);
  const best = scored[0];
  const statisticallyBest = [...candidates].sort((a, b) => b.dna.dghScore - a.dna.dghScore)[0];
  const reasoning =
    best.player.id === statisticallyBest.player.id
      ? `Highest DGH score (${best.dna.dghScore}) and affordable within your bank + a same-position sale.`
      : best.affordable
        ? `Not the single highest DGH score, but the best option you can actually afford right now (£${best.player.price.toFixed(1)}m vs a £${affordableBudget.toFixed(1)}m budget).`
        : `Best available option, though it still stretches your budget by roughly £${(best.player.price - affordableBudget).toFixed(1)}m.`;
  return { playerId: best.player.id, reasoning };
}
