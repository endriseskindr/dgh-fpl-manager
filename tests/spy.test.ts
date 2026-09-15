import { describe, expect, it, vi } from "vitest";
import { buildPricePredictions } from "../lib/analytics/priceIntel";
import { hasNegativeNews, newsPenaltyScore, formatNewsAge, buildNewsAlerts } from "../lib/analytics/newsIntel";
import { buildFixtureRunLookup, predictTransferOut, predictTransferIn, findRivalWeaknesses } from "../lib/analytics/rivalIntel";
import { multiGwValueScore, buildMultiGwHorizon } from "../lib/analytics/multiGwHorizon";
import { scoreCaptainAlt, rankCaptainAlt } from "../lib/analytics/captainAlt";
import { emptySpyIntel } from "../lib/spyService";
import type { TeamFixtureRun } from "../lib/analytics/fixtures";
import type { EnrichedPlayer, SquadPick } from "../lib/types";

function player(id: number, overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: id,
    teamShort: `T${id}`,
    position: "MID",
    price: 6.0,
    form: 4,
    pointsPerGame: 4,
    totalPoints: 40,
    ownershipPct: 10,
    minutes: 900,
    status: "a",
    availability: { chanceThisRound: 100, chanceNextRound: 100, news: "", newsAddedAt: null, confidence: "CONFIRMED" },
    xG: 0.3,
    xA: 0.2,
    xGI: 0.5,
    bonus: 5,
    bps: 100,
    ictIndex: 80,
    epNext: 4,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 9,
    setPieces: { corners: false, freeKicks: false, penalties: false },
    ...overrides,
  };
}

function fixtureRun(teamId: number, overrides: Partial<TeamFixtureRun> = {}): TeamFixtureRun {
  return {
    teamId,
    teamShort: `T${teamId}`,
    next: [{ event: 10, opponentShort: "OPP", isHome: true, difficulty: 3 }],
    averageDifficulty: 3,
    ...overrides,
  };
}

function squadPick(p: EnrichedPlayer, opts: Partial<SquadPick> = {}): SquadPick {
  return {
    playerId: p.id,
    player: p,
    slot: 1,
    isXI: true,
    isBench: false,
    benchOrder: null,
    multiplier: 1,
    isCaptain: false,
    isViceCaptain: false,
    livePoints: 0,
    ...opts,
  };
}

// --- priceIntel ---

describe("priceIntel: buildPricePredictions", () => {
  it("classifies net transfers-in as a riser and net transfers-out as a faller", () => {
    const riser = player(1, { transfersInEvent: 600_000, transfersOutEvent: 100_000 });
    const faller = player(2, { transfersInEvent: 50_000, transfersOutEvent: 700_000 });
    const { risers, fallers } = buildPricePredictions([riser, faller]);
    expect(risers.map((r) => r.playerId)).toEqual([1]);
    expect(fallers.map((f) => f.playerId)).toEqual([2]);
    expect(risers[0].direction).toBe("RISE");
    expect(fallers[0].direction).toBe("FALL");
  });

  it("caps confidence at 100 and never goes negative", () => {
    const megaRiser = player(1, { transfersInEvent: 5_000_000, transfersOutEvent: 0 });
    const { risers } = buildPricePredictions([megaRiser]);
    expect(risers[0].confidencePct).toBe(100);
    expect(risers[0].confidencePct).toBeLessThanOrEqual(100);
  });

  it("excludes injured/doubtful/suspended/unavailable players regardless of transfer volume", () => {
    const injured = player(1, { status: "i", transfersInEvent: 900_000, transfersOutEvent: 0 });
    const { risers, fallers } = buildPricePredictions([injured]);
    expect(risers).toHaveLength(0);
    expect(fallers).toHaveLength(0);
  });

  it("skips players with zero net transfer movement", () => {
    const flat = player(1, { transfersInEvent: 1000, transfersOutEvent: 1000 });
    const { risers, fallers } = buildPricePredictions([flat]);
    expect(risers).toHaveLength(0);
    expect(fallers).toHaveLength(0);
  });

  it("respects topN and sorts by transfer magnitude", () => {
    const players = [
      player(1, { transfersInEvent: 100_000, transfersOutEvent: 0 }),
      player(2, { transfersInEvent: 900_000, transfersOutEvent: 0 }),
      player(3, { transfersInEvent: 500_000, transfersOutEvent: 0 }),
    ];
    const { risers } = buildPricePredictions(players, 2);
    expect(risers).toHaveLength(2);
    expect(risers.map((r) => r.playerId)).toEqual([2, 3]);
  });
});

