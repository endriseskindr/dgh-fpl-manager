/**
 * Independent, Pure, Deterministic FPL Domain Engine
 * Framework-agnostic (No React, Expo, UI, or Network dependencies)
 */

export interface FplPlayer {
  id: number;
  webName: string;
  elementTypeName: "GKP" | "DEF" | "MID" | "FWD";
  elementType: 1 | 2 | 3 | 4;
  teamId: number;
  price: number;
  points: number;
  form: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  influence: number;
  creativity: number;
  threat: number;
  ictIndex: number;
  xG: number;
  xA: number;
  xGI: number;
  xGC: number;
  status: "a" | "d" | "i" | "s" | "u";
  news: string;
  chanceNextRound: number | null;
  ownershipPct: number;
}

export interface SquadPick {
  element: number;
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
}

export interface FormationCount {
  gkp: number;
  def: number;
  mid: number;
  fwd: number;
}

export const VALID_FORMATIONS: Record<string, FormationCount> = {
  "3-4-3": { gkp: 1, def: 3, mid: 4, fwd: 3 },
  "3-5-2": { gkp: 1, def: 3, mid: 5, fwd: 2 },
  "4-3-3": { gkp: 1, def: 4, mid: 3, fwd: 3 },
  "4-4-2": { gkp: 1, def: 4, mid: 4, fwd: 2 },
  "4-5-1": { gkp: 1, def: 4, mid: 5, fwd: 1 },
  "5-3-2": { gkp: 1, def: 5, mid: 3, fwd: 2 },
  "5-4-1": { gkp: 1, def: 5, mid: 4, fwd: 1 },
  "5-2-3": { gkp: 1, def: 5, mid: 2, fwd: 3 },
};

/**
 * Validates whether a squad of 15 picks meets official FPL constraints.
 */
export function validateFplSquad(picks: SquadPick[], playersById: Map<number, FplPlayer>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (picks.length !== 15) {
    errors.push(`Squad must contain exactly 15 players (found ${picks.length})`);
  }

  const teamCounts: Record<number, number> = {};
  let gkp = 0, def = 0, mid = 0, fwd = 0;
  let captains = 0, viceCaptains = 0;

  for (const pick of picks) {
    if (pick.isCaptain) captains++;
    if (pick.isViceCaptain) viceCaptains++;

    const player = playersById.get(pick.element);
    if (!player) {
      errors.push(`Player ID ${pick.element} not found in player database`);
      continue;
    }

    teamCounts[player.teamId] = (teamCounts[player.teamId] || 0) + 1;
    if (teamCounts[player.teamId] > 3) {
      errors.push(`Team ID ${player.teamId} exceeds maximum 3 players allowance`);
    }

    if (player.elementType === 1) gkp++;
    else if (player.elementType === 2) def++;
    else if (player.elementType === 3) mid++;
    else if (player.elementType === 4) fwd++;
  }

  if (gkp !== 2) errors.push(`Squad must have exactly 2 Goalkeepers (found ${gkp})`);
  if (def !== 5) errors.push(`Squad must have exactly 5 Defenders (found ${def})`);
  if (mid !== 5) errors.push(`Squad must have exactly 5 Midfielders (found ${mid})`);
  if (fwd !== 3) errors.push(`Squad must have exactly 3 Forwards (found ${fwd})`);
  if (captains !== 1) errors.push(`Squad must have exactly 1 Captain (found ${captains})`);
  if (viceCaptains !== 1) errors.push(`Squad must have exactly 1 Vice-Captain (found ${viceCaptains})`);

  return { valid: errors.length === 0, errors };
}

/**
 * Validates active starting 11 formation constraints.
 */
export function isValidFormation(def: number, mid: number, fwd: number): boolean {
  if (def < 3 || def > 5) return false;
  if (mid < 2 || mid > 5) return false;
  if (fwd < 1 || fwd > 3) return false;
  return def + mid + fwd === 10;
}

/**
 * Determines effective captain and vice-captain after availability fallback.
 */
export function resolveCaptaincy(startingPicks: SquadPick[], playersById: Map<number, FplPlayer>): {
  effectiveCaptainId: number | null;
  effectiveViceCaptainId: number | null;
  isCaptainSubstituted: boolean;
} {
  const captainPick = startingPicks.find(p => p.isCaptain);
  const vicePick = startingPicks.find(p => p.isViceCaptain);

  if (!captainPick) {
    return { effectiveCaptainId: null, effectiveViceCaptainId: null, isCaptainSubstituted: false };
  }

  const captainPlayer = playersById.get(captainPick.element);
  const isCaptainAvailable = captainPlayer ? captainPlayer.status === "a" || (captainPlayer.chanceNextRound ?? 100) > 0 : true;

  if (isCaptainAvailable) {
    return {
      effectiveCaptainId: captainPick.element,
      effectiveViceCaptainId: vicePick?.element ?? null,
      isCaptainSubstituted: false,
    };
  }

  return {
    effectiveCaptainId: vicePick?.element ?? null,
    effectiveViceCaptainId: null,
    isCaptainSubstituted: true,
  };
}

/**
 * Calculates transfer cost penalty given transfer count and free transfers.
 */
export function calculateTransferCost(transfersMade: number, freeTransfersAvailable: number, isWildcardOrFreeHit = false): number {
  if (isWildcardOrFreeHit) return 0;
  const netTransfers = Math.max(0, transfersMade - freeTransfersAvailable);
  return netTransfers * 4;
}
