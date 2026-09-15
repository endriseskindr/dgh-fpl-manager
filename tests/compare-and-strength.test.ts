import { describe, expect, it, beforeEach } from "vitest";
import { comparePlayers, formatMetric, RADAR_METRIC_KEYS } from "../lib/analytics/playerCompare";
import {
  officialTeamStrength,
  effectiveTeamStrength,
  isOverridden,
  normalize0to100,
  toFiveScale,
  buildTeamRatings,
  dghFixtureDifficulty,
  buildDghFixtureDifficulty,
  fixtureProjectionMultiplier,
  nextDghDifficultyForTeam,
  STRENGTH_RAW_MIN,
  STRENGTH_RAW_MAX,
} from "../lib/analytics/teamStrength";
import {
  loadSavedWhatIfScenarios,
  saveWhatIfScenario,
  deleteWhatIfScenario,
  clearWhatIfScenarios,
} from "../lib/savedWhatIfStore";
import type { Bootstrap, EnrichedPlayer, FplFixture, FplTeam } from "../lib/types";

function player(id: number, overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: id,
    teamShort: `T${id}`,
    position: "MID",
    price: 8,
    form: 5,
    pointsPerGame: 5,
    totalPoints: 50,
    ownershipPct: 20,
    minutes: 900,
    status: "a",
    availability: { chanceThisRound: 100, chanceNextRound: 100, news: "", newsAddedAt: null, confidence: "CONFIRMED" },
    xG: 1,
    xA: 1,
    xGI: 2,
    bonus: 5,
    bps: 100,
    ictIndex: 50,
    epNext: 5,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
    ...overrides,
  };
}

function team(id: number, overrides: Partial<FplTeam> = {}): FplTeam {
  return {
    id,
    name: `Team ${id}`,
    short_name: `T${id}`,
    strength: 3,
    strength_overall_home: 1200,
    strength_overall_away: 1200,
    strength_attack_home: 1200,
    strength_attack_away: 1200,
    strength_defence_home: 1200,
    strength_defence_away: 1200,
    ...overrides,
  };
}

function fixture(id: number, teamH: number, teamA: number, overrides: Partial<FplFixture> = {}): FplFixture {
  return {
    id,
    event: 1,
    team_h: teamH,
    team_a: teamA,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    kickoff_time: null,
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
    ...overrides,
  };
}

