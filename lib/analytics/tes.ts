/**
 * DGH Transfer Effectiveness Score (TES) — FPL_2026-27_SYSTEM.md formula:
 *   TES = [(Transfer_In_Pts − Transfer_Out_Pts) − 4] × Differential_Weight
 *   Differential_Weight: <20% own → 1.5x | 20–40% → 1.2x | 40–60% → 1.0x | >60% → 0.8x
 *   Target: TES ≥ +5 per transfer
 *
 * This module is pure and deterministic: given the official transfer record
 * plus each involved player's actual round-by-round points, it always
 * produces the same number. Fetching those inputs (fpl.transfers,
 * fpl.elementSummary) lives in lib/tesService.ts — the same
 * pure-engine/fetching-service split the app already uses for
 * lib/analytics/dghMetrics.ts vs lib/spyService.ts.
 *
 * DATA-INTEGRITY NOTE: the formula's "% own" band is mini-league ownership
 * at the moment of the transfer. The FPL API does not expose historical
 * mini-league ownership (only a live snapshot of each rival's current
 * squad), so this uses each player's CURRENT mini-league ownership % as the
 * best available proxy — the same kind of available-data estimate
 * dghMetrics.ts already uses for WCS/MDI, and is labelled `estimated: true`
 * here for the same reason: never presented as a verified historical figure.
 */

export type TransferTesEntry = {
  event: number;
  elementIn: number;
  elementOut: number;
  webNameIn: string;
  webNameOut: string;
  pointsIn: number;
  pointsOut: number;
  differentialWeight: number;
  tes: number;
  estimated: true;
};

export function differentialWeight(miniLeagueOwnershipPct: number): number {
  if (miniLeagueOwnershipPct < 20) return 1.5;
  if (miniLeagueOwnershipPct <= 40) return 1.2;
  if (miniLeagueOwnershipPct <= 60) return 1.0;
  return 0.8;
}

/** Sum of a player's official round-by-round points from `fromEvent`
 * through `throughEvent` inclusive. Missing rounds (player wasn't in the
 * squad / summary not loaded) contribute 0, never fabricated. */
function pointsInRange(history: Map<number, number> | undefined, fromEvent: number, throughEvent: number): number {
  if (!history) return 0;
  let sum = 0;
  for (let round = fromEvent; round <= throughEvent; round += 1) sum += history.get(round) ?? 0;
  return sum;
}

export function computeTransferTes(input: {
  transfers: { element_in: number; element_out: number; event: number }[];
  /** The most recent gameweek whose points are final — transfers in a GW
   * that hasn't finished yet are excluded (their TES is not yet knowable). */
  latestFinishedEvent: number;
  pointsByElement: Map<number, Map<number, number>>; // elementId -> round -> total_points
  webNameByElement: Map<number, string>;
  /** Current mini-league ownership % (0-100) of the incoming player. */
  miniOwnershipByElement: Map<number, number>;
}): TransferTesEntry[] {
  const out: TransferTesEntry[] = [];
  for (const t of input.transfers) {
    if (t.event > input.latestFinishedEvent) continue;
    const pointsIn = pointsInRange(input.pointsByElement.get(t.element_in), t.event, input.latestFinishedEvent);
    const pointsOut = pointsInRange(input.pointsByElement.get(t.element_out), t.event, input.latestFinishedEvent);
    const ownership = input.miniOwnershipByElement.get(t.element_in) ?? 50;
    const weight = differentialWeight(ownership);
    const tes = Math.round(((pointsIn - pointsOut - 4) * weight) * 10) / 10;
    out.push({
      event: t.event,
      elementIn: t.element_in,
      elementOut: t.element_out,
      webNameIn: input.webNameByElement.get(t.element_in) ?? `#${t.element_in}`,
      webNameOut: input.webNameByElement.get(t.element_out) ?? `#${t.element_out}`,
      pointsIn,
      pointsOut,
      differentialWeight: weight,
      tes,
      estimated: true,
    });
  }
  return out.sort((a, b) => b.event - a.event);
}
