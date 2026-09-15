import { describe, expect, it } from "vitest";
import { buildTransferScenarios, buildRivalImpacts } from "../lib/analytics/transferEngine";
import { gwAdjustedPoints, buildComprehensiveTable } from "../lib/analytics/comprehensiveTable";
import { projectRankAgainstRivals, simulateWhatIf } from "../lib/analytics/whatIf";
import { estimateFreeTransfers } from "../lib/dataService";
import { calculateLiveSquadPoints, calculateLiveDghScore, buildSquadPicks } from "../lib/squadBuilder";
import { optimizeXI } from "../lib/analytics/xiOptimizer";
import { projectNextGw } from "../lib/analytics/projection";
import type { DghLedgerRow, DghLeagueConfig } from "../lib/seasonStore";
import type { EnrichedPlayer, FplFixture, FplPick, LiveResponse, RivalProfile, SquadPick } from "../lib/types";

function player(id: number, position: EnrichedPlayer["position"], epNext: number, teamId = id): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId,
    teamShort: `T${teamId}`,
    position,
    price: 5,
    form: epNext,
    pointsPerGame: epNext,
    totalPoints: 0,
    ownershipPct: 50,
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

function pick(p: EnrichedPlayer, slot: number, captain = false): SquadPick {
  return { playerId: p.id, player: p, slot, isXI: slot <= 11, isBench: slot > 11, benchOrder: slot > 11 ? slot - 11 : null, multiplier: captain ? 2 : 1, isCaptain: captain, isViceCaptain: false, livePoints: 0 };
}

function sampleSquad(): SquadPick[] {
  const players = [
    player(1, "GKP", 4),
    player(2, "DEF", 4), player(3, "DEF", 4), player(4, "DEF", 4), player(5, "DEF", 3),
    player(6, "MID", 6), player(7, "MID", 6), player(8, "MID", 5), player(9, "MID", 5), player(10, "MID", 4),
    player(11, "FWD", 5), player(12, "FWD", 4), player(13, "FWD", 3),
    player(14, "DEF", 2), player(15, "GKP", 2),
  ];
  return players.map((p, i) => pick(p, i + 1, i === 5));
}

describe("captain multiplier consistency (issue #12/#13)", () => {
  it("applies the same captain doubling to rivals as to the user's own projected total", () => {
    const squad = sampleSquad(); // captained at index 5 -> player(7, MID, 6)
    // Rival has an identical squad shape/projections to mine, so an
    // apples-to-apples comparison should show a near-50% win probability —
    // not a lopsided one caused by only doubling my own captain.
    const rivalSquad = sampleSquad();
    const rival: RivalProfile = {
      entryId: 999,
      managerName: "Rival",
      teamName: "Rival FC",
      rank: 2,
      lastRank: 2,
      movement: 0,
      gameweekPoints: 0,
      totalPoints: 100,
      gapToMe: 0,
      squad: rivalSquad,
      squadFetchFailed: false,
      bank: 0,
      teamValue: 100,
      activeChip: null,
    };
    // Mirrors how warRoom.ts / transfers.tsx compute "my" projected total:
    // XI sum + captain's projection added a second time (2x multiplier),
    // using the same optimizer/projection engine buildRivalImpacts uses
    // internally for rivals — so this is a true apples-to-apples check.
    const myXI = optimizeXI(squad);
    const myProjectedTotal =
      myXI.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + (myXI.captain?.projected ?? 0);

    const impacts = buildRivalImpacts(myProjectedTotal, 100, 1, [rival]);
    expect(impacts[0].winProbabilityThisGw).toBeGreaterThan(0.45);
    expect(impacts[0].winProbabilityThisGw).toBeLessThan(0.55);
  });
});

