import type { EnrichedPlayer, PricePrediction } from "../types";

/**
 * Price-change prediction, ported from x402-fpl-api-main's prices.py.
 * Net new — nothing in DGH computed this before (see PORT_NOTES.md).
 *
 * FPL price changes happen nightly based on net transfer volume. The FPL API
 * doesn't expose the exact threshold, so — exactly as the source material
 * does — this returns a RELATIVE confidence estimate from net transfers this
 * event, not a guaranteed prediction. Do not present this as certain.
 */
const RISE_THRESHOLD = 500_000;
const FALL_THRESHOLD = -500_000;

const INJURY_STATUSES = new Set(["i", "d", "s", "u"]);

export type PricePredictionSet = { risers: PricePrediction[]; fallers: PricePrediction[] };

export function buildPricePredictions(pool: EnrichedPlayer[], topN = 20): PricePredictionSet {
  const risers: PricePrediction[] = [];
  const fallers: PricePrediction[] = [];

  for (const p of pool) {
    if (INJURY_STATUSES.has(p.status)) continue;
    const net = p.transfersInEvent - p.transfersOutEvent;
    if (net === 0) continue;

    const entry: PricePrediction = {
      playerId: p.id,
      webName: p.webName,
      teamShort: p.teamShort,
      position: p.position,
      direction: net > 0 ? "RISE" : "FALL",
      confidencePct: net > 0
        ? Math.min(100, Math.round((net / RISE_THRESHOLD) * 100))
        : Math.min(100, Math.round((Math.abs(net) / Math.abs(FALL_THRESHOLD)) * 100)),
      currentPrice: p.price,
      netTransfersEvent: net,
      transfersInEvent: p.transfersInEvent,
      transfersOutEvent: p.transfersOutEvent,
    };

    if (net > 0) risers.push(entry);
    else fallers.push(entry);
  }

  risers.sort((a, b) => b.netTransfersEvent - a.netTransfersEvent);
  fallers.sort((a, b) => a.netTransfersEvent - b.netTransfersEvent);

  return { risers: risers.slice(0, topN), fallers: fallers.slice(0, topN) };
}
