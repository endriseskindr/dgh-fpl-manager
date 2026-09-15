import type { Bootstrap, EnrichedPlayer, FplElement, FplEvent, ConfidenceLabel } from "./types";

const POSITION_MAP: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

/** Never fabricate injury/rotation info — derive confidence only from FPL's own fields. */
export function confidenceFromAvailability(el: FplElement): ConfidenceLabel {
  const chance = el.chance_of_playing_next_round;
  if (el.status === "a" && chance === null) return "CONFIRMED"; // available, no doubt flagged
  if (chance === 100) return "CONFIRMED";
  if (chance === 75) return "SUPPORTED";
  if (chance === 50) return "PROBABLE";
  if (chance === 25 || chance === 0) return "SPECULATIVE";
  if (el.status === "i" || el.status === "s" || el.status === "u") return "SPECULATIVE";
  if (el.status === "d") return "PROBABLE";
  return "SUPPORTED";
}

export function enrichPlayer(el: FplElement, bootstrap: Bootstrap): EnrichedPlayer {
  const team = bootstrap.teams.find((t) => t.id === el.team);
  return {
    id: el.id,
    webName: el.web_name,
    fullName: `${el.first_name} ${el.second_name}`,
    teamId: el.team,
    teamShort: team?.short_name ?? "UNK",
    position: POSITION_MAP[el.element_type] ?? "?",
    price: el.now_cost / 10,
    form: Number(el.form || 0),
    pointsPerGame: Number(el.points_per_game || 0),
    totalPoints: el.total_points,
    ownershipPct: Number(el.selected_by_percent || 0),
    minutes: el.minutes,
    status: el.status,
    availability: {
      chanceThisRound: el.chance_of_playing_this_round,
      chanceNextRound: el.chance_of_playing_next_round,
      news: el.news || "",
      newsAddedAt: el.news_added,
      confidence: confidenceFromAvailability(el),
    },
    xG: Number(el.expected_goals || 0),
    xA: Number(el.expected_assists || 0),
    xGI: Number(el.expected_goal_involvements || 0),
    bonus: el.bonus,
    bps: el.bps,
    ictIndex: Number(el.ict_index || 0),
    epNext: Number(el.ep_next || 0),
    transfersInEvent: el.transfers_in_event,
    transfersOutEvent: el.transfers_out_event,
    priceChangeEvent: el.cost_change_event / 10,
    starts: el.starts ?? 0,
    setPieces: {
      corners: el.corners_and_indirect_freekicks_order === 1,
      freeKicks: el.direct_freekicks_order === 1,
      penalties: el.penalties_order === 1,
    },
  };
}

export function buildPlayerIndex(bootstrap: Bootstrap): Map<number, EnrichedPlayer> {
  const map = new Map<number, EnrichedPlayer>();
  for (const el of bootstrap.elements) map.set(el.id, enrichPlayer(el, bootstrap));
  return map;
}

export function pickCurrentEvent(events: FplEvent[], requested?: number): FplEvent | null {
  if (requested) return events.find((e) => e.id === requested) ?? null;
  return events.find((e) => e.is_current) ?? events.find((e) => e.is_next) ?? events[events.length - 1] ?? null;
}

export function teamShort(bootstrap: Bootstrap, teamId: number): string {
  return bootstrap.teams.find((t) => t.id === teamId)?.short_name ?? "UNK";
}
