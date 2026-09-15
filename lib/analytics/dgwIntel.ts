import type { Bootstrap, FplFixture } from "../types";

/**
 * Double/Blank gameweek detection, ported from x402-fpl-api's dgw_intel.py + chips.py.
 *
 * SCOPE NOTE: the original Python also scraped premierleague.com and
 * allaboutfpl.com for community DGW/BGW predictions (regex-matched article
 * text, 1hr cache, httpx client). That half is deliberately NOT ported here:
 *  - scraping third-party sites from a client app is fragile (breaks the
 *    moment either site's markup changes) and has no shared cache, so every
 *    device would hit those sites independently instead of once per hour.
 *  - it needs a small always-on backend to do properly (fetch once, cache,
 *    serve to all users). If DGH ever stands up a backend for other reasons
 *    (shared mini-league caching, price/news polling), that scraper is the
 *    one piece from this repo worth reviving there — see
 *    fetchCommunityDgwIntel / mergeIntelWithApiPredictions in the original
 *    for the shape to match.
 *
 * Everything below needs nothing but the fixtures DGH already fetches.
 */

export type GwFixtureLoad = {
  event: number;
  /** teamId -> number of fixtures that team plays in this event */
  fixtureCountByTeam: Map<number, number>;
  dgwTeamIds: number[]; // 2+ fixtures this event
  bgwTeamIds: number[]; // 0 fixtures this event (of teams still active this season)
  avgFixtureDifficulty: number; // across all fixtures in this event, both sides
};

export type LikelyFutureDgw = {
  event: number;
  teamIds: number[]; // teams with exactly 1 scheduled fixture in this event AND a pending postponed fixture
  reason: string;
};

export type DgwBgwScan = {
  fromEvent: number;
  scanWindow: number;
  gameweeks: GwFixtureLoad[];
  /** Postponed/unscheduled fixtures (event === null, not finished) — the raw signal a DGW is coming. */
  unscheduledFixtures: FplFixture[];
  /** Best-guess future DGWs inferred from those unscheduled fixtures slotting into an otherwise-single-fixture GW. */
  likelyFutureDgws: LikelyFutureDgw[];
};

/** teamId -> fixture count for a single event. */
function fixtureCountsForEvent(fixtures: FplFixture[], event: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const f of fixtures) {
    if (f.event !== event) continue;
    counts.set(f.team_h, (counts.get(f.team_h) ?? 0) + 1);
    counts.set(f.team_a, (counts.get(f.team_a) ?? 0) + 1);
  }
  return counts;
}

function avgDifficultyForEvent(fixtures: FplFixture[], event: number): number {
  const diffs: number[] = [];
  for (const f of fixtures) {
    if (f.event !== event) continue;
    diffs.push(f.team_h_difficulty, f.team_a_difficulty);
  }
  if (!diffs.length) return 3;
  return Math.round((diffs.reduce((s, d) => s + d, 0) / diffs.length) * 100) / 100;
}

/** Postponed/rescheduled fixtures — FPL sets event to null until a new date is confirmed.
 * A team with one of these pending is a live signal it may pick up a double gameweek later. */
export function getUnscheduledFixtures(fixtures: FplFixture[]): FplFixture[] {
  return fixtures.filter((f) => f.event === null && !f.finished);
}

/**
 * For each event in the scan window, estimate which teams are LIKELY (not yet
 * confirmed) to get a second fixture — i.e. they already have exactly one
 * scheduled fixture in that event AND still have an unscheduled fixture
 * pending. This mirrors x402's _estimate_likely_dgw_gameweeks.
 */
export function estimateLikelyFutureDgws(fixtures: FplFixture[], scanEvents: number[]): LikelyFutureDgw[] {
  const unscheduled = getUnscheduledFixtures(fixtures);
  if (!unscheduled.length) return [];

  const teamsWithPending = new Set<number>();
  for (const f of unscheduled) {
    teamsWithPending.add(f.team_h);
    teamsWithPending.add(f.team_a);
  }

  const results: LikelyFutureDgw[] = [];
  for (const event of scanEvents) {
    const counts = fixtureCountsForEvent(fixtures, event);
    const candidates = [...teamsWithPending].filter((teamId) => (counts.get(teamId) ?? 0) === 1);
    if (candidates.length) {
      results.push({
        event,
        teamIds: candidates,
        reason: `${candidates.length} team(s) already have one fixture in GW${event} and still have a postponed match pending — a second fixture here would make it a double.`,
      });
    }
  }
  return results;
}

/**
 * Full DGW/BGW scan across a window of upcoming gameweeks, using only
 * official FPL fixture data (no external scraping). Matches x402's
 * chips.py definitions: DGW = 2+ fixtures in the event, BGW = 0 fixtures
 * for a team that's still an active PL side.
 */
export function scanDgwBgw(bootstrap: Bootstrap, fixtures: FplFixture[], fromEvent: number, scanWindow = 10): DgwBgwScan {
  const allTeamIds = bootstrap.teams.map((t) => t.id);
  const scanEvents = Array.from({ length: scanWindow }, (_, i) => fromEvent + i).filter((e) => e <= 38);

  const gameweeks: GwFixtureLoad[] = scanEvents.map((event) => {
    const fixtureCountByTeam = fixtureCountsForEvent(fixtures, event);
    const dgwTeamIds = allTeamIds.filter((id) => (fixtureCountByTeam.get(id) ?? 0) >= 2);
    const bgwTeamIds = allTeamIds.filter((id) => (fixtureCountByTeam.get(id) ?? 0) === 0);
    return {
      event,
      fixtureCountByTeam,
      dgwTeamIds,
      bgwTeamIds,
      avgFixtureDifficulty: avgDifficultyForEvent(fixtures, event),
    };
  });

  return {
    fromEvent,
    scanWindow,
    gameweeks,
    unscheduledFixtures: getUnscheduledFixtures(fixtures),
    likelyFutureDgws: estimateLikelyFutureDgws(fixtures, scanEvents),
  };
}

/** Human-readable one-liner for a single gameweek's DGW/BGW status, for slotting
 * into the same kind of `reasons`/`why` string arrays used in warRoom.ts. */
export function describeGwFixtureLoad(gw: GwFixtureLoad, teamById: Map<number, { short_name: string }>): string {
  const shortNames = (ids: number[]) => ids.map((id) => teamById.get(id)?.short_name ?? "UNK").join(", ");
  if (gw.dgwTeamIds.length && gw.bgwTeamIds.length) {
    return `GW${gw.event}: double for ${shortNames(gw.dgwTeamIds)}, blank for ${shortNames(gw.bgwTeamIds)}.`;
  }
  if (gw.dgwTeamIds.length) {
    return `GW${gw.event}: double gameweek for ${shortNames(gw.dgwTeamIds)}.`;
  }
  if (gw.bgwTeamIds.length) {
    return `GW${gw.event}: blank gameweek for ${shortNames(gw.bgwTeamIds)}.`;
  }
  return `GW${gw.event}: normal fixture list, no doubles or blanks.`;
}

/** Convenience: the next confirmed DGW and BGW in a scan, if any — the two numbers
 * a "chip timing" screen usually wants to headline first. */
export function nextDgwAndBgw(scan: DgwBgwScan): { nextDgw: GwFixtureLoad | null; nextBgw: GwFixtureLoad | null } {
  const nextDgw = scan.gameweeks.find((g) => g.dgwTeamIds.length > 0) ?? null;
  const nextBgw = scan.gameweeks.find((g) => g.bgwTeamIds.length > 0) ?? null;
  return { nextDgw, nextBgw };
}
