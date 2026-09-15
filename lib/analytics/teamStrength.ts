import type { Bootstrap, FplFixture, FplTeam } from "../types";

/**
 * DGH Team Strength Intelligence
 * ------------------------------------------------------------------------
 * A deterministic, explainable model built ONLY on official FPL bootstrap
 * fields (strength_attack_home/away, strength_defence_home/away,
 * strength_overall_home/away). It never fetches anything and never invents
 * data — it is a pure re-normalisation + blend of numbers FPL already gives
 * us, plus optional user overrides.
 *
 * It is deliberately kept SEPARATE from official FPL FDR (fixture.team_h/a
 * _difficulty, the 1-5 stars). We never overwrite that value anywhere —
 * DGH's model is exposed under different field names (dghAttack, dghDefence,
 * dghDifficulty, dghOpponentStrength) so every screen can choose to show one,
 * the other, or both side by side.
 */

// FPL's raw strength fields have historically sat roughly in the 1000-1500
// range. We normalise into a 0-100 scale for readability and a 1-5 scale to
// stay visually compatible with official FDR stars.
export const STRENGTH_RAW_MIN = 1000;
export const STRENGTH_RAW_MAX = 1500;

export type TeamStrengthRaw = {
  attackHome: number;
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
  overallHome: number;
  overallAway: number;
};

export type TeamStrengthOverride = Partial<TeamStrengthRaw>;

/** Map of teamId -> user-entered override values. An absent field/team means "use official". */
export type TeamStrengthOverrideMap = Record<number, TeamStrengthOverride>;

export function officialTeamStrength(team: FplTeam): TeamStrengthRaw {
  return {
    attackHome: team.strength_attack_home,
    attackAway: team.strength_attack_away,
    defenceHome: team.strength_defence_home,
    defenceAway: team.strength_defence_away,
    overallHome: team.strength_overall_home,
    overallAway: team.strength_overall_away,
  };
}

/**
 * Applies a user override on top of the official values. Never mutates the
 * official bootstrap `team` object — always returns a new plain object. Any
 * field the user hasn't overridden falls back to the official value, so "no
 * override" always means "official value", by construction.
 */
export function effectiveTeamStrength(team: FplTeam, override?: TeamStrengthOverride | null): TeamStrengthRaw {
  const official = officialTeamStrength(team);
  if (!override) return official;
  return {
    attackHome: override.attackHome ?? official.attackHome,
    attackAway: override.attackAway ?? official.attackAway,
    defenceHome: override.defenceHome ?? official.defenceHome,
    defenceAway: override.defenceAway ?? official.defenceAway,
    overallHome: override.overallHome ?? official.overallHome,
    overallAway: override.overallAway ?? official.overallAway,
  };
}

export function isOverridden(override?: TeamStrengthOverride | null): boolean {
  if (!override) return false;
  return Object.values(override).some((v) => v != null);
}

export function normalize0to100(raw: number): number {
  const clamped = Math.min(STRENGTH_RAW_MAX, Math.max(STRENGTH_RAW_MIN, raw));
  return Math.round(((clamped - STRENGTH_RAW_MIN) / (STRENGTH_RAW_MAX - STRENGTH_RAW_MIN)) * 1000) / 10;
}

/** Convert a 0-100 normalised strength into a 1-5 "star" difficulty scale, matching FPL's own FDR range so it's visually drop-in compatible. */
export function toFiveScale(normalized0to100: number): number {
  return Math.round(Math.min(5, Math.max(1, 1 + (normalized0to100 / 100) * 4)) * 10) / 10;
}

export type DghTeamRating = {
  teamId: number;
  attackHome: number; // 0-100
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
  overallHome: number;
  overallAway: number;
  overridden: boolean;
};

export function buildTeamRatings(bootstrap: Bootstrap, overrides: TeamStrengthOverrideMap = {}): DghTeamRating[] {
  return bootstrap.teams.map((team) => {
    const eff = effectiveTeamStrength(team, overrides[team.id]);
    return {
      teamId: team.id,
      attackHome: normalize0to100(eff.attackHome),
      attackAway: normalize0to100(eff.attackAway),
      defenceHome: normalize0to100(eff.defenceHome),
      defenceAway: normalize0to100(eff.defenceAway),
      overallHome: normalize0to100(eff.overallHome),
      overallAway: normalize0to100(eff.overallAway),
      overridden: isOverridden(overrides[team.id]),
    };
  });
}