describe("ahead/behind labeling (issue #15)", () => {
  it("classifies a middle-of-the-table manager correctly", () => {
    const rows = [1, 2, 3, 4, 5].map((entryId) => ({
      entryId,
      managerName: `M${entryId}`,
      teamName: `T${entryId}`,
      overallPoints: 0,
      overallRank: entryId,
      wins: 0, seconds: 0, thirds: 0, podiums: 0, lastPlaceCount: 0, gwsPlayed: 1,
      moneyWon: 0, feesPaid: 0, finesPaid: 0, netMoney: 0,
      // Scores: 100, 90, 80, 70, 60 for entries 1..5 (entry 1 is top).
      gwRows: [{ event: 1, entryId, managerName: `M${entryId}`, teamName: `T${entryId}`, gwRank: entryId, rawPoints: 110 - entryId * 10, transferHits: 0, bbBenchPoints: 0, tcExtraPoints: 0, gwAdjusted: 110 - entryId * 10, isLast: false, relegationFine: false, place: null, prize: 0, activeChip: null }],
    }));
    // I am entry 3 (score 80) — should have exactly 2 managers ranked above
    // (entries 1, 2) and 2 ranked below (entries 4, 5).
    const result = projectRankAgainstRivals(80, rows, 3);
    expect(result.projectedGwRank).toBe(3);
    expect(result.aheadOf).toEqual(["T1", "T2"]);
    expect(result.behindOf).toEqual(["T4", "T5"]);
  });
});

describe("DGH scoring invariants", () => {
  it("applies the authoritative adjusted-score formula exactly once", () => {
    expect(gwAdjustedPoints({ rawPoints: 80, transferHits: 4, bbBenchPoints: 7, tcExtraPoints: 6 })).toBe(63);
  });

  it("splits tied podium prizes equally", () => {
    const config: DghLeagueConfig = { prizePoolPerGw: 100, feePerGw: 0, relegationFine: 0, relegationEnabled: false, currency: "ETB", prizePct1st: 50, prizePct2nd: 30, prizePct3rd: 20 };
    const rows: DghLedgerRow[] = [1, 2, 3].map((entryId) => ({
      event: 1, entryId, managerName: `M${entryId}`, teamName: `T${entryId}`, rawPoints: entryId === 3 ? 8 : 10,
      transferHits: 0, bbBenchPoints: 0, tcExtraPoints: 0, activeChip: null, overallRank: entryId,
    }));
    const table = buildComprehensiveTable(rows, config);
    expect(table.managers[0].gwRows[0].prize).toBe(25);
    expect(table.managers[1].gwRows[0].prize).toBe(25);
    expect(table.managers[2].gwRows[0].prize).toBe(20);
  });

  it("never relegates a disqualified (Wildcard/Free Hit) manager, even with the numeric lowest score", () => {
    const config: DghLeagueConfig = { prizePoolPerGw: 100, feePerGw: 100, relegationFine: 50, relegationEnabled: true, currency: "ETB", prizePct1st: 50, prizePct2nd: 30, prizePct3rd: 20 };
    const rows: DghLedgerRow[] = [
      // Entry 1 plays Wildcard and posts the numeric lowest raw score this GW —
      // must be DQ'd from the relegation spot, not fined.
      { event: 1, entryId: 1, managerName: "M1", teamName: "T1", rawPoints: 20, transferHits: 0, bbBenchPoints: 0, tcExtraPoints: 0, activeChip: "wildcard", overallRank: 1 },
      { event: 1, entryId: 2, managerName: "M2", teamName: "T2", rawPoints: 90, transferHits: 0, bbBenchPoints: 0, tcExtraPoints: 0, activeChip: null, overallRank: 2 },
      // Entry 3 is the lowest-scoring NON-disqualified manager -> gets relegated.
      { event: 1, entryId: 3, managerName: "M3", teamName: "T3", rawPoints: 40, transferHits: 0, bbBenchPoints: 0, tcExtraPoints: 0, activeChip: null, overallRank: 3 },
    ];
    const table = buildComprehensiveTable(rows, config);
    const rowFor = (entryId: number) => table.managers.find((m) => m.entryId === entryId)!.gwRows[0];
    expect(rowFor(1).isLast).toBe(false);
    expect(rowFor(1).relegationFine).toBe(false);
    expect(rowFor(3).isLast).toBe(true);
    expect(rowFor(3).relegationFine).toBe(true);
    expect(rowFor(2).isLast).toBe(false);
  });
});

