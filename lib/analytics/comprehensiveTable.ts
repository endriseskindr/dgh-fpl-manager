import type { DghLedgerRow, DghLeagueConfig, ManagerOverride } from "../seasonStore";

/**
 * DGH Mini-League Comprehensive Table — scoring + prize/fee/fine engine.
 *
 * Core scoring formula (DGH system):
 *   GW ADJUSTED = RAW FPL POINTS − TRANSFER HITS − BB BENCH POINTS − TC 3RD MULTIPLIER
 *   OVERALL     = Σ GW ADJUSTED POINTS
 *   NET MONEY   = PRIZES WON − FEES PAID − RELEGATION FINES
 *
 * This module is pure and deterministic: given a set of raw ledger rows +
 * league money config, it always produces the same table. No network calls,
 * no storage — those live in dghLedgerService.ts / seasonStore.ts. This
 * separation is what makes the What-If simulator possible (lib/analytics/whatIf.ts
 * reuses this exact engine on hypothetical inputs).
 */

export type GwRow = {
  event: number;
  entryId: number;
  managerName: string;
  teamName: string;
  gwRank: number;
  rawPoints: number;
  transferHits: number;
  bbBenchPoints: number;
  tcExtraPoints: number;
  gwAdjusted: number;
  isLast: boolean;
  relegationFine: boolean;
  place: 1 | 2 | 3 | null; // podium place this GW, by gwAdjusted
  prize: number;
  activeChip: string | null;
};

export type ManagerSeasonRow = {
  entryId: number;
  managerName: string;
  teamName: string;
  overallPoints: number;
  overallRank: number;
  wins: number;
  seconds: number;
  thirds: number;
  podiums: number;
  lastPlaceCount: number;
  gwsPlayed: number;
  moneyWon: number;
  feesPaid: number;
  finesPaid: number;
  netMoney: number;
  gwRows: GwRow[];
};

