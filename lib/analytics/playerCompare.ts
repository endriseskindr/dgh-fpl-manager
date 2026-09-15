import type { EnrichedPlayer } from "../types";
import { projectNextGw } from "./projection";

export type CompareMetric = {
  key: string;
  label: string;
  aValue: number;
  bValue: number;
  // 0-100 normalised value for each player, for the radar chart. Higher is
  // always "better" on this axis (defensive metrics like "points per
  // million" already point the right way; nothing here is inverted because
  // all chosen metrics are naturally "more is better" for a fantasy asset).
  aNorm: number;
  bNorm: number;
  format: "pts" | "money" | "pct" | "count" | "decimal";
};

export type PlayerCompareResult = {
  a: EnrichedPlayer;
  b: EnrichedPlayer;
  metrics: CompareMetric[];
  verdict: { winner: "a" | "b" | "even"; reason: string };
};

function fmtValue(v: number, format: CompareMetric["format"]): string {
  switch (format) {
    case "pts": return v.toFixed(1);
    case "money": return `£${v.toFixed(1)}m`;
    case "pct": return `${v.toFixed(1)}%`;
    case "count": return String(Math.round(v));
    default: return v.toFixed(2);
  }
}

/** Normalises a value against the higher of the two so the radar chart is always readable regardless of the metric's natural scale. */
function pairNorm(a: number, b: number): [number, number] {
  const max = Math.max(a, b, 0.0001);
  return [Math.round((a / max) * 100), Math.round((b / max) * 100)];
}

export type CompareMetricDisplay = CompareMetric & { aDisplay: string; bDisplay: string };

/**
 * Builds a full side-by-side comparison of two players across the metrics
 * that matter for an FPL squad decision: total points, form, price, value
 * (points per million), ownership, underlying attacking numbers (xG/xA/xGI),
 * bonus/BPS, ICT, and minutes reliability.
 */
export function comparePlayers(a: EnrichedPlayer, b: EnrichedPlayer): PlayerCompareResult {
  const valueA = a.price > 0 ? a.totalPoints / a.price : 0;
  const valueB = b.price > 0 ? b.totalPoints / b.price : 0;
  const projA = projectNextGw(a);
  const projB = projectNextGw(b);

  const raw: { key: string; label: string; a: number; b: number; format: CompareMetric["format"] }[] = [
    { key: "totalPoints", label: "Total points", a: a.totalPoints, b: b.totalPoints, format: "pts" },
    { key: "form", label: "Form", a: a.form, b: b.form, format: "decimal" },
    { key: "pointsPerGame", label: "Points per game", a: a.pointsPerGame, b: b.pointsPerGame, format: "decimal" },
    { key: "nextGwProjection", label: "Next GW projection", a: projA, b: projB, format: "pts" },
    { key: "value", label: "Value (pts per £m)", a: valueA, b: valueB, format: "decimal" },
    { key: "xG", label: "Expected goals (xG)", a: a.xG, b: b.xG, format: "decimal" },
    { key: "xA", label: "Expected assists (xA)", a: a.xA, b: b.xA, format: "decimal" },
    { key: "xGI", label: "Expected goal involvement", a: a.xGI, b: b.xGI, format: "decimal" },
    { key: "ictIndex", label: "ICT index", a: a.ictIndex, b: b.ictIndex, format: "decimal" },
    { key: "bonus", label: "Bonus points", a: a.bonus, b: b.bonus, format: "count" },
    { key: "bps", label: "BPS", a: a.bps, b: b.bps, format: "count" },
    { key: "ownershipPct", label: "Ownership", a: a.ownershipPct, b: b.ownershipPct, format: "pct" },
    { key: "minutes", label: "Minutes played", a: a.minutes, b: b.minutes, format: "count" },
    { key: "price", label: "Price", a: a.price, b: b.price, format: "money" },
  ];

  const metrics: CompareMetric[] = raw.map((m) => {
    const [aNorm, bNorm] = pairNorm(m.a, m.b);
    return { key: m.key, label: m.label, aValue: m.a, bValue: m.b, aNorm, bNorm, format: m.format };
  });

  // Verdict: weighted composite favouring forward-looking signal (next-GW
  // projection, form) over season-long totals, since the comparison is
  // primarily used to decide a transfer going forward.
  const weighted = (p: EnrichedPlayer, proj: number, value: number) =>
    proj * 3 + p.form * 1.5 + p.pointsPerGame * 1 + value * 0.5 + Math.min(2, p.xGI) * 1;
  const scoreA = weighted(a, projA, valueA);
  const scoreB = weighted(b, projB, valueB);
  const diff = scoreA - scoreB;
  const winner: "a" | "b" | "even" = Math.abs(diff) < 0.15 ? "even" : diff > 0 ? "a" : "b";
  const reason =
    winner === "even"
      ? "These two are essentially neck-and-neck on current form, projection and value."
      : `${(winner === "a" ? a : b).webName} rates higher on next-GW projection, recent form and underlying value.`;

  return { a, b, metrics, verdict: { winner, reason } };
}

export function formatMetric(m: CompareMetric): { aDisplay: string; bDisplay: string } {
  return { aDisplay: fmtValue(m.aValue, m.format), bDisplay: fmtValue(m.bValue, m.format) };
}

/** Metrics chosen for the radar/SVG visualization — a compact subset so the shape stays legible. */
export const RADAR_METRIC_KEYS = ["nextGwProjection", "form", "value", "xGI", "ictIndex", "ownershipPct"];
