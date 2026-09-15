import { describe, expect, it } from "vitest";
import {
  getUnscheduledFixtures,
  estimateLikelyFutureDgws,
  scanDgwBgw,
  describeGwFixtureLoad,
  nextDgwAndBgw,
  type GwFixtureLoad,
} from "../lib/analytics/dgwIntel";
import { recommendChipTiming, emptyChipTimingPlan } from "../lib/analytics/recommendChipTiming";
import { CHIP_LABELS, type ChipName, type ChipStatus } from "../lib/analytics/chips";
import type { Bootstrap, EnrichedPlayer, FplFixture, SquadPick } from "../lib/types";

// --- shared fixtures ---

function team(id: number) {
  return {
    id,
    name: `Team ${id}`,
    short_name: `T${id}`,
    strength: 3,
    strength_overall_home: 3,
    strength_overall_away: 3,
    strength_attack_home: 3,
    strength_attack_away: 3,
    strength_defence_home: 3,
    strength_defence_away: 3,
  };
}

function bootstrapWithTeams(count: number): Bootstrap {
  return {
    events: [],
    teams: Array.from({ length: count }, (_, i) => team(i + 1)),
    elements: [],
    element_types: [],
    total_players: 0,
  };
}

function fx(id: number, event: number | null, teamH: number, teamA: number, diff = 3, finished = false): FplFixture {
  return {
    id,
    event,
    team_h: teamH,
    team_a: teamA,
    team_h_difficulty: diff,
    team_a_difficulty: diff,
    kickoff_time: null,
    finished,
    started: false,
    team_h_score: null,
    team_a_score: null,
  };
}

function player(id: number, position: EnrichedPlayer["position"], epNext: number, teamId: number, price = 5): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId,
    teamShort: `T${teamId}`,
    position,
    price,
    form: epNext,
    pointsPerGame: epNext,
    totalPoints: 0,
    ownershipPct: 20,
    minutes: 900,
    status: "a",
    availability: { chanceThisRound: 100, chanceNextRound: 100, news: "", newsAddedAt: null, confidence: "CONFIRMED" },
    xG: 0,
    xA: 0,
    xGI: 0,
    bonus: 0,
    bps: 0,
    ictIndex: 0,
    epNext,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
  };
}

function pick(p: EnrichedPlayer, slot: number): SquadPick {
  return { playerId: p.id, player: p, slot, isXI: slot <= 11, isBench: slot > 11, benchOrder: slot > 11 ? slot - 11 : null, multiplier: 1, isCaptain: false, isViceCaptain: false, livePoints: 0 };
}

function allAvailable(): ChipStatus[] {
  return (["wildcard", "freehit", "bboost", "3xc"] as ChipName[]).map((name) => ({ name, label: CHIP_LABELS[name], available: true, usedEvent: null, half: 1 }));
}

// --- dgwIntel ---

describe("dgwIntel: getUnscheduledFixtures", () => {
  it("returns only fixtures with a null event that are not finished", () => {
    const fixtures = [fx(1, null, 1, 2), fx(2, 5, 1, 2), fx(3, null, 3, 4, 3, true)];
    expect(getUnscheduledFixtures(fixtures).map((f) => f.id)).toEqual([1]);
  });
});

describe("dgwIntel: estimateLikelyFutureDgws", () => {
  it("flags a team with exactly one scheduled fixture in an event AND a pending postponed match", () => {
    const fixtures = [
      fx(1, null, 1, 2), // postponed, team 1 & 2 pending
      fx(2, 20, 1, 3), // team 1's only scheduled fixture in GW20
      fx(3, 20, 4, 5), // unrelated normal fixture
    ];
    const likely = estimateLikelyFutureDgws(fixtures, [20, 21]);
    expect(likely).toHaveLength(1);
    expect(likely[0].event).toBe(20);
    expect(likely[0].teamIds).toEqual([1]);
  });

  it("returns nothing when there are no unscheduled fixtures", () => {
    expect(estimateLikelyFutureDgws([fx(1, 20, 1, 2)], [20])).toEqual([]);
  });

  it("excludes a team that already has two fixtures in the scanned event", () => {
    const fixtures = [fx(1, null, 1, 2), fx(2, 20, 1, 3), fx(3, 20, 1, 4)];
    expect(estimateLikelyFutureDgws(fixtures, [20])).toEqual([]);
  });
});