// --- newsIntel ---

describe("newsIntel", () => {
  it("hasNegativeNews matches known keywords case-insensitively", () => {
    expect(hasNegativeNews("Hamstring injury - Expected back 15 Mar")).toBe(true);
    expect(hasNegativeNews("SUSPENDED for 3 matches")).toBe(true);
    expect(hasNegativeNews("")).toBe(false);
    expect(hasNegativeNews("Available for selection")).toBe(false);
  });

  it("newsPenaltyScore ranks unknown-return worse than other negative news, and clean news as 0", () => {
    expect(newsPenaltyScore("Unknown return date")).toBe(-3);
    expect(newsPenaltyScore("Knock - assessed ahead of GW10")).toBe(-2);
    expect(newsPenaltyScore("")).toBe(0);
    expect(newsPenaltyScore("Available for selection")).toBe(0);
  });

  it("formatNewsAge buckets recency correctly", () => {
    expect(formatNewsAge(null)).toBeNull();
    const now = Date.now();
    expect(formatNewsAge(new Date(now - 30 * 60 * 1000).toISOString())).toBe("just now");
    expect(formatNewsAge(new Date(now - 25 * 60 * 60 * 1000).toISOString())).toBe("1 day ago");
  });

  it("buildNewsAlerts dedupes per player+owner and sorts concerns before watches", () => {
    const watch = player(1, { availability: { chanceThisRound: 75, chanceNextRound: 75, news: "Rested for cup fixture", newsAddedAt: null, confidence: "CONFIRMED" } });
    const concern = player(2, { availability: { chanceThisRound: 0, chanceNextRound: 0, news: "Unknown return date", newsAddedAt: null, confidence: "CONFIRMED" } });
    const noNews = player(3);
    const alerts = buildNewsAlerts([
      { player: watch, ownerLabel: "My squad", isMine: true },
      { player: concern, ownerLabel: "My squad", isMine: true },
      { player: watch, ownerLabel: "My squad", isMine: true }, // duplicate, same owner
      { player: noNews, ownerLabel: "My squad", isMine: true }, // no news text, skipped
    ]);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].severity).toBe("CONCERN");
    expect(alerts[1].severity).toBe("WATCH");
  });
});

// --- rivalIntel ---

