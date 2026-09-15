import type { FplFixture, SquadPick } from "../types";

/**
 * "Left to play" status for a single squad pick during a live gameweek.
 * Derived entirely from data already fetched (fixtures + the live-minutes
 * figure already carried on SquadPick from /event/{gw}/live/) — no new
 * network calls.
 */
export type PlayingStatus = "not_started" | "live" | "subbed_off" | "finished" | "no_fixture";

export const PLAYING_STATUS_ICON: Record<PlayingStatus, string> = {
  not_started: "⏳",
  live: "🟢",
  subbed_off: "🔴",
  finished: "⚪",
  no_fixture: "⚪",
};

export const PLAYING_STATUS_LABEL: Record<PlayingStatus, string> = {
  not_started: "Not started",
  live: "Playing",
  subbed_off: "Subbed off",
  finished: "Finished",
  no_fixture: "No fixture",
};

/**
 * Looks at every fixture the player's club has in `gameweek` (there can be
 * two on a double gameweek) and reduces them to a single glance-able status:
 *  - no club fixture at all this GW              -> no_fixture
 *  - nothing has kicked off yet                  -> not_started
 *  - a fixture is underway and the player has
 *    logged minutes in it                        -> live
 *  - a fixture is underway but the player hasn't
 *    logged any minutes yet (still on the bench,
 *    may yet be brought on)                      -> not_started
 *  - every fixture is finished:
 *      - 0 minutes across all of them             -> finished (didn't feature)
 *      - fewer minutes than a full 90×fixtures     -> subbed_off (heuristic:
 *        the official live feed doesn't expose the actual substitution
 *        event, so "played, but short of full time" is treated as subbed)
 *      - full time across all fixtures             -> finished
 */
export function getPlayingStatus(pick: SquadPick, fixtures: FplFixture[], gameweek: number): PlayingStatus {
  const teamId = pick.player.teamId;
  const teamFixtures = fixtures.filter((f) => f.event === gameweek && (f.team_h === teamId || f.team_a === teamId));
  if (teamFixtures.length === 0) return "no_fixture";

  const minutes = pick.liveMinutes ?? 0;
  const anyStarted = teamFixtures.some((f) => f.started);
  const allFinished = teamFixtures.every((f) => f.finished);

  if (allFinished) {
    if (minutes <= 0) return "finished";
    if (minutes < 90 * teamFixtures.length) return "subbed_off";
    return "finished";
  }
  if (anyStarted) {
    return minutes > 0 ? "live" : "not_started";
  }
  return "not_started";
}

export function summarizeSquadPlayingStatus(
  squad: SquadPick[],
  fixtures: FplFixture[],
  gameweek: number,
): Record<PlayingStatus, number> {
  const counts: Record<PlayingStatus, number> = { not_started: 0, live: 0, subbed_off: 0, finished: 0, no_fixture: 0 };
  for (const pick of squad) {
    counts[getPlayingStatus(pick, fixtures, gameweek)] += 1;
  }
  return counts;
}
