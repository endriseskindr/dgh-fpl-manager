import { describe, expect, it } from "vitest";
import { buildOwnershipMap } from "../lib/analytics/ownership";
import { buildMiniLeagueTemplate, computeTemplateSimilarity } from "../lib/analytics/miniLeagueTemplate";
import { computeTransferTes, differentialWeight } from "../lib/analytics/tes";
import type { EnrichedPlayer, RivalProfile, SquadPick } from "../lib/types";

function player(id: number, position: EnrichedPlayer["position"], overrides: Partial<EnrichedPlayer> = {}): EnrichedPlayer {
  return {
    id,
    webName: `P${id}`,
    fullName: `Player ${id}`,
    teamId: id,
    teamShort: `T${id}`,
    position,
    price: 5,
    form: 4,
    pointsPerGame: 4,
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
    epNext: 4,
    transfersInEvent: 0,
    transfersOutEvent: 0,
    priceChangeEvent: 0,
    starts: 10,
    setPieces: { corners: false, freeKicks: false, penalties: false },
    ...overrides,
  };
}

function pick(p: EnrichedPlayer, slot: number, multiplier = 1, isCaptain = false): SquadPick {
  return { playerId: p.id, player: p, slot, isXI: slot <= 11, isBench: slot > 11, benchOrder: slot > 11 ? slot - 11 : null, multiplier, isCaptain, isViceCaptain: false, livePoints: 0 };
}