describe("transfer and planning logic", () => {
  it("treats zero free transfers as a paid first move", () => {
    const squad = sampleSquad();
    const incoming = player(100, "MID", 10, 20);
    const pool = [...squad.map((p) => p.player), incoming];
    const zeroFt = buildTransferScenarios(squad, pool, 0, 0);
    const oneFt = buildTransferScenarios(squad, pool, 0, 1);
    expect(zeroFt[1]?.hits).toBe(1);
    expect(zeroFt[1]?.hitCost).toBe(4);
    expect(oneFt[1]?.hits).toBe(0);
    expect(oneFt[1]?.hitCost).toBe(0);
  });

  it("calculates the next-GW free-transfer allowance after the live GW", () => {
    const history = {
      current: [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 1 },
      ],
      chips: [],
    };
    // GW1 used 0 of its 1 FT, so it rolls over: GW2 starts with 2 FT (1 base + 1 rollover).
    // GW2 has already used 1 of those 2, so 1 FT is still live in the current (GW2) gameweek.
    expect(estimateFreeTransfers(history, 2, 2)).toBe(1);
    // GW2 used only 1 of its 2 available FTs, so 1 rolls over again: GW3 starts with 2 FT.
    expect(estimateFreeTransfers(history, 3, 2)).toBe(2);
  });

  it("resets next gameweek to the 1-FT baseline after a paid hit (no rollover on overspend)", () => {
    const history = {
      current: [{ event: 1, event_transfers: 2 }], // 1 FT available, 2 used = took a hit
      chips: [],
    };
    expect(estimateFreeTransfers(history, 2, 1)).toBe(1);
  });

  it("rolls the FT allowance over normally across a Wildcard gameweek (current FPL rules do not reset it to 1)", () => {
    // Stale-test note: an earlier version of this suite asserted the
    // pre-2024/25 rule where playing Wildcard/Free Hit reset banked FTs to 1.
    // FPL changed this — Wildcard/Free Hit now neither consume nor reset the
    // banked allowance, so the normal +1 rollover (capped at 5) still applies
    // for a gameweek in which 0 transfers were made and a chip was played.
    // This replaces the old assertion to match estimateFreeTransfers() and
    // the "preserves banked free transfers" test below.
    const history = {
      current: [{ event: 1, event_transfers: 0 }],
      chips: [{ name: "wildcard", event: 1 }],
    };
    expect(estimateFreeTransfers(history, 2, 1)).toBe(2);
  });
});

describe("projection consistency", () => {
  it("includes the normal captain multiplier in the What-If baseline", () => {
    const squad = sampleSquad();
    const baseline = simulateWhatIf({ currentSquad: squad, playerPool: squad.map((p) => p.player), bank: 0, freeTransfers: 1, moves: [] });
    const xiTotal = baseline.baselineGwProjected;
    expect(xiTotal).toBeGreaterThan(0);
    expect(xiTotal).toBe(baseline.scenarioGwAdjusted);
  });

  it("reports rivals ahead/behind in the correct direction", () => {
    const rows: any[] = [
      { entryId: 1, teamName: "A", gwRows: [{ gwAdjusted: 20 }] },
      { entryId: 2, teamName: "B", gwRows: [{ gwAdjusted: 15 }] },
      { entryId: 3, teamName: "YOU", gwRows: [{ gwAdjusted: 10 }] },
    ];
    const result = projectRankAgainstRivals(10, rows, 3);
    expect(result.projectedGwRank).toBe(3);
    expect(result.aheadOf).toEqual(["A", "B"]);
    expect(result.behindOf).toEqual([]);
  });
});

describe("current FPL free-transfer rollover", () => {
  it("preserves banked free transfers through Wildcard and Free Hit", () => {
    const history = {
      current: [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
      ],
      chips: [{ name: "wildcard", event: 2 }],
    };
    expect(estimateFreeTransfers(history, 3, null)).toBe(3);
  });
});