describe("dgwIntel: scanDgwBgw", () => {
  const bootstrap = bootstrapWithTeams(8);
  const fixtures: FplFixture[] = [
    // normal gameweeks: everyone plays exactly once
    fx(101, 11, 1, 2), fx(102, 11, 3, 4), fx(103, 11, 5, 6), fx(104, 11, 7, 8),
    fx(105, 13, 1, 2), fx(106, 13, 3, 4), fx(107, 13, 5, 6), fx(108, 13, 7, 8),
    // GW12: team 1 doubles (vs 3 and vs 4), team 2 blanks
    fx(109, 12, 1, 3), fx(110, 12, 1, 4), fx(111, 12, 5, 6), fx(112, 12, 7, 8),
  ];

  it("detects a double gameweek team (2+ fixtures) and a blank gameweek team (0 fixtures)", () => {
    const scan = scanDgwBgw(bootstrap, fixtures, 11, 4);
    const gw12 = scan.gameweeks.find((g) => g.event === 12)!;
    expect(gw12.dgwTeamIds).toEqual([1]);
    expect(gw12.bgwTeamIds).toEqual([2]);
  });

  it("finds no doubles or blanks in a normal gameweek", () => {
    const scan = scanDgwBgw(bootstrap, fixtures, 11, 4);
    const gw11 = scan.gameweeks.find((g) => g.event === 11)!;
    expect(gw11.dgwTeamIds).toEqual([]);
    expect(gw11.bgwTeamIds).toEqual([]);
  });

  it("caps the scan window at gameweek 38", () => {
    const scan = scanDgwBgw(bootstrap, fixtures, 36, 10);
    expect(scan.gameweeks.map((g) => g.event)).toEqual([36, 37, 38]);
  });
});

describe("dgwIntel: describeGwFixtureLoad", () => {
  const teamById = new Map([[1, { short_name: "ARS" }], [2, { short_name: "CHE" }]]);
  const base: GwFixtureLoad = { event: 12, fixtureCountByTeam: new Map(), dgwTeamIds: [], bgwTeamIds: [], avgFixtureDifficulty: 3 };

  it("describes a gameweek with both a double and a blank", () => {
    expect(describeGwFixtureLoad({ ...base, dgwTeamIds: [1], bgwTeamIds: [2] }, teamById)).toBe("GW12: double for ARS, blank for CHE.");
  });
  it("describes a double-only gameweek", () => {
    expect(describeGwFixtureLoad({ ...base, dgwTeamIds: [1] }, teamById)).toBe("GW12: double gameweek for ARS.");
  });
  it("describes a blank-only gameweek", () => {
    expect(describeGwFixtureLoad({ ...base, bgwTeamIds: [2] }, teamById)).toBe("GW12: blank gameweek for CHE.");
  });
  it("describes a normal gameweek", () => {
    expect(describeGwFixtureLoad(base, teamById)).toBe("GW12: normal fixture list, no doubles or blanks.");
  });
});

describe("dgwIntel: nextDgwAndBgw", () => {
  it("returns the first gameweek carrying each signal", () => {
    const gws: GwFixtureLoad[] = [
      { event: 10, fixtureCountByTeam: new Map(), dgwTeamIds: [], bgwTeamIds: [], avgFixtureDifficulty: 3 },
      { event: 11, fixtureCountByTeam: new Map(), dgwTeamIds: [1], bgwTeamIds: [], avgFixtureDifficulty: 3 },
      { event: 12, fixtureCountByTeam: new Map(), dgwTeamIds: [], bgwTeamIds: [2], avgFixtureDifficulty: 3 },
    ];
    const { nextDgw, nextBgw } = nextDgwAndBgw({ fromEvent: 10, scanWindow: 3, gameweeks: gws, unscheduledFixtures: [], likelyFutureDgws: [] });
    expect(nextDgw?.event).toBe(11);
    expect(nextBgw?.event).toBe(12);
  });

  it("returns null for a signal that never occurs in the scan", () => {
    const gws: GwFixtureLoad[] = [{ event: 10, fixtureCountByTeam: new Map(), dgwTeamIds: [], bgwTeamIds: [], avgFixtureDifficulty: 3 }];
    const { nextDgw, nextBgw } = nextDgwAndBgw({ fromEvent: 10, scanWindow: 1, gameweeks: gws, unscheduledFixtures: [], likelyFutureDgws: [] });
    expect(nextDgw).toBeNull();
    expect(nextBgw).toBeNull();
  });
});

// --- recommendChipTiming ---

