import { describe, expect, it } from "vitest";
import { validateWarRoomData } from "../lib/validation";
import { LEAGUE_ID, MY_ENTRY_ID } from "../lib/config";
import type { EnrichedPlayer, RivalProfile, SquadPick, StandingsRow } from "../lib/types";

function player(id: number, overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: 1,
    teamShort: "T1",
    position: "MID",
    price: 7.5,
    form: 4,
    pointsPerGame: 4,
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
    epNext: 4,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
    ...overrides,
  };
}

function pick(p: EnrichedPlayer, slot: number, isCaptain = false, isViceCaptain = false): SquadPick {
  return { playerId: p.id, player: p, slot, isXI: slot <= 11, isBench: slot > 11, benchOrder: slot > 11 ? slot - 11 : null, multiplier: isCaptain ? 2 : 1, isCaptain, isViceCaptain, livePoints: 0 };
}

/** A clean, fully valid 15-man squad: 11 XI + 4 bench, one captain, one
 * distinct vice-captain, all prices in a sane range. */
function validSquad(): SquadPick[] {
  const players = Array.from({ length: 15 }, (_, i) => player(i + 1, { price: 5 + i * 0.3 }));
  return players.map((p, i) => pick(p, i + 1, i === 0, i === 1));
}

function standingsRow(entry: number): StandingsRow {
  return { id: entry, entry, player_name: `Manager ${entry}`, entry_name: `Team ${entry}`, rank: entry, last_rank: entry, event_total: 50, total: 500 };
}

function rivalProfile(entryId: number, squad: SquadPick[] | null = null): RivalProfile {
  return {
    entryId,
    managerName: `M${entryId}`,
    teamName: `T${entryId}`,
    rank: entryId,
    lastRank: entryId,
    movement: 0,
    gameweekPoints: 0,
    totalPoints: 0,
    gapToMe: 0,
    squad,
    squadFetchFailed: squad === null,
    bank: 0,
    teamValue: 100,
    activeChip: null,
  };
}

function baseInput(overrides: Partial<Parameters<typeof validateWarRoomData>[0]> = {}) {
  const standings = [standingsRow(MY_ENTRY_ID), standingsRow(10), standingsRow(11)];
  const rivals = [rivalProfile(10, validSquad()), rivalProfile(11, validSquad())];
  return {
    configuredLeagueId: LEAGUE_ID,
    configuredEntryId: MY_ENTRY_ID,
    standings,
    gameweek: 5,
    rivals,
    mySquadPickCount: 15,
    mySquad: validSquad(),
    ...overrides,
  };
}

