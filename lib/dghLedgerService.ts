import { fpl } from "./fplClient";
import { getAllDghLedgerRows, saveDghLedgerRows, saveDghManagerMetadata, type DghLedgerRow } from "./seasonStore";

/**
 * DGH Comprehensive Table — raw ledger ingestion.
 *
 * Pulls each manager's official per-GW history (which already contains
 * `event_transfers_cost` = transfer hit points and `points_on_bench`) and,
 * for any GW where Triple Captain was active, fetches that single GW's
 * picks + live feed to compute the extra (3rd) multiplier's worth of points.
 *
 * Everything here is derived from the official FPL API — no invented data.
 */

async function mapLimit<T, R>(items: T[], limit: number, worker: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function run() {
    while (true) {
      const n = i++;
      if (n >= items.length) return;
      out[n] = await worker(items[n]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, run));
  return out;
}

export type LedgerManager = { entryId: number; managerName: string; teamName: string };

/**
 * Computes the Triple Captain's extra (3rd multiplier) points for a single
 * GW: under TC the captain's multiplier is 3x instead of the normal 2x, so
 * the "extra" to deduct is exactly 1x the captain's own raw GW points.
 */
async function computeTcExtraPoints(entryId: number, event: number, forceRefresh: boolean): Promise<number> {
  try {
    const [picksRes, liveRes] = await Promise.all([fpl.picks(entryId, event, forceRefresh), fpl.live(event, forceRefresh)]);
    const captainPick = picksRes.data.picks.find((p) => p.is_captain);
    if (!captainPick) return 0;
    const stats = liveRes.data.elements.find((e) => e.id === captainPick.element)?.stats;
    return Math.max(0, stats?.total_points ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Fetch and persist the full DGH ledger (raw points, hits, BB bench, TC extra)
 * for a list of managers, up to `maxEvent`. Designed to run incrementally —
 * safe to call repeatedly; results upsert per (event, entryId).
 */
export async function syncDghLedger(managers: LedgerManager[], maxEvent: number, forceRefresh = false): Promise<DghLedgerRow[]> {
  await saveDghManagerMetadata(managers);
  const results = await mapLimit(managers, 4, async (m): Promise<DghLedgerRow[]> => {
    try {
      const history = (await fpl.history(m.entryId, forceRefresh)).data;
      const chipByEvent = new Map(history.chips.map((c) => [c.event, c.name] as const));
      const relevant = history.current.filter((gw) => gw.event <= maxEvent);

      const rows = await mapLimit(relevant, 3, async (gw): Promise<DghLedgerRow> => {
        const chip = chipByEvent.get(gw.event) ?? null;
        // Bench points only count against DGH scoring in the GW Bench Boost was played —
        // otherwise the bench never contributed to `points` in the first place.
        const bbBenchPoints = chip === "bboost" ? Math.max(0, gw.points_on_bench ?? 0) : 0;
        const tcExtraPoints = chip === "3xc" ? await computeTcExtraPoints(m.entryId, gw.event, forceRefresh) : 0;
        return {
          event: gw.event,
          entryId: m.entryId,
          managerName: m.managerName,
          teamName: m.teamName,
          rawPoints: gw.points,
          transferHits: gw.event_transfers_cost ?? 0,
          bbBenchPoints,
          tcExtraPoints,
          activeChip: chip,
          overallRank: gw.overall_rank ?? null,
        };
      });
      return rows;
    } catch {
      return [];
    }
  });
  const fresh = results.flat();
  const existing = await getAllDghLedgerRows();
  const requestedIds = new Set(managers.map((m) => m.entryId));
  const freshKeys = new Set(fresh.map((r) => `${r.entryId}:${r.event}`));
  const retained = existing.filter((r) => requestedIds.has(r.entryId) && !freshKeys.has(`${r.entryId}:${r.event}`) && r.event <= maxEvent);
  const merged = [...retained, ...fresh].sort((a,b) => a.event-b.event || a.entryId-b.entryId);
  await saveDghLedgerRows(fresh);
  return merged;
}
