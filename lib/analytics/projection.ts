import type { EnrichedPlayer } from "../types";
import { fixtureProjectionMultiplier } from "./teamStrength";

/**
 * Single authoritative next-GW projection used by the entire app.
 * Inputs are official FPL fields already fetched by the app. No mock data.
 */
export function availabilityFactor(p: EnrichedPlayer): number {
  switch (p.availability.confidence) {
    case "CONFIRMED": return 1;
    case "SUPPORTED": return 0.85;
    case "PROBABLE": return 0.6;
    default: return 0.2;
  }
}

/**
 * `dghFixtureDifficulty` is optional (1-5, from lib/analytics/teamStrength's
 * buildDghFixtureDifficulty) and defaults to neutral (no adjustment) when
 * omitted, so every existing call site keeps producing byte-identical
 * projections. When supplied it nudges the projection by at most ±15% —
 * enough to matter for close transfer/captaincy calls without letting the
 * supplementary model override the official underlying-stats signal.
 */
export function projectNextGw(p: EnrichedPlayer, dghFixtureDifficulty?: number | null): number {
  const officialEp = p.epNext > 0 ? p.epNext : p.form * 0.75 + p.pointsPerGame * 0.5;
  const formSignal = p.form * 0.55 + p.pointsPerGame * 0.45;
  const attackingSignal = Math.min(3, (p.xG + p.xA) * 0.75);
  const minutesFactor = Math.min(1, Math.max(0.2, p.minutes / 900));
  const blended = officialEp * 0.65 + formSignal * 0.2 + attackingSignal * 0.15;
  const fixtureMultiplier = dghFixtureDifficulty == null ? 1 : fixtureProjectionMultiplier(dghFixtureDifficulty);
  return Math.max(0, Math.round(blended * availabilityFactor(p) * (0.82 + minutesFactor * 0.18) * fixtureMultiplier * 100) / 100);
}

export function captainVolatility(p: EnrichedPlayer): number {
  const attacking = Math.min(2.5, (p.xG + p.xA) * 0.7);
  const formVariance = Math.max(0.5, Math.abs(p.form - p.pointsPerGame));
  return Math.max(1.5, 3.2 + attacking + formVariance * 0.35);
}