function rival(entryId: number, squad: SquadPick[] | null): RivalProfile {
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

describe("buildOwnershipMap — Effective Ownership (issue #26)", () => {
  it("computes true EO from multipliers when every rival squad is verified (STRICT)", () => {
    const gk = player(1, "GKP");
    const captainedByMe = player(2, "MID");
    // I own captainedByMe (multiplier 2). One of two rivals owns it starting
    // (multiplier 1), the other doesn't own it at all.
    const mySquad = [pick(gk, 1, 1), pick(captainedByMe, 2, 2, true)];
    const rivalWithIt = rival(10, [pick(gk, 1, 1), pick(captainedByMe, 2, 1)]);
    const rivalWithoutIt = rival(11, [pick(gk, 1, 1), pick(player(3, "MID"), 2, 1)]);

    const rows = buildOwnershipMap(1, mySquad, [rivalWithIt, rivalWithoutIt], [gk, captainedByMe, player(3, "MID")]);
    const row = rows.find((r) => r.playerId === captainedByMe.id)!;

    expect(row.labelConfidence).toBe("STRICT");
    // verifiedManagerCount = 3 (me + 2 rivals). Multiplier sum = 2 (me) + 1 (rival) + 0 = 3.
    // EO = 3 / (3 * 2) * 100 = 50%.
    expect(row.effectiveOwnershipPct).toBe(50);
    expect(row.rivalOwners.find((o) => o.entryId === 10)?.multiplier).toBe(1);
  });

  it("returns null EO (never a fabricated number) when a rival squad fetch failed (FALLBACK)", () => {
    const gk = player(1, "GKP");
    const mySquad = [pick(gk, 1, 1)];
    const rows = buildOwnershipMap(1, mySquad, [rival(10, [pick(gk, 1, 1)]), rival(11, null)], [gk]);
    const row = rows.find((r) => r.playerId === gk.id)!;
    expect(row.labelConfidence).toBe("FALLBACK");
    expect(row.effectiveOwnershipPct).toBeNull();
  });
});

describe("buildMiniLeagueTemplate + computeTemplateSimilarity (mini-league template feature)", () => {
  it("builds the most-owned legal XI and scores each manager's overlap with it", () => {
    const gk = player(1, "GKP");
    const def1 = player(2, "DEF");
    const def2 = player(3, "DEF");
    const def3 = player(4, "DEF");
    const differential = player(5, "DEF"); // only I own this one

    // Minimal 4-a-side "squad" shape is fine here — buildMiniLeagueTemplate only
    // counts ownership per player, it doesn't require a full legal 15.
    const mySquad = [pick(gk, 1), pick(def1, 2), pick(def2, 3), pick(differential, 4)];
    const rivalA = rival(10, [pick(gk, 1), pick(def1, 2), pick(def2, 3), pick(def3, 4)]);
    const rivalB = rival(11, [pick(gk, 1), pick(def1, 2), pick(def3, 3)]);

    const template = buildMiniLeagueTemplate(mySquad, [rivalA, rivalB]);
    expect(template.verifiedManagerCount).toBe(3);

    const gkEntry = template.fullTemplateSquad.find((p) => p.playerId === gk.id)!;
    expect(gkEntry.ownerCount).toBe(3);
    expect(gkEntry.ownershipPct).toBe(100);

    const similarity = computeTemplateSimilarity(template, 1, "Me", "My FC", mySquad, [rivalA, rivalB]);
    const me = similarity.find((s) => s.isMe)!;
    const a = similarity.find((s) => s.entryId === 10)!;
    // Rival A owns every template player it was given (gk, def1, def2 at least);
    // I additionally own a differential the template doesn't reward.
    expect(a.squadOverlapCount).toBeGreaterThanOrEqual(me.squadOverlapCount);
    expect(similarity).toHaveLength(3);
  });

  it("never fabricates a similarity score for an unverified rival squad", () => {
    const gk = player(1, "GKP");
    const mySquad = [pick(gk, 1)];
    const verifiedRival = rival(10, [pick(gk, 1)]);
    const unverifiedRival = rival(11, null);
    const template = buildMiniLeagueTemplate(mySquad, [verifiedRival, unverifiedRival]);
    const similarity = computeTemplateSimilarity(template, 1, "Me", "My FC", mySquad, [verifiedRival, unverifiedRival]);
    expect(similarity.some((s) => s.entryId === 11)).toBe(false);
    expect(similarity).toHaveLength(2); // me + verifiedRival only
  });
});

describe("Transfer Effectiveness Score (tes.ts)", () => {
  it("applies the correct differential-weight band by mini-league ownership", () => {
    expect(differentialWeight(10)).toBe(1.5);
    expect(differentialWeight(20)).toBe(1.2);
    expect(differentialWeight(40)).toBe(1.2);
    expect(differentialWeight(41)).toBe(1.0);
    expect(differentialWeight(60)).toBe(1.0);
    expect(differentialWeight(61)).toBe(0.8);
  });

  it("computes TES = (pointsIn - pointsOut - 4) * weight over the finished-events window", () => {
    const pointsByElement = new Map([
      [100, new Map([[1, 6], [2, 10]])], // player 100 (in): 6 + 10 = 16 across GW1-2
      [200, new Map([[1, 2], [2, 1]])], // player 200 (out): 2 + 1 = 3
    ]);
    const result = computeTransferTes({
      transfers: [{ element_in: 100, element_out: 200, event: 1 }],
      latestFinishedEvent: 2,
      pointsByElement,
      webNameByElement: new Map([[100, "InGuy"], [200, "OutGuy"]]),
      miniOwnershipByElement: new Map([[100, 15]]), // <20% -> 1.5x
    });
    expect(result).toHaveLength(1);
    // (16 - 3 - 4) * 1.5 = 13.5
    expect(result[0].tes).toBe(13.5);
    expect(result[0].differentialWeight).toBe(1.5);
  });

  it("excludes transfers made in a gameweek that has not finished yet", () => {
    const result = computeTransferTes({
      transfers: [{ element_in: 1, element_out: 2, event: 5 }],
      latestFinishedEvent: 4,
      pointsByElement: new Map(),
      webNameByElement: new Map(),
      miniOwnershipByElement: new Map(),
    });
    expect(result).toHaveLength(0);
  });

  it("treats a missing player history as 0 points rather than throwing", () => {
    const result = computeTransferTes({
      transfers: [{ element_in: 100, element_out: 200, event: 1 }],
      latestFinishedEvent: 1,
      pointsByElement: new Map(), // neither element's history loaded
      webNameByElement: new Map(),
      miniOwnershipByElement: new Map(),
    });
    // (0 - 0 - 4) * 1.0 (default 50% ownership band) = -4
    expect(result[0].tes).toBe(-4);
    expect(result[0].webNameIn).toBe("#100");
  });
});