export type ComprehensiveTable = {
  events: number[];
  managers: ManagerSeasonRow[];
  currency: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Computes GW Adjusted for a single raw ledger row.
 * GW ADJUSTED = RAW − TRANSFER HITS − BB BENCH POINTS − TC 3RD MULTIPLIER
 */
export function dghScore(row: { rawPoints: number; transferHits: number; bbBenchPoints: number; tcExtraPoints: number }): number {
  return row.rawPoints - row.transferHits - row.bbBenchPoints - row.tcExtraPoints;
}


/** Backward-compatible name; all callers resolve to the same authoritative DGH formula. */
export const gwAdjustedPoints = dghScore;
/**
 * Builds the full DGH Mini-League Comprehensive Table from raw per-GW ledger
 * rows (official FPL data: raw points, transfer hit cost, bench points on
 * BB weeks, captain points on TC weeks) plus the league's money config.
 */
export function buildComprehensiveTable(
  ledgerRows: DghLedgerRow[],
  config: DghLeagueConfig,
  overrides: ManagerOverride[] = [],
  managers: { entryId: number; managerName: string; teamName: string }[] = [],
): ComprehensiveTable {
  const events = [...new Set(ledgerRows.map((r) => r.event))].sort((a, b) => a - b);
  const deduped = [...new Map(ledgerRows.map((r) => [`${r.entryId}:${r.event}`, r] as const)).values()];
  const managerIds = [...new Set([...deduped.map((r) => r.entryId), ...managers.map((m) => m.entryId)])];
  const overrideKey = (entryId: number, event: number) => `${entryId}:${event}`;
  const overrideMap = new Map(overrides.map((o) => [overrideKey(o.entryId, o.event), o]));

  // Prize pool per GW: explicit config value, or if left at 0, derive from
  // (fee_per_gw * number of paying managers) so the table stays correct
  // even if the user hasn't manually set a pool.
  const managersByEvent = new Map<number, DghLedgerRow[]>();
  for (const row of deduped) {
    managersByEvent.set(row.event, [...(managersByEvent.get(row.event) ?? []), row]);
  }

  const gwRowsByManager = new Map<number, GwRow[]>();
  const runningTotal = new Map<number, number>();

  for (const event of events) {
    const rowsThisGw = managersByEvent.get(event) ?? [];
    const adjusted = rowsThisGw.map((r) => ({ row: r, gwAdjusted: dghScore(r) }));
    const sorted = [...adjusted].sort((a, b) => b.gwAdjusted - a.gwAdjusted);
    // Relegation ("isLast") must land on the lowest-scoring NON-DISQUALIFIED
    // manager only. Wildcard/Free Hit managers are DQ for the GW relegation
    // spot (mirrors the live tab's eligibility rule) and must never be
    // eligible for the relegation fine even if their adjusted score is the
    // numeric minimum for the gameweek.
    const isDisqualified = (chip: string | null) => chip === "wildcard" || chip === "freehit";
    const eligibleForRelegation = sorted.filter((x) => !isDisqualified(x.row.activeChip));
    const lowest = eligibleForRelegation.length ? Math.min(...eligibleForRelegation.map((x) => x.gwAdjusted)) : null;
    const paidManagerCount = sorted.length;
    const derivedPool = config.prizePoolPerGw > 0 ? config.prizePoolPerGw : config.feePerGw * paidManagerCount;

    // Rank with standard competition ranking (ties share rank, e.g. 1,2,2,4)
    let rank = 0;
    let lastScore: number | null = null;
    // Compute tie-group sizes before awarding prizes. Otherwise the first
    // manager in a tied place would receive the full prize and later tied
    // managers would receive a smaller share.
    const rankCounts = new Map<number, number>();
    const scoreToRank = new Map<number, number>();
    sorted.forEach((x, idx) => {
      const r = scoreToRank.get(x.gwAdjusted) ?? (idx + 1);
      scoreToRank.set(x.gwAdjusted, r);
      rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    });

    sorted.forEach((x, idx) => {
      if (lastScore === null || x.gwAdjusted !== lastScore) {
        rank = idx + 1;
        lastScore = x.gwAdjusted;
      }
      const isLast = lowest !== null && x.gwAdjusted === lowest && paidManagerCount > 1 && !isDisqualified(x.row.activeChip);
      const override = overrideMap.get(overrideKey(x.row.entryId, event));
      const relegationFine = config.relegationEnabled && isLast && !override?.fineWaived;

      let place: 1 | 2 | 3 | null = null;
      let prize = 0;
      if (rank === 1) { place = 1; prize = derivedPool * (config.prizePct1st / 100) / Math.max(1, rankCounts.get(1) ?? 1); }
      else if (rank === 2) { place = 2; prize = derivedPool * (config.prizePct2nd / 100) / Math.max(1, rankCounts.get(2) ?? 1); }
      else if (rank === 3) { place = 3; prize = derivedPool * (config.prizePct3rd / 100) / Math.max(1, rankCounts.get(3) ?? 1); }

      const gwRow: GwRow = {
        event,
        entryId: x.row.entryId,
        managerName: x.row.managerName,
        teamName: x.row.teamName,
        gwRank: rank,
        rawPoints: x.row.rawPoints,
        transferHits: x.row.transferHits,
        bbBenchPoints: x.row.bbBenchPoints,
        tcExtraPoints: x.row.tcExtraPoints,
        gwAdjusted: x.gwAdjusted,
        isLast,
        relegationFine,
        place,
        prize: round1(prize),
        activeChip: x.row.activeChip,
      };
      gwRowsByManager.set(x.row.entryId, [...(gwRowsByManager.get(x.row.entryId) ?? []), gwRow]);
      runningTotal.set(x.row.entryId, (runningTotal.get(x.row.entryId) ?? 0) + x.gwAdjusted);
    });
  }

  const managerMeta = new Map<number, { managerName: string; teamName: string }>();
  for (const manager of managers) managerMeta.set(manager.entryId, { managerName: manager.managerName, teamName: manager.teamName });
  for (const row of deduped) if (!managerMeta.has(row.entryId)) managerMeta.set(row.entryId, { managerName: row.managerName, teamName: row.teamName });

  const seasonRows: ManagerSeasonRow[] = managerIds.map((entryId) => {
    const gwRows = (gwRowsByManager.get(entryId) ?? []).sort((a, b) => a.event - b.event);
    const meta = managerMeta.get(entryId)!;
    const wins = gwRows.filter((r) => r.place === 1).length;
    const seconds = gwRows.filter((r) => r.place === 2).length;
    const thirds = gwRows.filter((r) => r.place === 3).length;
    const lastPlaceCount = gwRows.filter((r) => r.isLast).length;
    const moneyWon = round1(gwRows.reduce((s, r) => s + r.prize, 0));
    const feesPaid = round1(
      gwRows.reduce((s, r) => {
        const override = overrideMap.get(overrideKey(entryId, r.event));
        return s + (override?.feeWaived ? 0 : config.feePerGw);
      }, 0),
    );
    const finesPaid = round1(gwRows.filter((r) => r.relegationFine).length * config.relegationFine);
    const overallPoints = round1(runningTotal.get(entryId) ?? 0);
    return {
      entryId,
      managerName: meta.managerName,
      teamName: meta.teamName,
      overallPoints,
      overallRank: 0, // filled below
      wins,
      seconds,
      thirds,
      podiums: wins + seconds + thirds,
      lastPlaceCount,
      gwsPlayed: gwRows.length,
      moneyWon,
      feesPaid,
      finesPaid,
      netMoney: round1(moneyWon - feesPaid - finesPaid),
      gwRows,
    };
  });

  const sortedBySeason = [...seasonRows].sort((a, b) => {
    const ae = a.gwRows.length > 0, be = b.gwRows.length > 0;
    if (ae !== be) return ae ? -1 : 1;
    return b.overallPoints - a.overallPoints;
  });
  let overallRank = 0;
  let lastPoints: number | null = null;
  sortedBySeason.forEach((m, idx) => {
    if (lastPoints === null || m.overallPoints !== lastPoints) {
      overallRank = idx + 1;
      lastPoints = m.overallPoints;
    }
    m.overallRank = overallRank;
  });

  return { events, managers: sortedBySeason, currency: config.currency };
}
