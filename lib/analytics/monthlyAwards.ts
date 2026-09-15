import type { ComprehensiveTable } from "./comprehensiveTable";
import type { FplEvent } from "../types";

/**
 * Monthly Awards — rolls the per-GW DGH ledger (already computed by
 * comprehensiveTable.ts) up into calendar-month award categories.
 *
 * Deliberately reuses only data already loaded into the app (ComprehensiveTable
 * + bootstrap events for deadline dates) — no new network calls, no new
 * storage. Pure and deterministic: same ledger + events in, same awards out.
 */

export type MonthlyAwardWinner = {
  entryId: number;
  managerName: string;
  teamName: string;
  value: number;
  detail: string;
};

export type MonthlyAwardCategory = {
  key: string;
  label: string;
  description: string;
  winner: MonthlyAwardWinner | null;
};

export type MonthAwards = {
  monthKey: string; // e.g. "2026-09"
  monthLabel: string; // e.g. "September 2026"
  events: number[];
  categories: MonthlyAwardCategory[];
};

function monthKeyFromISO(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleString("en-GB", { month: "long", year: "numeric" });
  return { key, label };
}

function stddev(scores: number[]): number {
  if (scores.length < 2) return Infinity;
  const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + (x - avg) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

type Agg = {
  entryId: number;
  managerName: string;
  teamName: string;
  totalAdjusted: number;
  bestGw: number;
  hitsTaken: number;
  podiums: number;
  moneyWon: number;
  scores: number[];
};

function topWinner(aggs: Agg[], pick: (a: Agg) => number, detail: (a: Agg) => string, higherBetter = true): MonthlyAwardWinner | null {
  if (!aggs.length) return null;
  const sorted = [...aggs].sort((a, b) => (higherBetter ? pick(b) - pick(a) : pick(a) - pick(b)));
  const best = sorted[0];
  const bestValue = pick(best);
  // Don't crown a winner when every candidate is tied at a non-meaningful value
  // (e.g. everyone took 0 hits — "Hit Merchant" shouldn't have a winner).
  if (!Number.isFinite(bestValue)) return null;
  return { entryId: best.entryId, managerName: best.managerName, teamName: best.teamName, value: bestValue, detail: detail(best) };
}

/**
 * Groups the season's GWs into calendar months (by each event's official
 * deadline date) and computes six award categories per month. Returns
 * months most-recent-first.
 */
export function buildMonthlyAwards(table: ComprehensiveTable, events: FplEvent[]): MonthAwards[] {
  const eventMonth = new Map<number, { key: string; label: string }>();
  for (const e of events) eventMonth.set(e.id, monthKeyFromISO(e.deadline_time));

  const monthsOrder: string[] = [];
  const monthEvents = new Map<string, number[]>();
  const monthLabels = new Map<string, string>();
  for (const event of table.events) {
    const m = eventMonth.get(event);
    if (!m) continue;
    if (!monthEvents.has(m.key)) {
      monthEvents.set(m.key, []);
      monthsOrder.push(m.key);
      monthLabels.set(m.key, m.label);
    }
    monthEvents.get(m.key)!.push(event);
  }

  const months: MonthAwards[] = monthsOrder.map((key) => {
    const evs = monthEvents.get(key)!;
    const evsSet = new Set(evs);

    const aggs: Agg[] = [];
    for (const m of table.managers) {
      const rowsInMonth = m.gwRows.filter((r) => evsSet.has(r.event));
      if (!rowsInMonth.length) continue;
      aggs.push({
        entryId: m.entryId,
        managerName: m.managerName,
        teamName: m.teamName,
        totalAdjusted: rowsInMonth.reduce((s, r) => s + r.gwAdjusted, 0),
        bestGw: Math.max(...rowsInMonth.map((r) => r.gwAdjusted)),
        hitsTaken: rowsInMonth.reduce((s, r) => s + r.transferHits, 0),
        podiums: rowsInMonth.filter((r) => r.place !== null).length,
        moneyWon: rowsInMonth.reduce((s, r) => s + r.prize, 0),
        scores: rowsInMonth.map((r) => r.gwAdjusted),
      });
    }

    const hasHits = aggs.some((a) => a.hitsTaken > 0);
    const hasMoney = aggs.some((a) => a.moneyWon > 0);
    const hasEnoughForConsistency = aggs.some((a) => a.scores.length >= 2);

    const categories: MonthlyAwardCategory[] = [
      {
        key: "manager",
        label: "Manager of the Month",
        description: "Highest total DGH-adjusted points across the month's gameweeks.",
        winner: topWinner(aggs, (a) => a.totalAdjusted, (a) => `${a.totalAdjusted} pts across ${a.scores.length} GW${a.scores.length === 1 ? "" : "s"}`),
      },
      {
        key: "peak",
        label: "Peak Performance",
        description: "Single best DGH-adjusted gameweek score in the month.",
        winner: topWinner(aggs, (a) => a.bestGw, (a) => `${a.bestGw} pts in one GW`),
      },
      {
        key: "podium",
        label: "Podium King",
        description: "Most top-3 gameweek finishes in the month.",
        winner: aggs.some((a) => a.podiums > 0) ? topWinner(aggs, (a) => a.podiums, (a) => `${a.podiums} podium finish${a.podiums === 1 ? "" : "es"}`) : null,
      },
      {
        key: "consistent",
        label: "Mr. Consistent",
        description: "Lowest score variance across the month — steady, not spiky.",
        winner: hasEnoughForConsistency ? topWinner(aggs.filter((a) => a.scores.length >= 2), (a) => stddev(a.scores), (a) => `±${stddev(a.scores).toFixed(1)} pts swing`, false) : null,
      },
      {
        key: "hits",
        label: "Hit Merchant",
        description: "Most transfer-hit points sacrificed in the month.",
        winner: hasHits ? topWinner(aggs, (a) => a.hitsTaken, (a) => `-${a.hitsTaken} pts in hits`) : null,
      },
      {
        key: "bank",
        label: "Bank Breaker",
        description: "Most prize money won in the month.",
        winner: hasMoney ? topWinner(aggs, (a) => a.moneyWon, (a) => `${table.currency} ${a.moneyWon.toFixed(0)} won`) : null,
      },
    ];

    return { monthKey: key, monthLabel: monthLabels.get(key)!, events: evs, categories };
  });

  return months.reverse();
}
