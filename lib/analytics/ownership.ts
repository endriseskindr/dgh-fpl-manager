import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";

export type OwnershipRow = {
  playerId: number;
  player: EnrichedPlayer;
  onMyTeam: boolean;
  myMultiplier: number; // 0 if not owned, else captain-adjusted
  rivalOwners: { entryId: number; managerName: string; isCaptain: boolean; multiplier: number }[];
  rivalOwnershipPct: number;
  labelConfidence: "STRICT" | "FALLBACK";
  overallOwnershipPct: number; // from FPL selected_by_percent, whole-game context
  label: "SHIELD" | "THREAT" | "DIFFERENTIAL" | "TEMPLATE" | "TRAP" | "NEUTRAL";
  /**
   * True mini-league Effective Ownership: the sum of every verified manager's
   * official pick multiplier for this player (0 = benched, 1 = starting XI,
   * 2 = captained, 3 = triple-captained), divided by (verified manager count
   * × 2) — the same convention FPL analytics sites use, where 2x is the
   * baseline "everyone captains it" ceiling and triple-captain pushes above
   * 100%. Every multiplier comes straight from each manager's own official
   * picks response (SquadPick.multiplier) — nothing inferred. Only computed
   * when every rival's squad was verified this refresh (labelConfidence ===
   * "STRICT"); null otherwise rather than understating it from a partial pool.
   */
  effectiveOwnershipPct: number | null;
};

/**
 * Classification logic:
 *  - DIFFERENTIAL: I own it, (almost) no rival in this mini-league owns it.
 *  - SHIELD: I own it AND most rivals own it too (protects my rank — no relative loss if it blanks).
 *  - THREAT: A rival owns it, I don't — they gain rank on me if it returns.
 *  - TEMPLATE: Most of the league (mine + rivals) owns it — league-wide consensus pick.
 *  - TRAP: High overall FPL ownership (%) but low form/minutes trend — a popular pick that's
 *          likely to disappoint. Flagged for awareness, not fabricated — based on form/minutes only.
 */
export function buildOwnershipMap(
  myEntryId: number,
  mySquad: SquadPick[],
  rivals: RivalProfile[],
  playerPool: EnrichedPlayer[] = [],
): OwnershipRow[] {
  const byPlayer = new Map<number, OwnershipRow>();
  const rivalsWithSquad = rivals.filter((r) => r.squad);
  const rivalCount = Math.max(1, rivals.length);

  const ensure = (player: EnrichedPlayer): OwnershipRow => {
    if (!byPlayer.has(player.id)) {
      byPlayer.set(player.id, {
        playerId: player.id,
        player,
        onMyTeam: false,
        myMultiplier: 0,
        rivalOwners: [],
        rivalOwnershipPct: 0,
        labelConfidence: "FALLBACK",
        overallOwnershipPct: player.ownershipPct,
        label: "NEUTRAL",
        effectiveOwnershipPct: null,
      });
    }
    return byPlayer.get(player.id)!;
  };

  for (const player of playerPool) ensure(player);

  for (const pick of mySquad) {
    const row = ensure(pick.player);
    row.onMyTeam = true;
    row.myMultiplier = pick.multiplier;
  }

  for (const rival of rivalsWithSquad) {
    const seen = new Set<number>();
    for (const pick of rival.squad ?? []) {
      if (seen.has(pick.playerId)) continue;
      seen.add(pick.playerId);
      const row = ensure(pick.player);
      row.rivalOwners.push({ entryId: rival.entryId, managerName: rival.managerName, isCaptain: pick.isCaptain, multiplier: pick.multiplier });
    }
  }

  const verifiedManagerCount = rivalsWithSquad.length + 1; // +1 = me, always fetched directly

  for (const row of byPlayer.values()) {
    row.rivalOwnershipPct = Math.round((row.rivalOwners.length / rivalCount) * 1000) / 10;
    row.labelConfidence = rivalsWithSquad.length === rivals.length ? "STRICT" : "FALLBACK";
    // True EO: only meaningful once every rival's squad (and mine) is verified
    // this refresh — a partial pool would silently understate it, so it's
    // left null rather than computed from a subset (matches labelConfidence's
    // own STRICT/FALLBACK rule above).
    row.effectiveOwnershipPct =
      row.labelConfidence === "STRICT"
        ? Math.round(
            ((row.myMultiplier + row.rivalOwners.reduce((sum, o) => sum + o.multiplier, 0)) / (verifiedManagerCount * 2)) * 1000,
          ) / 10
        : null;
    const trapSignal = row.overallOwnershipPct >= 15 && row.player.form < 3 && row.player.minutes > 0;
    if (trapSignal && !row.onMyTeam) row.label = "TRAP";
    else if (row.labelConfidence === "STRICT" && row.onMyTeam && row.rivalOwners.length === 0) row.label = "DIFFERENTIAL";
    else if (row.labelConfidence === "STRICT" && row.onMyTeam && row.rivalOwnershipPct >= 80) row.label = "TEMPLATE";
    else if (row.labelConfidence === "STRICT" && row.onMyTeam && row.rivalOwnershipPct >= 55) row.label = "SHIELD";
    else if (row.labelConfidence === "STRICT" && !row.onMyTeam && row.rivalOwners.length > 0) row.label = "THREAT";
    else if (row.labelConfidence === "FALLBACK") {
      // Progressive deterministic fallback from valid full-league FPL ownership.
      // Never discard the player/rival pool merely because squad fetches are partial.
      if (row.onMyTeam && row.overallOwnershipPct < 10) row.label = "DIFFERENTIAL";
      else if (row.onMyTeam && row.overallOwnershipPct >= 40) row.label = "TEMPLATE";
      else if (!row.onMyTeam && row.overallOwnershipPct >= 10) row.label = "THREAT";
    }
  }

  return [...byPlayer.values()].sort((a, b) => b.rivalOwnershipPct + (b.onMyTeam ? 100 : 0) - (a.rivalOwnershipPct + (a.onMyTeam ? 100 : 0)));
}