describe("What-If transfer aggregation", () => {
  it("shows both transfers and sums their projected deltas once", () => {
    // NOTE: in-players are chosen with epNext below the squad's existing top
    // captain candidate (player 6, ep 6) so this scenario doesn't also
    // trigger a captain reassignment. Captain-driven swing is exercised
    // separately by "captain multiplier consistency" above — mixing that
    // confound into this test would make it assert a false invariant, since
    // netSwing legitimately diverges from transferNetDelta when a transfer
    // changes who the optimizer captains (see optimizeXI + netSwing docs).
    const squad = sampleSquad();
    const inA = player(101, "DEF", 5, 20);
    const inB = player(102, "MID", 5, 21);
    const result = simulateWhatIf({
      currentSquad: squad,
      playerPool: [...squad.map((p) => p.player), inA, inB],
      bank: 0,
      freeTransfers: 2,
      moves: [
        { outPlayerId: 2, inPlayerId: 101 },
        { outPlayerId: 9, inPlayerId: 102 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.moves).toHaveLength(2);
    expect(result.moves.every((m) => m.valid)).toBe(true);
    expect(result.transferNetDelta).toBeCloseTo(result.moves[0].delta + result.moves[1].delta, 5);
    expect(result.transferHits).toBe(0);
    expect(result.netSwing).toBeCloseTo(result.transferNetDelta, 5);
    expect(result.netBankChange).toBeCloseTo(result.bankAfter, 5);
  });

  it("applies one aggregate hit to the full transfer set", () => {
    const squad = sampleSquad();
    const inA = player(104, "DEF", 7, 20);
    const inB = player(105, "MID", 8, 21);
    const result = simulateWhatIf({
      currentSquad: squad,
      playerPool: [...squad.map((p) => p.player), inA, inB],
      bank: 0,
      freeTransfers: 0,
      moves: [
        { outPlayerId: 2, inPlayerId: 104 },
        { outPlayerId: 6, inPlayerId: 105 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.transfersMade).toBe(2);
    expect(result.paidTransfers).toBe(2);
    expect(result.transferHits).toBe(8);
  });

  it("aggregates bank movement across multiple transfers", () => {
    const squad = sampleSquad();
    const inA = { ...player(106, "DEF", 5.5, 20), price: 6.5 }; // +1.5m needed versus the 5.0m outgoing
    const inB = { ...player(107, "MID", 5.0, 21), price: 3.0 }; // -2.0m released, so combined = +0.5m bank
    const result = simulateWhatIf({
      currentSquad: squad,
      playerPool: [...squad.map((p) => p.player), inA, inB],
      bank: 3.0,
      freeTransfers: 2,
      moves: [
        { outPlayerId: 2, inPlayerId: 106 },
        { outPlayerId: 6, inPlayerId: 107 },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.netBankChange).toBeCloseTo(0.5, 5);
    expect(result.bankAfter).toBeCloseTo(3.5, 5);
  });

  it("keeps all requested rows visible even when one transfer is invalid", () => {
    const squad = sampleSquad();
    const inA = player(103, "DEF", 7, 22);
    const result = simulateWhatIf({
      currentSquad: squad,
      playerPool: [...squad.map((p) => p.player), inA],
      bank: 0,
      freeTransfers: 2,
      moves: [
        { outPlayerId: 2, inPlayerId: 103 },
        { outPlayerId: 99999, inPlayerId: 103 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.moves).toHaveLength(2);
  });
});

describe("live DGH mini-league scoring", () => {
  it("applies hits, bench boost removal, triple-captain extra removal and live bonus without double-counting bonus", () => {
    const squad = sampleSquad().map((p, i) => ({
      ...p,
      livePoints: i === 5 ? 10 : i === 11 ? 7 : 4,
      liveBonus: i === 5 ? 3 : 0,
      liveMinutes: 90,
      liveYellowCards: 0,
      liveRedCards: 0,
    }));
    const bb = calculateLiveDghScore(squad, "bboost", 4, [], 1);
    expect(bb.rawPoints).toBeGreaterThan(0);
    expect(bb.bbBenchPoints).toBe(7 + 4 + 4 + 4);
    expect(bb.dghPoints).toBe(bb.rawPoints - 4 - bb.bbBenchPoints);

    const tc = calculateLiveDghScore(squad, "3xc", 4, [], 1);
    expect(tc.tcExtraPoints).toBe(10);
    expect(tc.dghPoints).toBe(tc.rawPoints - 4 - 10);
    expect(tc.bonusPoints).toBe(3);
  });

  it("uses official bench order and formation rules for a non-playing starter", () => {
    const squad = sampleSquad().map((p, i) => ({ ...p, livePoints: 5, liveMinutes: i === 6 ? 0 : 90, liveBonus: 0, liveYellowCards: 0, liveRedCards: 0 }));
    const result = calculateLiveDghScore(squad, null, 0, [], 1);
    expect(result.autoSubPoints).toBe(5);
    expect(result.scoringPlayerIds).toContain(12);
  });

  it("keeps Wildcard/Free Hit as a chip signal for the live table rather than changing FPL raw points", () => {
    const squad = sampleSquad().map(p => ({ ...p, livePoints: 5, liveMinutes: 90, liveBonus: 0, liveYellowCards: 0, liveRedCards: 0 }));
    const result = calculateLiveDghScore(squad, "wildcard", 0, [], 1);
    expect(result.dghPoints).toBe(result.rawPoints);
  });

  it("does not auto-substitute a starter while their club's fixture is still unfinished (in progress, not postponed)", () => {
    // Slot 3 (player 3, DEF, team 3) has 0 minutes so far, but their fixture
    // is live (started, not finished) — they may still come on, so they must
    // stay in the scoring XI at 0 points rather than being subbed early.
    const squad = sampleSquad().map((p, i) => ({
      ...p,
      livePoints: p.slot === 3 ? 0 : 5,
      liveMinutes: p.slot === 3 ? 0 : 90,
      liveBonus: 0,
      liveYellowCards: 0,
      liveRedCards: 0,
    }));
    const fixtures: FplFixture[] = [
      { id: 900, event: 1, team_h: 3, team_a: 20, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2026-08-31T12:00:00Z", finished: false, started: true, team_h_score: 0, team_a_score: 0 },
    ];
    const result = calculateLiveDghScore(squad, null, 0, fixtures, 1);
    expect(result.scoringPlayerIds).toContain(3);
    expect(result.autoSubPoints).toBe(0);
    // Bench (players 12,13,14,15) never comes on while the starter's own
    // fixture is still live.
    expect(result.scoringPlayerIds).not.toContain(14);
  });

  it("substitutes a starter immediately once their club has no fixture in this gameweek (postponed/removed)", () => {
    // Slot 3 (player 3, DEF, team 3) never played and has no fixture entry
    // for this event at all — official FPL treats "no fixture this GW" the
    // same as "finished with 0 minutes" for auto-sub purposes.
    const squad = sampleSquad().map((p) => ({
      ...p,
      livePoints: p.slot === 3 ? 0 : 5,
      liveMinutes: p.slot === 3 ? 0 : 90,
      liveBonus: 0,
      liveYellowCards: 0,
      liveRedCards: 0,
    }));
    // Official FPL bench order is tried top-down (outfield sub 1, 2, 3) and
    // only needs to keep the formation legal — it isn't required to match
    // the missing player's position. Bench order 1 is player 12 (FWD), and
    // swapping a FWD in for the missing DEF still leaves 3 DEF (the
    // minimum), so player 12 — not the next-in-order DEF at bench slot 3 —
    // is the correct sub here, exactly as the live FPL engine would do it.
    const fixtures: FplFixture[] = [
      { id: 901, event: 1, team_h: 99, team_a: 98, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: null, finished: false, started: false, team_h_score: null, team_a_score: null },
    ];
    const result = calculateLiveDghScore(squad, null, 0, fixtures, 1);
    expect(result.scoringPlayerIds).not.toContain(3);
    expect(result.scoringPlayerIds).toContain(12);
    expect(result.autoSubPoints).toBe(5);
  });

  it("leaves the goalkeeper slot unfilled without crashing when neither the starting nor bench GK has played", () => {
    // Both GKs (starter #1, bench #15) have 0 minutes and no card — a
    // legitimate double-blank at the position. The engine must not force an
    // invalid substitution and must not throw.
    const squad = sampleSquad().map((p) => ({
      ...p,
      livePoints: p.player.position === "GKP" ? 0 : 5,
      liveMinutes: p.player.position === "GKP" ? 0 : 90,
      liveBonus: 0,
      liveYellowCards: 0,
      liveRedCards: 0,
    }));
    const fixtures: FplFixture[] = [
      { id: 902, event: 1, team_h: 1, team_a: 50, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2026-08-31T12:00:00Z", finished: true, started: true, team_h_score: 0, team_a_score: 0 },
      { id: 903, event: 1, team_h: 15, team_a: 51, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: "2026-08-31T12:00:00Z", finished: true, started: true, team_h_score: 0, team_a_score: 0 },
    ];
    expect(() => calculateLiveDghScore(squad, null, 0, fixtures, 1)).not.toThrow();
    const result = calculateLiveDghScore(squad, null, 0, fixtures, 1);
    expect(result.scoringPlayerIds).not.toContain(1);
    expect(result.scoringPlayerIds).not.toContain(15);
  });
});

describe("buildSquadPicks resilience to partial/malformed live data", () => {
  const enriched = (id: number): EnrichedPlayer => ({
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: id,
    teamShort: `T${id}`,
    position: "MID",
    price: 5,
    form: 4,
    pointsPerGame: 4,
    totalPoints: 0,
    ownershipPct: 10,
    minutes: 900,
    status: "a",
    availability: { chanceThisRound: 100, chanceNextRound: 100, news: "", newsAddedAt: null, confidence: "CONFIRMED" },
    xG: 0,
    xA: 0,
    xGI: 0,
    bonus: 0,
    bps: 0,
    ictIndex: 0,
    epNext: 4,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
  });

  it("drops a pick whose player is missing from the bootstrap index instead of crashing", () => {
    const playerIndex = new Map<number, EnrichedPlayer>([[1, enriched(1)]]);
    const picks: FplPick[] = [
      { element: 1, position: 1, multiplier: 1, is_captain: false, is_vice_captain: false },
      { element: 999, position: 2, multiplier: 1, is_captain: false, is_vice_captain: false }, // not in bootstrap
    ];
    expect(() => buildSquadPicks(picks, playerIndex, null)).not.toThrow();
    const result = buildSquadPicks(picks, playerIndex, null);
    expect(result).toHaveLength(1);
    expect(result[0]?.playerId).toBe(1);
  });

  it("defaults live points/bonus/minutes to zero when the live feed has no entry for a player yet", () => {
    const playerIndex = new Map<number, EnrichedPlayer>([[1, enriched(1)]]);
    const picks: FplPick[] = [{ element: 1, position: 1, multiplier: 1, is_captain: false, is_vice_captain: false }];
    // Live response exists (GW has started) but this specific player's row
    // hasn't been published yet — a real, observed FPL API race condition.
    const live: LiveResponse = { elements: [] };
    const result = buildSquadPicks(picks, playerIndex, live);
    expect(result[0]?.livePoints).toBe(0);
    expect(result[0]?.liveBonus).toBe(0);
    expect(result[0]?.liveMinutes).toBe(0);
  });

  it("handles a null live response (pre-kickoff / not yet fetched) without crashing", () => {
    const playerIndex = new Map<number, EnrichedPlayer>([[1, enriched(1)]]);
    const picks: FplPick[] = [{ element: 1, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false }];
    expect(() => buildSquadPicks(picks, playerIndex, null)).not.toThrow();
    const result = buildSquadPicks(picks, playerIndex, null);
    expect(result[0]?.livePoints).toBe(0);
    expect(result[0]?.isCaptain).toBe(true);
  });
});

describe("live mini-league scoring", () => {
  it("applies FPL pick multipliers to official live player points", () => {
    const squad: any[] = [
      { livePoints: 8, multiplier: 2 },
      { livePoints: 6, multiplier: 1 },
      { livePoints: 10, multiplier: 0 },
      { livePoints: 5, multiplier: 3 },
    ];
    expect(calculateLiveSquadPoints(squad as any)).toBe(37);
  });
});
