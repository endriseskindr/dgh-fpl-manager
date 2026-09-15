import { describe, expect, it } from "vitest";
import { getPlayingStatus, summarizeSquadPlayingStatus } from "../lib/analytics/liveStatus";
import type { EnrichedPlayer, FplFixture, SquadPick } from "../lib/types";

function player(id: number, teamId: number): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId,
    teamShort: `T${teamId}`,
    position: "MID",
    price: 5,
    form: 3,
    pointsPerGame: 3,
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
    epNext: 3,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
  };
}

function pick(teamId: number, liveMinutes: number, overrides: Partial<SquadPick> = {}): SquadPick {
  return {
    playerId: teamId,
    player: player(teamId, teamId),
    slot: 1,
    isXI: true,
    isBench: false,
    benchOrder: null,
    multiplier: 1,
    isCaptain: false,
    isViceCaptain: false,
    livePoints: 0,
    liveMinutes,
    ...overrides,
  };
}

function fixture(overrides: Partial<FplFixture>): FplFixture {
  return {
    id: 1,
    event: 5,
    team_h: 1,
    team_a: 2,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    kickoff_time: "2026-01-01T15:00:00Z",
    finished: false,
    started: false,
    team_h_score: null,
    team_a_score: null,
    ...overrides,
  };
}

describe("getPlayingStatus", () => {
  it("returns no_fixture when the player's club has no fixture this GW", () => {
    const p = pick(1, 0);
    expect(getPlayingStatus(p, [fixture({ team_h: 3, team_a: 4 })], 5)).toBe("no_fixture");
  });

  it("returns not_started before kickoff", () => {
    const p = pick(1, 0);
    expect(getPlayingStatus(p, [fixture({ started: false, finished: false })], 5)).toBe("not_started");
  });

  it("returns live when the fixture is underway and the player has minutes", () => {
    const p = pick(1, 34);
    expect(getPlayingStatus(p, [fixture({ started: true, finished: false })], 5)).toBe("live");
  });

  it("returns not_started when the fixture is underway but the player hasn't come on", () => {
    const p = pick(1, 0);
    expect(getPlayingStatus(p, [fixture({ started: true, finished: false })], 5)).toBe("not_started");
  });

  it("returns subbed_off when the fixture finished with fewer than a full 90 minutes", () => {
    const p = pick(1, 63);
    expect(getPlayingStatus(p, [fixture({ started: true, finished: true })], 5)).toBe("subbed_off");
  });

  it("returns finished when the fixture finished with a full 90 minutes", () => {
    const p = pick(1, 90);
    expect(getPlayingStatus(p, [fixture({ started: true, finished: true })], 5)).toBe("finished");
  });

  it("returns finished (didn't feature) when the fixture finished with 0 minutes", () => {
    const p = pick(1, 0);
    expect(getPlayingStatus(p, [fixture({ started: true, finished: true })], 5)).toBe("finished");
  });

  it("handles a double gameweek by requiring a full 90 per fixture before calling it finished-not-subbed", () => {
    const p = pick(1, 150); // 90 + 60 across two fixtures
    const fixtures = [
      fixture({ id: 1, started: true, finished: true }),
      fixture({ id: 2, started: true, finished: true, team_h: 1, team_a: 5 }),
    ];
    expect(getPlayingStatus(p, fixtures, 5)).toBe("subbed_off");
  });

  it("summarizeSquadPlayingStatus tallies counts across a squad", () => {
    const fixtures = [fixture({ started: true, finished: false })];
    const squad = [pick(1, 45), pick(1, 0)];
    const counts = summarizeSquadPlayingStatus(squad, fixtures, 5);
    expect(counts.live).toBe(1);
    expect(counts.not_started).toBe(1);
  });
});
