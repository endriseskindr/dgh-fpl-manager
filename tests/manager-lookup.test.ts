import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnrichedPlayer, FplPick } from "../lib/types";

function player(id: number, overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: 1,
    teamShort: "T1",
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
    ...overrides,
  };
}

function fplPick(element: number, position: number, isCaptain = false): FplPick {
  return { element, position, multiplier: isCaptain ? 2 : 1, is_captain: isCaptain, is_vice_captain: false };
}

// AsyncStorage-backed cacheGet/cacheSet are exercised through the real
// lib/storage module (it falls back gracefully with no native module in a
// vitest/node environment — every call is wrapped in try/catch there), so
// recent-lookup persistence tests just assert on the returned in-memory
// resolution rather than mocking AsyncStorage directly.

describe("managerLookupService: lookupManagerProfile", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("../lib/fplClient");
  });

  it("assembles a full profile from entry + history + picks", async () => {
    vi.doMock("../lib/fplClient", () => ({
      fpl: {
        entry: vi.fn().mockResolvedValue({
          data: {
            id: 871842,
            player_first_name: "Ada",
            player_last_name: "Lovelace",
            name: "Analytical Engine FC",
            summary_overall_points: 500,
            summary_overall_rank: 12345,
            summary_event_points: 65,
            current_event: 5,
            last_deadline_bank: 5,
            last_deadline_value: 1005,
            last_deadline_total_transfers: 8,
          },
        }),
        history: vi.fn().mockResolvedValue({
          data: {
            current: [{ event: 5, points: 65, total_points: 500, overall_rank: 12345, bank: 5, value: 1005, event_transfers: 1, event_transfers_cost: 0, points_on_bench: 4 }],
            chips: [{ name: "wildcard", event: 4 }],
            past: [{ season_name: "2024/25", total_points: 2100, rank: 50000 }],
          },
        }),
        picks: vi.fn().mockResolvedValue({
          data: { active_chip: null, entry_history: {} as any, picks: [fplPick(1, 1, true)] },
        }),
      },
      FplFetchError: class FplFetchError extends Error {
        constructor(message: string, public path: string, public status?: number) {
          super(message);
        }
      },
    }));
    const { lookupManagerProfile } = await import("../lib/managerLookupService");

    const p1 = player(1);
    const playerIndex = new Map([[1, p1]]);
    const profile = await lookupManagerProfile(871842, playerIndex, null, 5);

    expect(profile.entryId).toBe(871842);
    expect(profile.managerName).toBe("Ada Lovelace");
    expect(profile.teamName).toBe("Analytical Engine FC");
    expect(profile.overallPoints).toBe(500);
    expect(profile.bank).toBe(0.5); // 5 tenths -> 0.5m
    expect(profile.teamValue).toBe(100.5);
    expect(profile.rankHistory).toHaveLength(1);
    expect(profile.rankHistory[0].overallRank).toBe(12345);
    expect(profile.chipsUsed).toEqual([{ name: "wildcard", event: 4 }]);
    expect(profile.pastSeasons[0].seasonName).toBe("2024/25");
    expect(profile.squadFetchFailed).toBe(false);
    expect(profile.currentSquad).toHaveLength(1);
    expect(profile.currentSquad?.[0].isCaptain).toBe(true);
  });

  it("throws a NOT_FOUND ManagerLookupError on a 404 from /entry/", async () => {
    vi.doMock("../lib/fplClient", () => {
      class FplFetchError extends Error {
        status?: number;
        constructor(message: string, public path: string, status?: number) {
          super(message);
          this.status = status;
        }
      }
      return {
        fpl: {
          entry: vi.fn().mockRejectedValue(new FplFetchError("not found", "/entry/999999999/", 404)),
          history: vi.fn(),
          picks: vi.fn(),
        },
        FplFetchError,
      };
    });
    const { lookupManagerProfile, ManagerLookupError } = await import("../lib/managerLookupService");

    await expect(lookupManagerProfile(999999999, new Map(), null, 5)).rejects.toBeInstanceOf(ManagerLookupError);
    try {
      await lookupManagerProfile(999999999, new Map(), null, 5);
    } catch (err) {
      expect((err as InstanceType<typeof ManagerLookupError>).kind).toBe("NOT_FOUND");
    }
  });

  it("rejects invalid entry IDs before making any network call", async () => {
    vi.doMock("../lib/fplClient", () => ({
      fpl: { entry: vi.fn(), history: vi.fn(), picks: vi.fn() },
      FplFetchError: class extends Error {},
    }));
    const { lookupManagerProfile, ManagerLookupError } = await import("../lib/managerLookupService");
    await expect(lookupManagerProfile(-5, new Map(), null, 5)).rejects.toBeInstanceOf(ManagerLookupError);
    await expect(lookupManagerProfile(NaN, new Map(), null, 5)).rejects.toBeInstanceOf(ManagerLookupError);
  });

  it("never fabricates a squad — flags squadFetchFailed when picks fetch fails (private team)", async () => {
    vi.doMock("../lib/fplClient", () => ({
      fpl: {
        entry: vi.fn().mockResolvedValue({
          data: {
            id: 1, player_first_name: "A", player_last_name: "B", name: "T",
            summary_overall_points: 0, summary_overall_rank: 0, summary_event_points: 0,
            current_event: 5, last_deadline_bank: 0, last_deadline_value: 1000, last_deadline_total_transfers: 0,
          },
        }),
        history: vi.fn().mockResolvedValue({ data: { current: [], chips: [], past: [] } }),
        picks: vi.fn().mockRejectedValue(new Error("403 private")),
      },
      FplFetchError: class extends Error {},
    }));
    const { lookupManagerProfile } = await import("../lib/managerLookupService");
    const profile = await lookupManagerProfile(1, new Map(), null, 5);
    expect(profile.squadFetchFailed).toBe(true);
    expect(profile.currentSquad).toBeNull();
  });

  it("degrades gracefully when /history/ fails — returns empty history rather than throwing", async () => {
    vi.doMock("../lib/fplClient", () => ({
      fpl: {
        entry: vi.fn().mockResolvedValue({
          data: {
            id: 1, player_first_name: "A", player_last_name: "B", name: "T",
            summary_overall_points: 0, summary_overall_rank: 0, summary_event_points: 0,
            current_event: 5, last_deadline_bank: 0, last_deadline_value: 1000, last_deadline_total_transfers: 0,
          },
        }),
        history: vi.fn().mockRejectedValue(new Error("network")),
        picks: vi.fn().mockResolvedValue({ data: { active_chip: null, entry_history: {} as any, picks: [] } }),
      },
      FplFetchError: class extends Error {},
    }));
    const { lookupManagerProfile } = await import("../lib/managerLookupService");
    const profile = await lookupManagerProfile(1, new Map(), null, 5);
    expect(profile.rankHistory).toEqual([]);
    expect(profile.chipsUsed).toEqual([]);
    expect(profile.pastSeasons).toEqual([]);
  });
});
