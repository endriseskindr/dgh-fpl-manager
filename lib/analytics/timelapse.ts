import type { ComprehensiveTable } from "./comprehensiveTable";

/**
 * Standings Timelapse — derives each manager's cumulative DGH points and
 * league rank as of every gameweek played, purely from the DGH ledger
 * (comprehensiveTable.ts) already loaded elsewhere in the app. No extra
 * network calls or storage: this is a re-projection of data already in
 * WarRoomData.dghTable.
 */

export type TimelapsePoint = { event: number; cumulativePoints: number; rank: number; gwAdjusted: number };
export type TimelapseSeries = { entryId: number; managerName: string; teamName: string; points: TimelapsePoint[] };
export type Timelapse = { events: number[]; series: TimelapseSeries[] };

export function buildStandingsTimelapse(table: ComprehensiveTable): Timelapse {
  const events = table.events;
  const cumByManager = new Map<number, number>();
  const perEventCum = new Map<number, Map<number, number>>();

  for (const event of events) {
    const map = new Map<number, number>();
    for (const m of table.managers) {
      const row = m.gwRows.find((r) => r.event === event);
      const prev = cumByManager.get(m.entryId) ?? 0;
      const next = prev + (row ? row.gwAdjusted : 0);
      cumByManager.set(m.entryId, next);
      map.set(m.entryId, next);
    }
    perEventCum.set(event, map);
  }

  const series: TimelapseSeries[] = table.managers.map((m) => ({ entryId: m.entryId, managerName: m.managerName, teamName: m.teamName, points: [] }));
  const seriesByEntry = new Map(series.map((s) => [s.entryId, s]));

  for (const event of events) {
    const map = perEventCum.get(event)!;
    const ranked = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const rankOf = new Map<number, number>();
    let rank = 0;
    let last: number | null = null;
    ranked.forEach(([entryId, pts], idx) => {
      if (last === null || pts !== last) {
        rank = idx + 1;
        last = pts;
      }
      rankOf.set(entryId, rank);
    });
    for (const m of table.managers) {
      const row = m.gwRows.find((r) => r.event === event);
      const s = seriesByEntry.get(m.entryId);
      if (!s) continue;
      s.points.push({ event, cumulativePoints: map.get(m.entryId) ?? 0, rank: rankOf.get(m.entryId) ?? 0, gwAdjusted: row?.gwAdjusted ?? 0 });
    }
  }

  return { events, series };
}

/** Full standings table as of a specific gameweek in the timelapse, ranked. */
export function standingsAtEvent(timelapse: Timelapse, event: number): { entryId: number; managerName: string; teamName: string; rank: number; cumulativePoints: number; gwAdjusted: number }[] {
  return timelapse.series
    .map((s) => {
      const point = s.points.find((p) => p.event === event);
      return point ? { entryId: s.entryId, managerName: s.managerName, teamName: s.teamName, rank: point.rank, cumulativePoints: point.cumulativePoints, gwAdjusted: point.gwAdjusted } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.rank - b.rank);
}