// Scan window GW11-14, with GW12 as a double for team 1 / blank for team 2 —
// identical shape to the scanDgwBgw fixtures above but starting one gameweek
// earlier, so heavyChipCandidateEvents (fromEvent=11, plus DGW/BGW events)
// resolves to [11, 12] — putting a wildcard candidate directly at GW12's
// bench-boost-1 slot, so the WC-before-BB combo below has somewhere to land.
const chipFixtures: FplFixture[] = [
  fx(201, 11, 1, 2), fx(202, 11, 3, 4), fx(203, 11, 5, 6), fx(204, 11, 7, 8),
  fx(205, 12, 1, 3), fx(206, 12, 1, 4), fx(207, 12, 5, 6), fx(208, 12, 7, 8),
  fx(209, 13, 1, 2), fx(210, 13, 3, 4), fx(211, 13, 5, 6), fx(212, 13, 7, 8),
  fx(213, 14, 1, 2), fx(214, 14, 3, 4), fx(215, 14, 5, 6), fx(216, 14, 7, 8),
];

// Current 15-man squad: team 1 (this scan's DGW team) supplies the weakest
// GKP and weakest DEF, so they are guaranteed to be benched under every
// legal formation — isolating the double-fixture bench-boost signal to
// exactly those two players. Every other player is on teams 6/7/8, which
// have exactly one fixture in every scanned gameweek including GW12, so
// their own fixture-adjusted projection never varies across the scan.
function chipSquad(): SquadPick[] {
  const players = [
    player(1, "GKP", 0.1, 1), // weak, DGW team -> always benched
    player(2, "GKP", 6, 6),
    player(3, "DEF", 0.1, 1), // weak, DGW team -> always benched
    player(4, "DEF", 5, 6),
    player(5, "DEF", 5, 7),
    player(6, "DEF", 5, 8),
    player(7, "DEF", 5, 6),
    player(8, "MID", 5.5, 7),
    player(9, "MID", 5.5, 8),
    player(10, "MID", 5.5, 7),
    player(11, "MID", 5.5, 8),
    player(12, "MID", 5.5, 7),
    player(13, "FWD", 5, 8),
    player(14, "FWD", 5, 8),
    player(15, "FWD", 5, 8),
  ];
  return players.map((p, i) => pick(p, i + 1));
}

// A broad pool (1 GKP/DEF/MID/FWD per team, teams 1-8) for the wildcard/
// free-hit squad search — enough depth per position and clubs to satisfy
// the 3-per-club limit while staying within a generous budget.
function chipPool(): EnrichedPlayer[] {
  const pool: EnrichedPlayer[] = [];
  let id = 100;
  for (let t = 1; t <= 8; t++) {
    pool.push(player(id++, "GKP", 5, t));
    pool.push(player(id++, "DEF", 5, t));
    pool.push(player(id++, "MID", 5, t));
    pool.push(player(id++, "FWD", 5, t));
  }
  return pool;
}

describe("recommendChipTiming: availability", () => {
  it("marks an already-used chip as unavailable with no candidates", () => {
    const statuses = allAvailable().map((s) => (s.name === "3xc" ? { ...s, available: false, usedEvent: 8 } : s));
    const plan = recommendChipTiming({
      chipStatuses: statuses,
      currentSquad: chipSquad(),
      pool: chipPool(),
      fixtures: chipFixtures,
      bootstrap: bootstrapWithTeams(8),
      budget: 100,
      fromEvent: 11,
      scanWindow: 4,
    });
    const tc = plan.recommendations.find((r) => r.chip === "3xc")!;
    expect(tc.available).toBe(false);
    expect(tc.bestGw).toBeNull();
    expect(tc.allCandidates).toEqual([]);
    expect(tc.reasoning).toEqual(["3xc already used this half."]);
  });
});