describe("rivalIntel", () => {
  it("buildFixtureRunLookup indexes runs by teamId", () => {
    const runs = [fixtureRun(1), fixtureRun(2)];
    const lookup = buildFixtureRunLookup(runs);
    expect(lookup.get(1)?.teamId).toBe(1);
    expect(lookup.get(2)?.teamId).toBe(2);
    expect(lookup.get(3)).toBeUndefined();
  });

  it("predictTransferOut flags injured starters and low-form/blank-GW starters, ignoring bench", () => {
    const injuredStarter = player(1, { status: "i" });
    const benchInjured = player(2, { status: "i" }); // on bench — should not be flagged
    const fine = player(3, { form: 8 });
    const squad = [
      squadPick(injuredStarter, { slot: 1, isXI: true, isBench: false }),
      squadPick(benchInjured, { slot: 12, isXI: false, isBench: true }),
      squadPick(fine, { slot: 2, isXI: true, isBench: false }),
    ];
    const lookup = buildFixtureRunLookup([fixtureRun(1), fixtureRun(3)]);
    const out = predictTransferOut(squad, lookup);
    const ids = out.map((c) => c.playerId);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
  });

  it("predictTransferIn only surfaces in-form, uninjured, non-blank-GW players not already owned", () => {
    const owned = player(1, { form: 7 });
    const injuredCandidate = player(2, { form: 7, status: "i" });
    const lowForm = player(3, { form: 2 });
    const blankGw = player(4, { form: 7 });
    const goodCandidate = player(5, { form: 7, transfersInEvent: 200_000 });
    const pool = [owned, injuredCandidate, lowForm, blankGw, goodCandidate];
    const lookup = buildFixtureRunLookup([
      fixtureRun(1), fixtureRun(2), fixtureRun(3),
      fixtureRun(4, { next: [], averageDifficulty: 3 }),
      fixtureRun(5),
    ]);
    const candidates = predictTransferIn(pool, new Set([1]), lookup);
    const ids = candidates.map((c) => c.playerId);
    expect(ids).toContain(5);
    expect(ids).not.toContain(1); // already owned
    expect(ids).not.toContain(2); // injured
    expect(ids).not.toContain(3); // poor form
    expect(ids).not.toContain(4); // blank GW
  });

  it("findRivalWeaknesses reports a strong squad with no obvious issues", () => {
    const strong = player(1, { form: 8 });
    const squad = [squadPick(strong, { isXI: true })];
    const lookup = buildFixtureRunLookup([fixtureRun(1, { averageDifficulty: 2 })]);
    expect(findRivalWeaknesses(squad, lookup)).toEqual(["No obvious weaknesses — strong squad"]);
  });

  it("findRivalWeaknesses flags injuries, blanks and tough fixtures in a weak squad", () => {
    const injured = player(1, { status: "i" });
    const blank = player(2);
    const tough = player(3);
    const squad = [
      squadPick(injured, { isXI: true }),
      squadPick(blank, { isXI: true }),
      squadPick(tough, { isXI: true }),
    ];
    const lookup = buildFixtureRunLookup([
      fixtureRun(1),
      fixtureRun(2, { next: [], averageDifficulty: 3 }),
      fixtureRun(3, { averageDifficulty: 4.5, next: [{ event: 10, opponentShort: "ARS", isHome: false, difficulty: 5 }] }),
    ]);
    const weaknesses = findRivalWeaknesses(squad, lookup);
    expect(weaknesses.some((w) => w.includes("Injured"))).toBe(true);
    expect(weaknesses.some((w) => w.includes("Blank GW"))).toBe(true);
    expect(weaknesses.some((w) => w.includes("Tough fixtures"))).toBe(true);
  });
});

// --- multiGwHorizon ---

