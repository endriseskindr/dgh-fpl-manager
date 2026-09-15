import { describe, expect, it } from "vitest";
import { applyPlayerFilters, EMPTY_FILTERS, hasActiveFilters, type PlayerFilters } from "../lib/filtersStore";
import type { EnrichedPlayer } from "../lib/types";

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

const pool: EnrichedPlayer[] = [
  player(1, { webName: "Salah", fullName: "Mohamed Salah", teamId: 11, teamShort: "LIV", position: "MID", price: 13.0, totalPoints: 180, status: "a" }),
  player(2, { webName: "Haaland", fullName: "Erling Haaland", teamId: 12, teamShort: "MCI", position: "FWD", price: 15.0, totalPoints: 220, status: "a" }),
  player(3, { webName: "Saka", fullName: "Bukayo Saka", teamId: 13, teamShort: "ARS", position: "MID", price: 9.0, totalPoints: 150, status: "d" }),
  player(4, { webName: "Van Dijk", fullName: "Virgil van Dijk", teamId: 11, teamShort: "LIV", position: "DEF", price: 6.0, totalPoints: 110, status: "a" }),
];

describe("applyPlayerFilters", () => {
  it("returns every player when no filter is set", () => {
    expect(applyPlayerFilters(pool, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("matches search against both web name and full name, case-insensitively", () => {
    expect(applyPlayerFilters(pool, { ...EMPTY_FILTERS, search: "salah" }).map((p) => p.id)).toEqual([1]);
    expect(applyPlayerFilters(pool, { ...EMPTY_FILTERS, search: "van dijk" }).map((p) => p.id)).toEqual([4]);
  });

  it("filters by one or more positions", () => {
    const midOnly = applyPlayerFilters(pool, { ...EMPTY_FILTERS, positions: ["MID"] });
    expect(midOnly.map((p) => p.id).sort()).toEqual([1, 3]);

    const midOrFwd = applyPlayerFilters(pool, { ...EMPTY_FILTERS, positions: ["MID", "FWD"] });
    expect(midOrFwd.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it("filters by club id", () => {
    const liv = applyPlayerFilters(pool, { ...EMPTY_FILTERS, clubIds: [11] });
    expect(liv.map((p) => p.id).sort()).toEqual([1, 4]);
  });

  it("applies inclusive min/max price range", () => {
    const midPriced = applyPlayerFilters(pool, { ...EMPTY_FILTERS, minPrice: 8, maxPrice: 13 });
    expect(midPriced.map((p) => p.id).sort()).toEqual([1, 3]);
  });

  it("applies inclusive min/max points range", () => {
    const highScorers = applyPlayerFilters(pool, { ...EMPTY_FILTERS, minPoints: 150 });
    expect(highScorers.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });

  it("excludes unavailable players when availableOnly is set", () => {
    const available = applyPlayerFilters(pool, { ...EMPTY_FILTERS, availableOnly: true });
    expect(available.map((p) => p.id).sort()).toEqual([1, 2, 4]);
  });

  it("combines multiple criteria with AND semantics", () => {
    const result = applyPlayerFilters(pool, {
      ...EMPTY_FILTERS,
      positions: ["MID"],
      minPrice: 10,
      availableOnly: true,
    });
    expect(result.map((p) => p.id)).toEqual([1]); // Saka fails availableOnly, Van Dijk fails position, Haaland fails position
  });

  it("returns an empty array when no player satisfies every criterion", () => {
    expect(applyPlayerFilters(pool, { ...EMPTY_FILTERS, positions: ["GKP"] })).toEqual([]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty filter set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true when any single field diverges from default", () => {
    const cases: Partial<PlayerFilters>[] = [
      { search: "x" },
      { positions: ["DEF"] },
      { clubIds: [1] },
      { minPrice: 5 },
      { maxPrice: 5 },
      { minPoints: 5 },
      { maxPoints: 5 },
      { availableOnly: true },
    ];
    for (const patch of cases) {
      expect(hasActiveFilters({ ...EMPTY_FILTERS, ...patch })).toBe(true);
    }
  });

  it("ignores whitespace-only search", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "   " })).toBe(false);
  });
});
