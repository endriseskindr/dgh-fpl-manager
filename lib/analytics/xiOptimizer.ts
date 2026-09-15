import type { SquadPick } from "../types";
import { projectNextGw } from "./projection";

export type XIRecommendation = {
  startingXI: SquadPick[];
  bench: SquadPick[]; // ordered, [0] = first sub
  formation: string;
  captain: { pick: SquadPick; projected: number; reason: string } | null;
  viceCaptain: { pick: SquadPick; projected: number; reason: string } | null;
  differentialCaptain: { pick: SquadPick; projected: number; ownershipPct: number; reason: string } | null;
  changesFromCurrent: { type: "BENCH_TO_XI" | "XI_TO_BENCH" | "CAPTAIN_CHANGE" | "VC_CHANGE"; detail: string }[];
};

// Exported so other modules building their own legal-XI selection (e.g.
// lib/analytics/miniLeagueTemplate.ts's ownership-maximizing template XI)
// use the exact same 8 official formations instead of a second, potentially
// drifting copy of this list.
export const VALID_FORMATIONS: [number, number, number, number][] = [
  // [GKP, DEF, MID, FWD]
  [1, 3, 4, 3],
  [1, 3, 5, 2],
  [1, 4, 3, 3],
  [1, 4, 4, 2],
  [1, 4, 5, 1],
  [1, 5, 2, 3],
  [1, 5, 3, 2],
  [1, 5, 4, 1],
];

function projectedPoints(pick: SquadPick): number {
  return projectNextGw(pick.player);
}

/**
 * Picks the highest-projected legal XI (valid formation, exactly 1 GKP) from
 * the 15-man squad, orders the bench by projected points (GKP sub last unless
 * it's the only remaining bench slot), and recommends captain/VC/differential.
 */
export function optimizeXI(squad: SquadPick[]): XIRecommendation {
  const withProjection = squad.map((pick) => ({ pick, projected: projectedPoints(pick) }));
  const byPosition = {
    GKP: withProjection.filter((x) => x.pick.player.position === "GKP").sort((a, b) => b.projected - a.projected),
    DEF: withProjection.filter((x) => x.pick.player.position === "DEF").sort((a, b) => b.projected - a.projected),
    MID: withProjection.filter((x) => x.pick.player.position === "MID").sort((a, b) => b.projected - a.projected),
    FWD: withProjection.filter((x) => x.pick.player.position === "FWD").sort((a, b) => b.projected - a.projected),
  };

  let best: { total: number; xi: typeof withProjection; formation: string } | null = null;
  for (const [gk, def, mid, fwd] of VALID_FORMATIONS) {
    if (byPosition.GKP.length < gk || byPosition.DEF.length < def || byPosition.MID.length < mid || byPosition.FWD.length < fwd) continue;
    const xi = [...byPosition.GKP.slice(0, gk), ...byPosition.DEF.slice(0, def), ...byPosition.MID.slice(0, mid), ...byPosition.FWD.slice(0, fwd)];
    const total = xi.reduce((s, x) => s + x.projected, 0);
    if (!best || total > best.total) best = { total, xi, formation: `${def}-${mid}-${fwd}` };
  }

  if (!best) {
    // Fallback: not enough players to build a legal XI (shouldn't happen with a real 15-man squad).
    const sorted = withProjection.sort((a, b) => b.projected - a.projected);
    best = { total: 0, xi: sorted.slice(0, 11), formation: "N/A" };
  }

  const xiIds = new Set(best.xi.map((x) => x.pick.playerId));
  const bench = withProjection
    .filter((x) => !xiIds.has(x.pick.playerId))
    // FPL bench order is outfield substitutes first, goalkeeper last.
    // Within each group, rank by projected points.
    .sort((a, b) => {
      const aGk = a.pick.player.position === "GKP" ? 1 : 0;
      const bGk = b.pick.player.position === "GKP" ? 1 : 0;
      if (aGk !== bGk) return aGk - bGk;
      return b.projected - a.projected;
    });

  const captainPool = [...best.xi].sort((a, b) => b.projected - a.projected);
  const topCaptain = captainPool[0] ?? null;
  const secondCaptain = captainPool.find((c) => c.pick.playerId !== topCaptain?.pick.playerId) ?? null;

  const differentialPool = captainPool.filter((c) => c.pick.player.ownershipPct < 15).sort((a, b) => b.projected - a.projected);
  const diffCaptain = differentialPool[0] ?? null;

  const currentCaptainId = squad.find((p) => p.isCaptain)?.playerId;
  const currentVcId = squad.find((p) => p.isViceCaptain)?.playerId;
  const changes: XIRecommendation["changesFromCurrent"] = [];
  for (const b of bench) {
    if (b.pick.isXI) changes.push({ type: "XI_TO_BENCH", detail: `${b.pick.player.webName} projected too low — bench` });
  }
  for (const x of best.xi) {
    if (x.pick.isBench) changes.push({ type: "BENCH_TO_XI", detail: `${x.pick.player.webName} projected strong enough to start` });
  }
  if (topCaptain && topCaptain.pick.playerId !== currentCaptainId) {
    changes.push({ type: "CAPTAIN_CHANGE", detail: `Captain switch to ${topCaptain.pick.player.webName}` });
  }
  if (secondCaptain && secondCaptain.pick.playerId !== currentVcId) {
    changes.push({ type: "VC_CHANGE", detail: `Vice-captain switch to ${secondCaptain.pick.player.webName}` });
  }

  return {
    startingXI: best.xi.map((x) => x.pick),
    bench: bench.map((x) => x.pick),
    formation: best.formation,
    captain: topCaptain
      ? { pick: topCaptain.pick, projected: topCaptain.projected, reason: `Highest projected points (${topCaptain.projected.toFixed(1)}) with ${topCaptain.pick.player.availability.confidence.toLowerCase()} availability.` }
      : null,
    viceCaptain: secondCaptain
      ? { pick: secondCaptain.pick, projected: secondCaptain.projected, reason: `Second-highest projection — safety net if the captain is a late doubt.` }
      : null,
    differentialCaptain: diffCaptain
      ? {
          pick: diffCaptain.pick,
          projected: diffCaptain.projected,
          ownershipPct: diffCaptain.pick.player.ownershipPct,
          reason: `Low ownership (${diffCaptain.pick.player.ownershipPct}%) with strong projection — ceiling play for rank gains if it hits.`,
        }
      : null,
    changesFromCurrent: changes,
  };
}
