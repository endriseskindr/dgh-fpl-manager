import { fpl } from "./fplClient";
import { MY_ENTRY_ID } from "./config";
import { computeTransferTes, type TransferTesEntry } from "./analytics/tes";
import type { EnrichedPlayer } from "./types";

/** Small local concurrency limiter — deliberately not imported from
 * dataService.ts's mapWithConcurrency to avoid a circular import
 * (dataService.ts calls into this service). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runner() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () => runner()));
  return results;
}

/**
 * Fetches my official transfer history + each involved player's official
 * round-by-round points, then runs the pure TES engine (lib/analytics/tes.ts).
 * Best-effort by design (matches spy/chipTiming in dataService.ts): a
 * failure anywhere here must never block the rest of war room data — see
 * the try/catch around this call in loadWarRoomData.
 */
export async function buildTransferTesLog(input: {
  playerIndex: Map<number, EnrichedPlayer>;
  miniOwnershipByElement: Map<number, number>;
  latestFinishedEvent: number;
  forceRefresh: boolean;
}): Promise<TransferTesEntry[]> {
  if (input.latestFinishedEvent < 1) return [];
  const transfersRes = await fpl.transfers(MY_ENTRY_ID, input.forceRefresh);
  const transfers = transfersRes.data.filter((t) => t.event <= input.latestFinishedEvent);
  if (!transfers.length) return [];

  const uniqueElements = [...new Set(transfers.flatMap((t) => [t.element_in, t.element_out]))];
  const pointsByElement = new Map<number, Map<number, number>>();
  await mapWithConcurrency(uniqueElements, 4, async (elementId) => {
    try {
      const summary = await fpl.elementSummary(elementId, input.forceRefresh);
      const roundMap = new Map<number, number>();
      for (const h of summary.data.history) roundMap.set(h.round, Number(h.total_points ?? 0));
      pointsByElement.set(elementId, roundMap);
    } catch {
      // Leave this element out of pointsByElement — computeTransferTes treats
      // a missing history map as 0 points rather than throwing, so one
      // player's summary failing never drops the whole TES log.
    }
  });

  const webNameByElement = new Map(uniqueElements.map((id) => [id, input.playerIndex.get(id)?.webName ?? `#${id}`]));

  return computeTransferTes({
    transfers,
    latestFinishedEvent: input.latestFinishedEvent,
    pointsByElement,
    webNameByElement,
    miniOwnershipByElement: input.miniOwnershipByElement,
  });
}
