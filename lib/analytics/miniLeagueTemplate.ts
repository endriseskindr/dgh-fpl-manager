import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import { VALID_FORMATIONS } from "./xiOptimizer";

export type TemplatePlayer = {
  playerId: number;
  webName: string;
  position: "GKP" | "DEF" | "MID" | "FWD" | string;
  teamShort: string;
  price: number;
  ownerCount: number; // managers (out of verified) who own this player
  ownershipPct: number; // ownerCount / verifiedManagerCount * 100
  captainCount: number; // managers currently captaining this player
};

export type MiniLeagueTemplate = {
  /** Managers whose squad was successfully fetched this refresh (me + every
   * rival with a verified squad) — the denominator for every ownership %. */
  verifiedManagerCount: number;
  totalManagerCount: number;
  formation: string; // e.g. "3-4-3", or "N/A" if too few verified squads to fill a legal XI
  /** The most-owned legal XI in the mini-league, built from the same 8
   * official formations xiOptimizer.ts uses for an individual squad. */
  xi: TemplatePlayer[];
  /** XI + a 4-man template bench (next-most-owned remaining players). */
  fullTemplateSquad: TemplatePlayer[];
};

export type ManagerTemplateSimilarity = {
  entryId: number;
  managerName: string;
  teamName: string;
  isMe: boolean;
  xiOverlapCount: number; // out of template.xi.length (normally 11)
  xiSimilarityPct: number;
  squadOverlapCount: number; // out of template.fullTemplateSquad.length (normally 15)
  squadSimilarityPct: number;
  matchingXiPlayers: string[]; // webNames owned by this manager that are also in the template XI
};

/**
 * Builds the mini-league "template team": the single most-owned player at
 * each position, assembled into the highest-total-ownership legal XI, plus a
 * 4-man template bench from the next most-owned remaining players.
 *
 * Ownership is counted only across managers whose squad was successfully
 * verified this refresh (RivalProfile.squad !== null) — exactly the same
 * "STRICT vs FALLBACK" verification rule lib/analytics/ownership.ts already
 * applies, so a transient rival-fetch failure never silently deflates the
 * denominator or lets an under-counted player masquerade as the template.
 * My own squad is always counted (it's fetched directly, never best-effort).
 */