describe("multiGwHorizon", () => {
  it("weights GW/GW+1/GW+2 fixtures with descending weights", () => {
    const p = player(1, { form: 5, pointsPerGame: 5 });
    const easyRun = fixtureRun(1, {
      next: [
        { event: 10, opponentShort: "A", isHome: true, difficulty: 1 },
        { event: 11, opponentShort: "B", isHome: true, difficulty: 1 },
        { event: 12, opponentShort: "C", isHome: true, difficulty: 1 },
      ],
    });
    const hardRun = fixtureRun(1, {
      next: [
        { event: 10, opponentShort: "A", isHome: false, difficulty: 5 },
        { event: 11, opponentShort: "B", isHome: false, difficulty: 5 },
        { event: 12, opponentShort: "C", isHome: false, difficulty: 5 },
      ],
    });
    const easy = multiGwValueScore(p, easyRun);
    const hard = multiGwValueScore(p, hardRun);
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(easy.horizonFixtures).toHaveLength(3);
    expect(easy.horizonFixtures[0].weight).toBe(1.0);
    expect(easy.horizonFixtures[1].weight).toBe(0.5);
    expect(easy.horizonFixtures[2].weight).toBe(0.3);
  });

  it("applies a fixed penalty for unavailable statuses and a news penalty on top", () => {
    const healthy = player(1, { status: "a", form: 5, pointsPerGame: 5 });
    const injured = player(2, { status: "i", form: 5, pointsPerGame: 5 });
    const newsy = player(3, { status: "a", form: 5, pointsPerGame: 5, availability: { chanceThisRound: 100, chanceNextRound: 100, news: "Unknown return date", newsAddedAt: null, confidence: "CONFIRMED" } });
    const run = fixtureRun(1, { next: [] });
    expect(multiGwValueScore(injured, run).score).toBeLessThan(multiGwValueScore(healthy, run).score);
    expect(multiGwValueScore(newsy, run).score).toBeLessThan(multiGwValueScore(healthy, run).score);
  });

  it("buildMultiGwHorizon returns one entry per pool player", () => {
    const pool = [player(1), player(2), player(3)];
    const lookup = buildFixtureRunLookup([fixtureRun(1), fixtureRun(2), fixtureRun(3)]);
    const map = buildMultiGwHorizon(pool, lookup);
    expect(map.size).toBe(3);
    expect(map.get(1)).toBeDefined();
  });
});

// --- captainAlt ---