describe("playerCompare", () => {
  it("produces one metric entry per compared dimension, in a stable set", () => {
    const a = player(1);
    const b = player(2);
    const result = comparePlayers(a, b);
    const keys = result.metrics.map((m) => m.key);
    expect(keys).toContain("totalPoints");
    expect(keys).toContain("nextGwProjection");
    expect(keys).toContain("value");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("normalises each metric pair so the higher raw value gets 100", () => {
    const a = player(1, { totalPoints: 100 });
    const b = player(2, { totalPoints: 50 });
    const result = comparePlayers(a, b);
    const totalPointsMetric = result.metrics.find((m) => m.key === "totalPoints")!;
    expect(totalPointsMetric.aNorm).toBe(100);
    expect(totalPointsMetric.bNorm).toBe(50);
  });

  it("declares a clear winner when one player is strictly better across the board", () => {
    const strong = player(1, { form: 9, pointsPerGame: 9, totalPoints: 150, xGI: 3 });
    const weak = player(2, { form: 1, pointsPerGame: 1, totalPoints: 10, xGI: 0.1 });
    const result = comparePlayers(strong, weak);
    expect(result.verdict.winner).toBe("a");
    expect(result.verdict.reason).toContain(strong.webName);
  });

  it("declares 'even' when the two players are statistically identical", () => {
    const a = player(1);
    const b = player(2, { webName: "P2", fullName: "Player 2" });
    const result = comparePlayers(a, b);
    expect(result.verdict.winner).toBe("even");
  });

  it("handles a zero-price player without dividing by zero", () => {
    const a = player(1, { price: 0 });
    const b = player(2);
    expect(() => comparePlayers(a, b)).not.toThrow();
    const valueMetric = comparePlayers(a, b).metrics.find((m) => m.key === "value")!;
    expect(valueMetric.aValue).toBe(0);
  });

  it("formats each metric type distinctly", () => {
    const a = player(1);
    const b = player(2);
    const result = comparePlayers(a, b);
    const money = result.metrics.find((m) => m.key === "price")!;
    const pct = result.metrics.find((m) => m.key === "ownershipPct")!;
    const count = result.metrics.find((m) => m.key === "bonus")!;
    expect(formatMetric(money).aDisplay).toMatch(/^£/);
    expect(formatMetric(pct).aDisplay).toMatch(/%$/);
    expect(formatMetric(count).aDisplay).toBe(String(Math.round(count.aValue)));
  });

  it("keeps the radar metric subset available on every comparison", () => {
    const result = comparePlayers(player(1), player(2));
    for (const key of RADAR_METRIC_KEYS) {
      expect(result.metrics.some((m) => m.key === key)).toBe(true);
    }
  });
});

describe("teamStrength", () => {
  it("returns official values unchanged when there is no override", () => {
    const t = team(1, { strength_attack_home: 1300 });
    const eff = effectiveTeamStrength(t, undefined);
    expect(eff).toEqual(officialTeamStrength(t));
    expect(eff.attackHome).toBe(1300);
  });

  it("merges a partial override on top of official values, field by field", () => {
    const t = team(1, { strength_attack_home: 1200, strength_defence_home: 1250 });
    const eff = effectiveTeamStrength(t, { attackHome: 1400 });
    expect(eff.attackHome).toBe(1400);
    expect(eff.defenceHome).toBe(1250); // untouched field falls back to official
  });

  it("never mutates the original team object when applying an override", () => {
    const t = team(1, { strength_attack_home: 1200 });
    const before = JSON.stringify(t);
    effectiveTeamStrength(t, { attackHome: 1400 });
    expect(JSON.stringify(t)).toBe(before);
  });

  it("isOverridden is false for empty/null/undefined and true once any field is set", () => {
    expect(isOverridden(undefined)).toBe(false);
    expect(isOverridden(null)).toBe(false);
    expect(isOverridden({})).toBe(false);
    expect(isOverridden({ attackHome: 1300 })).toBe(true);
  });

  it("normalize0to100 clamps to the documented raw range", () => {
    expect(normalize0to100(STRENGTH_RAW_MIN)).toBe(0);
    expect(normalize0to100(STRENGTH_RAW_MAX)).toBe(100);
    expect(normalize0to100(STRENGTH_RAW_MIN - 500)).toBe(0);
    expect(normalize0to100(STRENGTH_RAW_MAX + 500)).toBe(100);
  });

  it("toFiveScale stays within FPL's 1-5 FDR range", () => {
    expect(toFiveScale(0)).toBe(1);
    expect(toFiveScale(100)).toBe(5);
    expect(toFiveScale(50)).toBeGreaterThanOrEqual(1);
    expect(toFiveScale(50)).toBeLessThanOrEqual(5);
  });

  it("buildTeamRatings marks overridden teams and leaves others as official", () => {
    const bootstrap = { teams: [team(1), team(2)] } as Bootstrap;
    const ratings = buildTeamRatings(bootstrap, { 1: { attackHome: 1400 } });
    const r1 = ratings.find((r) => r.teamId === 1)!;
    const r2 = ratings.find((r) => r.teamId === 2)!;
    expect(r1.overridden).toBe(true);
    expect(r2.overridden).toBe(false);
  });

  it("dghFixtureDifficulty produces a harder rating against a stronger opponent", () => {
    const weakOpponent = buildTeamRatings({ teams: [team(1, { strength_defence_away: 1000, strength_attack_away: 1000 })] } as Bootstrap)[0];
    const strongOpponent = buildTeamRatings({ teams: [team(1, { strength_defence_away: 1500, strength_attack_away: 1500 })] } as Bootstrap)[0];
    const home = buildTeamRatings({ teams: [team(2)] } as Bootstrap)[0];
    const vsWeak = dghFixtureDifficulty(home, weakOpponent, true);
    const vsStrong = dghFixtureDifficulty(home, strongOpponent, true);
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });

  it("buildDghFixtureDifficulty never overwrites official FDR values", () => {
    const bootstrap = { teams: [team(1), team(2)] } as Bootstrap;
    const fixtures = [fixture(1, 1, 2, { team_h_difficulty: 4, team_a_difficulty: 2 })];
    const entries = buildDghFixtureDifficulty(bootstrap, fixtures);
    const home = entries.find((e) => e.teamId === 1)!;
    const away = entries.find((e) => e.teamId === 2)!;
    expect(home.officialFdr).toBe(4);
    expect(away.officialFdr).toBe(2);
    expect(typeof home.dghFdr).toBe("number");
  });

  it("fixtureProjectionMultiplier is neutral at 3, boosts at 1, dampens at 5", () => {
    expect(fixtureProjectionMultiplier(3)).toBeCloseTo(1.0, 5);
    expect(fixtureProjectionMultiplier(1)).toBeCloseTo(1.15, 5);
    expect(fixtureProjectionMultiplier(5)).toBeCloseTo(0.85, 5);
    expect(fixtureProjectionMultiplier(null)).toBe(1);
    expect(fixtureProjectionMultiplier(undefined)).toBe(1);
    expect(fixtureProjectionMultiplier(NaN)).toBe(1);
  });

  it("nextDghDifficultyForTeam finds the next unfinished fixture chronologically", () => {
    const bootstrap = { teams: [team(1), team(2), team(3)] } as Bootstrap;
    const fixtures = [
      fixture(1, 1, 2, { event: 1, finished: true }),
      fixture(2, 1, 3, { event: 2, finished: false }),
      fixture(3, 3, 1, { event: 3, finished: false }),
    ];
    const entries = buildDghFixtureDifficulty(bootstrap, fixtures);
    const result = nextDghDifficultyForTeam(1, fixtures, 2, entries);
    expect(result).not.toBeNull();
    const expectedEntry = entries.find((e) => e.fixtureId === 2 && e.teamId === 1 && e.isHome === true);
    expect(result).toBe(expectedEntry?.dghFdr);
  });

  it("nextDghDifficultyForTeam returns null when no future fixture exists", () => {
    const bootstrap = { teams: [team(1), team(2)] } as Bootstrap;
    const fixtures = [fixture(1, 1, 2, { event: 1, finished: true })];
    const entries = buildDghFixtureDifficulty(bootstrap, fixtures);
    expect(nextDghDifficultyForTeam(1, fixtures, 2, entries)).toBeNull();
  });
});

describe("savedWhatIfStore", () => {
  beforeEach(async () => {
    await clearWhatIfScenarios();
  });

  it("returns an empty list when nothing has been saved", async () => {
    const scenarios = await loadSavedWhatIfScenarios();
    expect(scenarios).toEqual([]);
  });

  it("saves a scenario and returns it in the loaded list", async () => {
    const next = await saveWhatIfScenario({
      name: "Sell Haaland for Watkins",
      moves: [{ outPlayerId: 1, inPlayerId: 2 }],
      chip: "none",
      snapshot: { netSwing: 2.4, scenarioGwAdjusted: 55.4, transferHits: 0, moveSummaries: ["Haaland → Watkins"] },
    });
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Sell Haaland for Watkins");
    expect(next[0].id).toBeTruthy();
    expect(next[0].createdAt).toBeGreaterThan(0);

    const loaded = await loadSavedWhatIfScenarios();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].moves).toEqual([{ outPlayerId: 1, inPlayerId: 2 }]);
  });

  it("falls back to 'Untitled scenario' for a blank/whitespace name", async () => {
    const next = await saveWhatIfScenario({
      name: "   ",
      moves: [],
      chip: "wildcard",
      snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] },
    });
    expect(next[0].name).toBe("Untitled scenario");
  });

  it("orders saved scenarios most-recently-created first", async () => {
    await saveWhatIfScenario({ name: "First", moves: [], chip: "none", snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] } });
    await new Promise((r) => setTimeout(r, 2));
    await saveWhatIfScenario({ name: "Second", moves: [], chip: "none", snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] } });
    const loaded = await loadSavedWhatIfScenarios();
    expect(loaded[0].name).toBe("Second");
    expect(loaded[1].name).toBe("First");
  });

  it("deletes a scenario by id and leaves the others intact", async () => {
    const afterFirst = await saveWhatIfScenario({ name: "Keep", moves: [], chip: "none", snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] } });
    const afterSecond = await saveWhatIfScenario({ name: "Remove", moves: [], chip: "none", snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] } });
    const toRemove = afterSecond.find((s) => s.name === "Remove")!;
    const next = await deleteWhatIfScenario(toRemove.id);
    expect(next.some((s) => s.id === toRemove.id)).toBe(false);
    expect(next.some((s) => s.name === "Keep")).toBe(true);
    void afterFirst;
  });

  it("caps saved scenarios at 20, dropping the oldest", async () => {
    for (let i = 0; i < 22; i++) {
      await saveWhatIfScenario({
        name: `Scenario ${i}`,
        moves: [],
        chip: "none",
        snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] },
      });
    }
    const loaded = await loadSavedWhatIfScenarios();
    expect(loaded).toHaveLength(20);
    expect(loaded.some((s) => s.name === "Scenario 21")).toBe(true);
    expect(loaded.some((s) => s.name === "Scenario 0")).toBe(false);
  });

  it("clearWhatIfScenarios empties the store", async () => {
    await saveWhatIfScenario({ name: "Temp", moves: [], chip: "none", snapshot: { netSwing: 0, scenarioGwAdjusted: 0, transferHits: 0, moveSummaries: [] } });
    const cleared = await clearWhatIfScenarios();
    expect(cleared).toEqual([]);
    expect(await loadSavedWhatIfScenarios()).toEqual([]);
  });
});