export function buildMiniLeagueTemplate(
  mySquad: SquadPick[],
  rivals: RivalProfile[],
): MiniLeagueTemplate {
  const rivalsWithSquad = rivals.filter((r) => r.squad);
  const verifiedManagerCount = rivalsWithSquad.length + 1; // +1 = me

  const counts = new Map<number, { player: EnrichedPlayer; ownerCount: number; captainCount: number }>();
  const bump = (player: EnrichedPlayer, isCaptain: boolean) => {
    const existing = counts.get(player.id) ?? { player, ownerCount: 0, captainCount: 0 };
    existing.ownerCount += 1;
    if (isCaptain) existing.captainCount += 1;
    counts.set(player.id, existing);
  };
  for (const pick of mySquad) bump(pick.player, pick.isCaptain);
  for (const rival of rivalsWithSquad) {
    const seen = new Set<number>();
    for (const pick of rival.squad ?? []) {
      if (seen.has(pick.playerId)) continue; // defensive: a picks response should never duplicate a player
      seen.add(pick.playerId);
      bump(pick.player, pick.isCaptain);
    }
  }

  const toTemplatePlayer = (c: { player: EnrichedPlayer; ownerCount: number; captainCount: number }): TemplatePlayer => ({
    playerId: c.player.id,
    webName: c.player.webName,
    position: c.player.position,
    teamShort: c.player.teamShort,
    price: c.player.price,
    ownerCount: c.ownerCount,
    ownershipPct: Math.round((c.ownerCount / Math.max(1, verifiedManagerCount)) * 1000) / 10,
    captainCount: c.captainCount,
  });

  const all = [...counts.values()];
  const byPosition = {
    GKP: all.filter((c) => c.player.position === "GKP").sort((a, b) => b.ownerCount - a.ownerCount),
    DEF: all.filter((c) => c.player.position === "DEF").sort((a, b) => b.ownerCount - a.ownerCount),
    MID: all.filter((c) => c.player.position === "MID").sort((a, b) => b.ownerCount - a.ownerCount),
    FWD: all.filter((c) => c.player.position === "FWD").sort((a, b) => b.ownerCount - a.ownerCount),
  };

  let best: { total: number; xi: typeof all; formation: string } | null = null;
  for (const [gk, def, mid, fwd] of VALID_FORMATIONS) {
    if (byPosition.GKP.length < gk || byPosition.DEF.length < def || byPosition.MID.length < mid || byPosition.FWD.length < fwd) continue;
    const xi = [...byPosition.GKP.slice(0, gk), ...byPosition.DEF.slice(0, def), ...byPosition.MID.slice(0, mid), ...byPosition.FWD.slice(0, fwd)];
    const total = xi.reduce((s, c) => s + c.ownerCount, 0);
    if (!best || total > best.total) best = { total, xi, formation: `${def}-${mid}-${fwd}` };
  }
  // Fallback for a too-thin verified pool (e.g. most rival fetches failed
  // this refresh): best-effort top-11 by ownership, not formation-legal.
  if (!best) {
    const sorted = [...all].sort((a, b) => b.ownerCount - a.ownerCount);
    best = { total: 0, xi: sorted.slice(0, 11), formation: "N/A" };
  }

  const xiIds = new Set(best.xi.map((c) => c.player.id));
  const bench = all
    .filter((c) => !xiIds.has(c.player.id))
    .sort((a, b) => b.ownerCount - a.ownerCount)
    .slice(0, 4);

  return {
    verifiedManagerCount,
    totalManagerCount: rivals.length + 1,
    formation: best.formation,
    xi: best.xi.map(toTemplatePlayer).sort((a, b) => b.ownershipPct - a.ownershipPct),
    fullTemplateSquad: [...best.xi, ...bench].map(toTemplatePlayer),
  };
}

/**
 * For every manager with a verified squad (me + every rival RivalProfile.squad
 * !== null), how much of their squad overlaps with the template XI and with
 * the full 15-man template squad. Overlap is matched by official player ID,
 * never by name, so it's exact. Sorted highest-similarity-first — the
 * managers closest to "playing the template" sit at the top.
 */
export function computeTemplateSimilarity(
  template: MiniLeagueTemplate,
  myEntryId: number,
  myManagerName: string,
  myTeamName: string,
  mySquad: SquadPick[],
  rivals: RivalProfile[],
): ManagerTemplateSimilarity[] {
  const xiPlayers = template.xi;
  const squadIds = new Set(template.fullTemplateSquad.map((p) => p.playerId));

  const scoreFor = (
    entryId: number,
    managerName: string,
    teamName: string,
    isMe: boolean,
    squad: SquadPick[] | null,
  ): ManagerTemplateSimilarity | null => {
    if (!squad) return null; // unverified this refresh — never fabricate a similarity score
    const ownedIds = new Set(squad.map((p) => p.playerId));
    const matchingXiPlayers = xiPlayers.filter((p) => ownedIds.has(p.playerId)).map((p) => p.webName);
    const squadOverlapCount = template.fullTemplateSquad.filter((p) => ownedIds.has(p.playerId)).length;
    return {
      entryId,
      managerName,
      teamName,
      isMe,
      xiOverlapCount: matchingXiPlayers.length,
      xiSimilarityPct: Math.round((matchingXiPlayers.length / Math.max(1, xiPlayers.length)) * 1000) / 10,
      squadOverlapCount,
      squadSimilarityPct: Math.round((squadOverlapCount / Math.max(1, squadIds.size)) * 1000) / 10,
      matchingXiPlayers,
    };
  };

  const rows: ManagerTemplateSimilarity[] = [];
  const me = scoreFor(myEntryId, myManagerName, myTeamName, true, mySquad);
  if (me) rows.push(me);
  for (const rival of rivals) {
    const row = scoreFor(rival.entryId, rival.managerName, rival.teamName, false, rival.squad);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => b.squadSimilarityPct - a.squadSimilarityPct);
}