describe("captainAlt", () => {
  it("rewards home fixtures and low FDR with a higher multiplier than away/high-FDR", () => {
    const p = player(1, { form: 7, pointsPerGame: 6 });
    const homeEasy = scoreCaptainAlt(p, fixtureRun(1, { next: [{ event: 10, opponentShort: "X", isHome: true, difficulty: 1 }] }));
    const awayHard = scoreCaptainAlt(p, fixtureRun(1, { next: [{ event: 10, opponentShort: "Y", isHome: false, difficulty: 5 }] }));
    expect(homeEasy.fixtureMultiplier).toBeGreaterThan(awayHard.fixtureMultiplier);
    expect(homeEasy.score).toBeGreaterThan(awayHard.score);
  });

  it("scores a blank gameweek as zero (multiplier 0)", () => {
    const p = player(1, { form: 7 });
    const blank = scoreCaptainAlt(p, fixtureRun(1, { next: [] }));
    expect(blank.score).toBe(0);
    expect(blank.reasoning.some((r) => r.includes("Blank GW"))).toBe(true);
  });

  it("applies the injury/doubt penalty even when chanceNextRound is null", () => {
    const doubtful = player(1, { status: "d", availability: { chanceThisRound: null, chanceNextRound: null, news: "", newsAddedAt: null, confidence: "CONFIRMED" } });
    const fit = player(2, { status: "a" });
    const run = fixtureRun(1);
    expect(scoreCaptainAlt(doubtful, run).score).toBeLessThan(scoreCaptainAlt(fit, run).score);
  });

  it("rankCaptainAlt sorts descending by score and respects topN", () => {
    const players = [player(1, { form: 2 }), player(2, { form: 9 }), player(3, { form: 5 })];
    const lookup = buildFixtureRunLookup([fixtureRun(1), fixtureRun(2), fixtureRun(3)]);
    const ranked = rankCaptainAlt(players, lookup, 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].playerId).toBe(2);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});

// --- spyService ---

describe("spyService: emptySpyIntel", () => {
  it("returns a well-formed empty SpyIntel for use as a best-effort fallback", () => {
    const empty = emptySpyIntel();
    expect(empty.priceRisers).toEqual([]);
    expect(empty.priceFallers).toEqual([]);
    expect(empty.newsAlerts).toEqual([]);
    expect(empty.rivalPredictions).toEqual([]);
    expect(typeof empty.computedAt).toBe("number");
  });
});

describe("spyService: buildSpyIntel", () => {
  it("assembles price predictions, news alerts (mine + rivals'), and rival predictions from squad/pool state", async () => {
    vi.resetModules();
    vi.doMock("../lib/fplClient", () => ({
      fpl: {
        transfers: vi.fn().mockResolvedValue({ data: [{ element_in: 2, element_out: 1, event: 9, time: "2026-01-01" }], stale: false, cachedAt: Date.now() }),
      },
    }));
    const { buildSpyIntel } = await import("../lib/spyService");

    const mine = player(1, { transfersInEvent: 900_000, transfersOutEvent: 0, availability: { chanceThisRound: 100, chanceNextRound: 100, news: "Knock, assessed", newsAddedAt: null, confidence: "CONFIRMED" } });
    const rivalStarter = player(2, { status: "i", form: 1 });
    const targetPlayer = player(3, { form: 8, transfersInEvent: 300_000 });

    const mySquad: SquadPick[] = [squadPick(mine, { isXI: true })];
    const rivalSquad: SquadPick[] = [squadPick(rivalStarter, { isXI: true })];

    const bootstrap = { teams: [{ id: 1, short_name: "T1" }, { id: 2, short_name: "T2" }, { id: 3, short_name: "T3" }] } as any;
    const fixtures = [
      { event: 10, team_h: 1, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 3, finished: false },
      { event: 10, team_h: 3, team_a: 5, team_h_difficulty: 2, team_a_difficulty: 2, finished: false },
    ] as any;

    const result = await buildSpyIntel({
      bootstrap,
      fixtures,
      planningGameweek: 10,
      pool: [mine, rivalStarter, targetPlayer],
      mySquad,
      rivals: [
        {
          entryId: 55,
          managerName: "Rival Manager",
          teamName: "Rival FC",
          rank: 2,
          lastRank: 2,
          movement: 0,
          gameweekPoints: 40,
          totalPoints: 400,
          gapToMe: 5,
          squad: rivalSquad,
          squadFetchFailed: false,
          bank: 0,
          teamValue: 100,
          activeChip: null,
        },
      ],
    });

    expect(result.priceRisers.some((p) => p.playerId === 1)).toBe(true);
    expect(result.newsAlerts.some((a) => a.playerId === 1 && a.isMine)).toBe(true);
    expect(result.rivalPredictions).toHaveLength(1);
    expect(result.rivalPredictions[0].entryId).toBe(55);
    expect(result.rivalPredictions[0].likelyOut.some((c) => c.playerId === 2)).toBe(true);
    expect(result.rivalPredictions[0].recentTransfers[0]).toEqual({ gw: 9, inName: "P2", outName: "P1" });

    vi.doUnmock("../lib/fplClient");
  });

  it("never blocks on a failing rival transfers fetch — recentTransfers falls back to empty, prediction still computed", async () => {
    vi.resetModules();
    vi.doMock("../lib/fplClient", () => ({
      fpl: { transfers: vi.fn().mockRejectedValue(new Error("network down")) },
    }));
    const { buildSpyIntel } = await import("../lib/spyService");

    const rivalStarter = player(1, { status: "i" });
    const rivalSquad: SquadPick[] = [squadPick(rivalStarter, { isXI: true })];
    const bootstrap = { teams: [{ id: 1, short_name: "T1" }] } as any;

    const result = await buildSpyIntel({
      bootstrap,
      fixtures: [],
      planningGameweek: 10,
      pool: [rivalStarter],
      mySquad: [],
      rivals: [
        {
          entryId: 77, managerName: "M", teamName: "T", rank: 1, lastRank: 1, movement: 0,
          gameweekPoints: 0, totalPoints: 0, gapToMe: 0, squad: rivalSquad, squadFetchFailed: false,
          bank: 0, teamValue: 100, activeChip: null,
        },
      ],
    });

    expect(result.rivalPredictions).toHaveLength(1);
    expect(result.rivalPredictions[0].recentTransfers).toEqual([]);
    vi.doUnmock("../lib/fplClient");
  });
});