/**
 * DGH difficulty for `team` playing `opponent` at `isHome`: how hard the
 * opponent's defence (if team is attacking) and attack (if team is
 * defending) make this fixture, blended into a single 1-5 figure comparable
 * to official FDR. Lower = easier fixture for `team`.
 */
export function dghFixtureDifficulty(
  team: DghTeamRating,
  opponent: DghTeamRating,
  isHome: boolean,
): number {
  // A team's attacking output is suppressed by the opponent's defence, and
  // its defensive solidity is tested by the opponent's attack. We blend both
  // halves 55/45 in favour of "how hard it is to score", since attacking
  // returns dominate FPL points.
  const opponentDefence = isHome ? opponent.defenceAway : opponent.defenceHome;
  const opponentAttack = isHome ? opponent.attackAway : opponent.attackHome;
  const blended = opponentDefence * 0.55 + opponentAttack * 0.45;
  return toFiveScale(blended);
}

/**
 * Supplementary fixture difficulty for every upcoming fixture of every team,
 * computed from DGH team ratings. This sits ALONGSIDE official FDR (fixture
 * .team_h_difficulty / team_a_difficulty are left completely untouched) so
 * callers can show both.
 */
export type DghFixtureDifficultyEntry = {
  fixtureId: number;
  event: number | null;
  teamId: number;
  opponentId: number;
  isHome: boolean;
  officialFdr: number;
  dghFdr: number;
};

export function buildDghFixtureDifficulty(
  bootstrap: Bootstrap,
  fixtures: FplFixture[],
  overrides: TeamStrengthOverrideMap = {},
): DghFixtureDifficultyEntry[] {
  const ratings = new Map(buildTeamRatings(bootstrap, overrides).map((r) => [r.teamId, r]));
  const entries: DghFixtureDifficultyEntry[] = [];
  for (const f of fixtures) {
    const home = ratings.get(f.team_h);
    const away = ratings.get(f.team_a);
    if (!home || !away) continue;
    entries.push({
      fixtureId: f.id,
      event: f.event,
      teamId: f.team_h,
      opponentId: f.team_a,
      isHome: true,
      officialFdr: f.team_h_difficulty,
      dghFdr: dghFixtureDifficulty(home, away, true),
    });
    entries.push({
      fixtureId: f.id,
      event: f.event,
      teamId: f.team_a,
      opponentId: f.team_h,
      isHome: false,
      officialFdr: f.team_a_difficulty,
      dghFdr: dghFixtureDifficulty(away, home, false),
    });
  }
  return entries;
}

/**
 * A small multiplier (0.85-1.15) derived from the DGH difficulty of a
 * player's next fixture, meant to nudge (not replace) the existing
 * projection engine. 1.0 = neutral / average difficulty (dghFdr 3.0).
 * Deliberately narrow-banded so it "improves fixture intelligence without
 * destroying the official FPL signal" rather than dominating projections.
 */
export function fixtureProjectionMultiplier(dghFdr: number | null | undefined): number {
  if (dghFdr == null || Number.isNaN(dghFdr)) return 1;
  const clamped = Math.min(5, Math.max(1, dghFdr));
  // dghFdr 1 (very easy) -> 1.15, dghFdr 3 (neutral) -> 1.0, dghFdr 5 (very hard) -> 0.85
  return Math.round((1.15 - ((clamped - 1) / 4) * 0.3) * 1000) / 1000;
}

/** Finds a team's next unfinished fixture's DGH difficulty for the player's own team, for use by projection/captaincy/transfer callers. */
export function nextDghDifficultyForTeam(
  teamId: number,
  fixtures: FplFixture[],
  fromEvent: number,
  difficultyEntries: DghFixtureDifficultyEntry[],
): number | null {
  const next = fixtures
    .filter((f) => (f.event ?? 0) >= fromEvent && !f.finished && (f.team_h === teamId || f.team_a === teamId))
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))[0];
  if (!next) return null;
  const isHome = next.team_h === teamId;
  const entry = difficultyEntries.find((e) => e.fixtureId === next.id && e.teamId === teamId && e.isHome === isHome);
  return entry?.dghFdr ?? null;
}