describe("recommendChipTiming: DGW-aware bench boost", () => {
  const plan = recommendChipTiming({
    chipStatuses: allAvailable(),
    currentSquad: chipSquad(),
    pool: chipPool(),
    fixtures: chipFixtures,
    bootstrap: bootstrapWithTeams(8),
    budget: 100,
    fromEvent: 11,
    scanWindow: 4,
  });
  const bb = plan.recommendations.find((r) => r.chip === "bboost")!;

  it("evaluates bench boost across the whole scan window, not just heavy events", () => {
    expect(bb.allCandidates.map((c) => c.gw).sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
  });

  it("scores the double gameweek strictly higher than every normal gameweek", () => {
    const byGw = new Map(bb.allCandidates.map((c) => [c.gw, c.score]));
    expect(byGw.get(12)!).toBeGreaterThan(byGw.get(11)!);
    expect(byGw.get(12)!).toBeGreaterThan(byGw.get(13)!);
    expect(byGw.get(12)!).toBeGreaterThan(byGw.get(14)!);
  });

  it("recommends the double gameweek as the best bench boost window", () => {
    expect(bb.bestGw).toBe(12);
    expect(bb.reasoning.some((r) => r.includes("GW12") && r.toLowerCase().includes("double"))).toBe(true);
  });

  it("gives identical scores across every non-double gameweek", () => {
    const byGw = new Map(bb.allCandidates.map((c) => [c.gw, c.score]));
    expect(byGw.get(11)).toBe(byGw.get(13));
    expect(byGw.get(11)).toBe(byGw.get(14));
  });
});

describe("recommendChipTiming: wildcard/free-hit only scan heavy events", () => {
  const plan = recommendChipTiming({
    chipStatuses: allAvailable(),
    currentSquad: chipSquad(),
    pool: chipPool(),
    fixtures: chipFixtures,
    bootstrap: bootstrapWithTeams(8),
    budget: 100,
    fromEvent: 11,
    scanWindow: 4,
  });

  it("restricts wildcard candidates to fromEvent plus DGW/BGW events, skipping ordinary gameweeks", () => {
    const wc = plan.recommendations.find((r) => r.chip === "wildcard")!;
    expect(wc.allCandidates.map((c) => c.gw).sort((a, b) => a - b)).toEqual([11, 12]);
  });

  it("restricts free hit candidates the same way", () => {
    const fh = plan.recommendations.find((r) => r.chip === "freehit")!;
    expect(fh.allCandidates.map((c) => c.gw).sort((a, b) => a - b)).toEqual([11, 12]);
  });
});

describe("recommendChipTiming: Wildcard-before-Bench-Boost combo", () => {
  it("adds a combo bonus to the wildcard candidate one gameweek before the best bench boost window", () => {
    const plan = recommendChipTiming({
      chipStatuses: allAvailable(),
      currentSquad: chipSquad(),
      pool: chipPool(),
      fixtures: chipFixtures,
      bootstrap: bootstrapWithTeams(8),
      budget: 100,
      fromEvent: 11,
      scanWindow: 4,
    });
    const bb = plan.recommendations.find((r) => r.chip === "bboost")!;
    expect(bb.bestGw).toBe(12); // precondition for this test's premise

    const wc = plan.recommendations.find((r) => r.chip === "wildcard")!;
    const comboCandidate = wc.allCandidates.find((c) => c.gw === 11)!;
    expect(comboCandidate.comboBonus).toBeGreaterThan(0);
    expect(comboCandidate.comboReason).toMatch(/GW12/);
    expect(comboCandidate.score).toBeCloseTo(comboCandidate.window.expectedGain + comboCandidate.comboBonus, 5);
  });

  it("does not add a combo bonus to a wildcard candidate that isn't immediately before the bench boost window", () => {
    const plan = recommendChipTiming({
      chipStatuses: allAvailable(),
      currentSquad: chipSquad(),
      pool: chipPool(),
      fixtures: chipFixtures,
      bootstrap: bootstrapWithTeams(8),
      budget: 100,
      fromEvent: 11,
      scanWindow: 4,
    });
    const wc = plan.recommendations.find((r) => r.chip === "wildcard")!;
    const nonComboCandidate = wc.allCandidates.find((c) => c.gw === 12)!;
    expect(nonComboCandidate.comboBonus).toBe(0);
    expect(nonComboCandidate.comboReason).toBeNull();
  });
});

describe("recommendChipTiming: scan passthrough", () => {
  it("exposes the underlying DGW/BGW scan on the returned plan", () => {
    const plan = recommendChipTiming({
      chipStatuses: allAvailable(),
      currentSquad: chipSquad(),
      pool: chipPool(),
      fixtures: chipFixtures,
      bootstrap: bootstrapWithTeams(8),
      budget: 100,
      fromEvent: 11,
      scanWindow: 4,
    });
    const { nextDgw, nextBgw } = nextDgwAndBgw(plan.scan);
    expect(nextDgw?.event).toBe(12);
    expect(nextBgw?.event).toBe(12);
  });
});

describe("emptyChipTimingPlan", () => {
  it("returns an unavailable, empty recommendation for every chip", () => {
    const plan = emptyChipTimingPlan(15);
    expect(plan.scan.fromEvent).toBe(15);
    expect(plan.scan.gameweeks).toEqual([]);
    expect(plan.recommendations).toHaveLength(4);
    for (const rec of plan.recommendations) {
      expect(rec.available).toBe(false);
      expect(rec.bestGw).toBeNull();
      expect(rec.allCandidates).toEqual([]);
    }
  });
});