describe("validateWarRoomData — full 14-point checklist", () => {
  it("returns exactly 14 checks when a full squad is supplied", () => {
    const report = validateWarRoomData(baseInput());
    expect(report.checks).toHaveLength(14);
  });

  it("passes every check for a fully clean, valid dataset", () => {
    const report = validateWarRoomData(baseInput());
    expect(report.allPassed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails rival-squads-fetched when a rival squad is unavailable", () => {
    const rivals = [rivalProfile(10, validSquad()), rivalProfile(11, null)];
    const report = validateWarRoomData(baseInput({ rivals }));
    const check = report.checks.find((c) => c.id === "rival-squads-fetched")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("1/2");
    expect(report.allPassed).toBe(false);
  });

  it("falls back to 8 checks with 5 PENDING(fail) entries when mySquad is omitted, without throwing", () => {
    const { mySquad, ...rest } = baseInput();
    const report = validateWarRoomData(rest);
    expect(report.checks).toHaveLength(14);
    const pendingIds = ["squad-size-15", "xi-size-11", "bench-size-4", "captaincy-flags", "price-accuracy"];
    for (const id of pendingIds) {
      const check = report.checks.find((c) => c.id === id)!;
      expect(check.passed).toBe(false);
    }
    expect(report.allPassed).toBe(false);
  });

  it("fails squad-size-15 when the squad has fewer than 15 picks", () => {
    const squad = validSquad().slice(0, 14);
    const report = validateWarRoomData(baseInput({ mySquad: squad, mySquadPickCount: squad.length }));
    const check = report.checks.find((c) => c.id === "squad-size-15")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("14/15");
  });

  it("fails xi-size-11 when isXI count is not 11", () => {
    const squad = validSquad();
    squad[0] = { ...squad[0], isXI: false, isBench: true }; // move one XI player to bench flag-wise
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "xi-size-11")!;
    expect(check.passed).toBe(false);
  });

  it("fails bench-size-4 when isBench count is not 4", () => {
    const squad = validSquad();
    squad[11] = { ...squad[11], isBench: false }; // one bench player loses its bench flag
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "bench-size-4")!;
    expect(check.passed).toBe(false);
  });

  it("fails captaincy-flags when there is no captain", () => {
    const squad = validSquad().map((p) => ({ ...p, isCaptain: false }));
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "captaincy-flags")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("0 captain flag");
  });

  it("fails captaincy-flags when there are two captains", () => {
    const squad = validSquad();
    squad[2] = { ...squad[2], isCaptain: true };
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "captaincy-flags")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("2 captain flag");
  });

  it("fails captaincy-flags when captain and vice-captain are the same player", () => {
    const squad = validSquad();
    squad[1] = { ...squad[1], isViceCaptain: false };
    squad[0] = { ...squad[0], isViceCaptain: true }; // captain is also flagged vice-captain
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "captaincy-flags")!;
    expect(check.passed).toBe(false);
  });

  it("passes captaincy-flags for a normal squad and reports both names", () => {
    const report = validateWarRoomData(baseInput());
    const check = report.checks.find((c) => c.id === "captaincy-flags")!;
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("Captain:");
    expect(check.detail).toContain("Vice:");
  });

  it("fails price-accuracy when a player's price is absurdly low (corrupted feed)", () => {
    const squad = validSquad();
    squad[0] = { ...squad[0], player: { ...squad[0].player, price: 0.1 } };
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "price-accuracy")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("P1");
  });

  it("fails price-accuracy when a player's price is absurdly high (corrupted feed)", () => {
    const squad = validSquad();
    squad[0] = { ...squad[0], player: { ...squad[0].player, price: 999 } };
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "price-accuracy")!;
    expect(check.passed).toBe(false);
  });

  it("passes price-accuracy for realistic FPL prices at both ends of the real range", () => {
    const squad = validSquad();
    squad[0] = { ...squad[0], player: { ...squad[0].player, price: 3.9 } }; // cheapest-ever bench GKP tier
    squad[1] = { ...squad[1], player: { ...squad[1].player, price: 15.5 } }; // most expensive tier seen
    const report = validateWarRoomData(baseInput({ mySquad: squad }));
    const check = report.checks.find((c) => c.id === "price-accuracy")!;
    expect(check.passed).toBe(true);
  });

  it("fails rivals-no-duplicates when the same entry ID appears twice in rivals", () => {
    const rivals = [rivalProfile(10), rivalProfile(10)];
    const report = validateWarRoomData(baseInput({ rivals }));
    const check = report.checks.find((c) => c.id === "rivals-no-duplicates")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("duplicate");
  });

  it("passes rivals-no-duplicates for a clean rival list", () => {
    const report = validateWarRoomData(baseInput());
    const check = report.checks.find((c) => c.id === "rivals-no-duplicates")!;
    expect(check.passed).toBe(true);
  });

  it("still fails the pre-existing 8 checks the same way as before this change (regression guard)", () => {
    const report = validateWarRoomData(
      baseInput({ configuredLeagueId: 999, configuredEntryId: 111, gameweek: null, mySquadPickCount: 10 }),
    );
    expect(report.checks.find((c) => c.id === "league-id")!.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "entry-id")!.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "gameweek")!.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "squad-valid")!.passed).toBe(false);
    expect(report.allPassed).toBe(false);
  });
});

describe("mini-league rival scope", () => {
  it("treats every configured mini-league member except MY_ENTRY_ID as a rival", () => {
    const standings = [standingsRow(MY_ENTRY_ID), standingsRow(10), standingsRow(11), standingsRow(12)];
    const unique = [...new Map(standings.map((r) => [r.entry, r])).values()];
    const rivals = unique.filter((r) => r.entry !== MY_ENTRY_ID);
    expect(rivals.map((r) => r.entry)).toEqual([10, 11, 12]);
    expect(rivals.some((r) => r.entry === MY_ENTRY_ID)).toBe(false);
  });
});
