import type { Bootstrap, FplFixture } from "../types";

export type TeamFixtureRun = {
  teamId: number;
  teamShort: string;
  next: { event: number | null; opponentShort: string; isHome: boolean; difficulty: number }[];
  averageDifficulty: number; // lower = easier, FPL scale 1-5
};

export function buildFixtureRuns(bootstrap: Bootstrap, fixtures: FplFixture[], fromEvent: number, lookahead = 5): TeamFixtureRun[] {
  const teamById = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const runs: TeamFixtureRun[] = [];
  for (const team of bootstrap.teams) {
    const upcoming = fixtures
      .filter((f) => (f.event ?? 0) >= fromEvent && (f.team_h === team.id || f.team_a === team.id) && !f.finished)
      .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))
      .slice(0, lookahead)
      .map((f) => {
        const isHome = f.team_h === team.id;
        const opponentId = isHome ? f.team_a : f.team_h;
        return {
          event: f.event,
          opponentShort: teamById.get(opponentId)?.short_name ?? "UNK",
          isHome,
          difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
        };
      });
    const avg = upcoming.length ? upcoming.reduce((s, u) => s + u.difficulty, 0) / upcoming.length : 3;
    runs.push({ teamId: team.id, teamShort: team.short_name, next: upcoming, averageDifficulty: Math.round(avg * 100) / 100 });
  }
  return runs.sort((a, b) => a.averageDifficulty - b.averageDifficulty);
}

/**
 * Fixture swing = teams whose difficulty improves/worsens the most between the
 * "near" window (next 2 GWs) and the "far" window (GWs 3-5 ahead) — useful for
 * spotting transfer timing (buy before the swing, sell before it turns).
 */
export function buildFixtureSwing(bootstrap: Bootstrap, fixtures: FplFixture[], fromEvent: number) {
  const near = buildFixtureRuns(bootstrap, fixtures, fromEvent, 2);
  const far = buildFixtureRuns(bootstrap, fixtures, fromEvent + 2, 3);
  const nearById = new Map(near.map((r) => [r.teamId, r.averageDifficulty]));
  const farById = new Map(far.map((r) => [r.teamId, r.averageDifficulty]));
  return bootstrap.teams
    .map((t) => {
      const nearDiff = nearById.get(t.id) ?? 3;
      const farDiff = farById.get(t.id) ?? 3;
      return {
        teamId: t.id,
        teamShort: t.short_name,
        nearDifficulty: nearDiff,
        farDifficulty: farDiff,
        swing: Math.round((nearDiff - farDiff) * 100) / 100, // positive = getting easier soon
      };
    })
    .sort((a, b) => b.swing - a.swing);
}
