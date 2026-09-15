import type { FplFixture, FplTeam, RivalProfile, SquadPick, StandingsRow } from "../types";
import { getPlayingStatus, type PlayingStatus } from "./liveStatus";

export type FixturePickEntry = {
  entryId: number;
  managerLabel: string;
  isMe: boolean;
  playerId: number;
  playerName: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isBench: boolean;
  side: "home" | "away";
  status: PlayingStatus;
};

export type FixtureWithPicks = {
  fixture: FplFixture;
  homeTeam: FplTeam | null;
  awayTeam: FplTeam | null;
  picks: FixturePickEntry[];
};

/**
 * Groups every fixture in `gameweek` with the DGH mini-league picks riding on
 * it — "Man City 2-1 Arsenal — you have Haaland(C), Bekele has Ødegaard" —
 * reusing the same fixtures + squad data the DGH live table already fetches.
 * Only starting-XI picks count as "riding on it" (bench picks are omitted by
 * default) since those are what actually score.
 */
export function buildFixturePicksView(params: {
  fixtures: FplFixture[];
  teams: FplTeam[];
  gameweek: number;
  mySquad: SquadPick[];
  myRow: StandingsRow | null;
  rivals: RivalProfile[];
  includeBench?: boolean;
}): FixtureWithPicks[] {
  const { fixtures, teams, gameweek, mySquad, myRow, rivals, includeBench = false } = params;
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const gwFixtures = fixtures
    .filter((f) => f.event === gameweek)
    .sort((a, b) => {
      const ta = a.kickoff_time ? new Date(a.kickoff_time).getTime() : 0;
      const tb = b.kickoff_time ? new Date(b.kickoff_time).getTime() : 0;
      return ta - tb;
    });

  return gwFixtures.map((fixture) => {
    const picks: FixturePickEntry[] = [];

    const addManager = (entryId: number, label: string, isMe: boolean, squad: SquadPick[] | null) => {
      if (!squad) return;
      for (const pick of squad) {
        if (!includeBench && pick.isBench) continue;
        const teamId = pick.player.teamId;
        if (teamId !== fixture.team_h && teamId !== fixture.team_a) continue;
        picks.push({
          entryId,
          managerLabel: label,
          isMe,
          playerId: pick.playerId,
          playerName: pick.player.webName,
          isCaptain: pick.isCaptain,
          isViceCaptain: pick.isViceCaptain,
          isBench: pick.isBench,
          side: teamId === fixture.team_h ? "home" : "away",
          status: getPlayingStatus(pick, fixtures, gameweek),
        });
      }
    };

    addManager(myRow?.entry ?? -1, "You", true, mySquad);
    for (const rival of rivals) addManager(rival.entryId, rival.managerName, false, rival.squad);

    return {
      fixture,
      homeTeam: teamById.get(fixture.team_h) ?? null,
      awayTeam: teamById.get(fixture.team_a) ?? null,
      picks,
    };
  });
}

export function fixtureScoreLabel(fixture: FplFixture): string {
  if (fixture.started || fixture.finished) {
    return `${fixture.team_h_score ?? 0}-${fixture.team_a_score ?? 0}`;
  }
  if (fixture.kickoff_time) {
    const d = new Date(fixture.kickoff_time);
    return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return "TBC";
}
