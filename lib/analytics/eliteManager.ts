import type { EnrichedPlayer, SquadPick } from "../types";

/** The FPL's official global "Overall" classic league — a real, fixed league
 * ID that ranks every FPL manager worldwide by total points. Sampling its
 * top entries is genuine official data, not an invented "elite" list. */
export const OVERALL_LEAGUE_ID = 314;

export type EliteManagerSquad = {
  entryId: number;
  managerName: string;
  teamName: string;
  overallRank: number;
  squad: SquadPick[] | null;
  activeChip: string | null;
  fetchFailed: boolean;
};

export type EliteTemplateRow = {
  playerId: number;
  webName: string;
  eliteOwnershipPct: number;
  overallOwnershipPct: number;
  captainCount: number;
  captainPct: number;
  onMyTeam: boolean;
  label: "ELITE TEMPLATE" | "ELITE FADE" | "ELITE DIFFERENTIAL" | "NEUTRAL";
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Ownership + captaincy aggregated across the sampled elite managers, compared
 * against my own squad and against FPL-wide ownership (already on EnrichedPlayer). */
export function buildEliteTemplate(
  elites: EliteManagerSquad[],
  playerIndex: Map<number, EnrichedPlayer>,
  mySquad: SquadPick[],
): { rows: EliteTemplateRow[]; sampleSize: number } {
  const withSquad = elites.filter((e) => e.squad);
  const sampleSize = withSquad.length || 1;
  const ownershipCount = new Map<number, number>();
  const captainCount = new Map<number, number>();
  for (const e of withSquad) {
    for (const pick of e.squad!) {
      ownershipCount.set(pick.playerId, (ownershipCount.get(pick.playerId) ?? 0) + 1);
      if (pick.isCaptain) captainCount.set(pick.playerId, (captainCount.get(pick.playerId) ?? 0) + 1);
    }
  }
  const myIds = new Set(mySquad.map((p) => p.playerId));
  const rows: EliteTemplateRow[] = [];
  for (const [playerId, count] of ownershipCount.entries()) {
    const player = playerIndex.get(playerId);
    if (!player) continue;
    const eliteOwnershipPct = round1((count / sampleSize) * 100);
    const captains = captainCount.get(playerId) ?? 0;
    const onMyTeam = myIds.has(playerId);
    let label: EliteTemplateRow["label"] = "NEUTRAL";
    if (eliteOwnershipPct >= 40 && !onMyTeam) label = "ELITE FADE";
    else if (eliteOwnershipPct >= 40 && onMyTeam) label = "ELITE TEMPLATE";
    else if (eliteOwnershipPct < 15 && player.ownershipPct < 10 && onMyTeam) label = "ELITE DIFFERENTIAL";
    rows.push({
      playerId,
      webName: player.webName,
      eliteOwnershipPct,
      overallOwnershipPct: player.ownershipPct,
      captainCount: captains,
      captainPct: round1((captains / sampleSize) * 100),
      onMyTeam,
      label,
    });
  }
  return { rows: rows.sort((a, b) => b.eliteOwnershipPct - a.eliteOwnershipPct), sampleSize };
}

export function buildEliteChipTrends(elites: EliteManagerSquad[]): { chip: string; count: number; pct: number }[] {
  const withSquad = elites.filter((e) => e.squad);
  const sampleSize = withSquad.length || 1;
  const counts = new Map<string, number>();
  for (const e of withSquad) {
    if (e.activeChip) counts.set(e.activeChip, (counts.get(e.activeChip) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([chip, count]) => ({ chip, count, pct: round1((count / sampleSize) * 100) }))
    .sort((a, b) => b.count - a.count);
}

/** Differentials I hold that elites are fading, and template pieces elites hold that I'm missing. */
export function buildEliteGaps(rows: EliteTemplateRow[]): { blockers: EliteTemplateRow[]; myDifferentials: EliteTemplateRow[] } {
  const blockers = rows.filter((r) => r.label === "ELITE FADE").slice(0, 8);
  const myDifferentials = rows.filter((r) => r.label === "ELITE DIFFERENTIAL").slice(0, 8);
  return { blockers, myDifferentials };
}
