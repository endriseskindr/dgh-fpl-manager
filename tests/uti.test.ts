import { describe, expect, it } from "vitest";
import {
  buildUtiTable,
  buildUtiManagersFromSquads,
  classifyUti,
  computeFtsi,
  computeTts,
  UTI_BANDS,
  type UtiInputManager,
} from "../lib/analytics/uti";
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

function pick(p: EnrichedPlayer, slot: number, multiplier = 1, isCaptain = false, isViceCaptain = false): SquadPick {
  return { playerId: p.id, player: p, slot, isXI: slot <= 11, isBench: slot > 11, benchOrder: slot > 11 ? slot - 11 : null, multiplier, isCaptain, isViceCaptain, livePoints: 0 };
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

// Minimal 11-man XI + 4 bench, all sharing the same position layout so
// jaccard/position-alignment math is easy to hand-verify.
function buildSquad(ids: number[], ownership: Record<number, number> = {}, captainId?: number, viceCaptainId?: number): SquadPick[] {
  const positions: EnrichedPlayer["position"][] = ["GKP", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "GKP", "DEF", "MID"];
  return ids.map((id, i) =>
    pick(
      player(id, positions[i] ?? "MID", { ownershipPct: ownership[id] ?? 50 }),
      i + 1,
      1,
      id === captainId,
      id === viceCaptainId,
    ),
  );
}

function manager(entryId: number, ids: number[], overrides: Partial<UtiInputManager> = {}): UtiInputManager {
  const positionByPlayerId: Record<number, string> = {};
  const ownershipPctByPlayerId: Record<number, number> = {};
  const positions = ["GKP", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "GKP", "DEF", "MID"];
  ids.forEach((id, i) => {
    positionByPlayerId[id] = positions[i] ?? "MID";
    ownershipPctByPlayerId[id] = 50;
  });
  return {
    entryId,
    managerName: `M${entryId}`,
    teamName: `T${entryId}`,
    isMe: false,
    squadIds: ids,
    xiIds: ids.slice(0, 11),
    positionByPlayerId,
    ownershipPctByPlayerId,
    captainId: ids[0] ?? null,
    viceCaptainId: ids[1] ?? null,
    formation: "4-4-2",
    ...overrides,
  };
}

describe("classifyUti — grading bands (item 148)", () => {
  it("assigns Identical above 50", () => {
    expect(classifyUti(51).key).toBe("IDENTICAL");
    expect(classifyUti(50.1).key).toBe("IDENTICAL");
  });
  it("assigns Very Similar 45-50 inclusive", () => {
    expect(classifyUti(50).key).toBe("VERY_SIMILAR");
    expect(classifyUti(45).key).toBe("VERY_SIMILAR");
  });
  it("assigns Similar 40-44", () => {
    expect(classifyUti(44).key).toBe("SIMILAR");
    expect(classifyUti(40).key).toBe("SIMILAR");
  });
  it("assigns Balanced 35-39", () => {
    expect(classifyUti(39).key).toBe("BALANCED");
    expect(classifyUti(35).key).toBe("BALANCED");
  });
  it("assigns Differential 30-34", () => {
    expect(classifyUti(34).key).toBe("DIFFERENTIAL");
    expect(classifyUti(30).key).toBe("DIFFERENTIAL");
  });
  it("assigns Rebel 25-29", () => {
    expect(classifyUti(29).key).toBe("REBEL");
    expect(classifyUti(25).key).toBe("REBEL");
  });
  it("assigns Chaos below 25", () => {
    expect(classifyUti(24.9).key).toBe("CHAOS");
    expect(classifyUti(0).key).toBe("CHAOS");
  });
  it("covers every band with no gaps across the 0-100 range", () => {
    expect(UTI_BANDS.length).toBe(7);
    for (let v = 0; v <= 100; v += 0.5) {
      expect(() => classifyUti(v)).not.toThrow();
      expect(classifyUti(v)).toBeDefined();
    }
  });
});

describe("computeFtsi — pairwise similarity (item 146)", () => {
  it("scores two identical squads with identical captain/formation at exactly 100", () => {
    const ids = Array.from({ length: 15 }, (_, i) => i + 1);
    const a = manager(1, ids, { captainId: 1, viceCaptainId: 2, formation: "4-4-2" });
    const b = manager(2, ids, { captainId: 1, viceCaptainId: 2, formation: "4-4-2" });
    expect(computeFtsi(a, b)).toBe(100);
  });

  it("scores two completely disjoint squads at 0", () => {
    const a = manager(1, Array.from({ length: 15 }, (_, i) => i + 1), { captainId: 1, viceCaptainId: 2 });
    const b = manager(2, Array.from({ length: 15 }, (_, i) => i + 101), { captainId: 101, viceCaptainId: 102, formation: "3-5-2" });
    expect(computeFtsi(a, b)).toBe(0);
  });

  it("gives partial credit for a shared captain-candidate (captain vs vice)", () => {
    const idsA = Array.from({ length: 15 }, (_, i) => i + 1);
    const idsB = Array.from({ length: 15 }, (_, i) => i + 101);
    // Give B player #1 (A's captain) as B's vice-captain, everything else disjoint.
    const bIds = [1, ...idsB.slice(1)];
    const a = manager(1, idsA, { captainId: 1, viceCaptainId: 2 });
    const b = manager(2, bIds, { captainId: 101, viceCaptainId: 1 });
    const ftsi = computeFtsi(a, b);
    expect(ftsi).toBeGreaterThan(0); // captain-candidate + tiny overlap credit
  });

  it("is not necessarily symmetric due to the ownership-weighted OCS term using the caller's own ownership map", () => {
    const idsA = Array.from({ length: 15 }, (_, i) => i + 1);
    const idsB = [...idsA.slice(0, 8), 201, 202, 203, 204, 205, 206, 207];
    const a = manager(1, idsA, { ownershipPctByPlayerId: Object.fromEntries(idsA.map((id) => [id, 10])) });
    const b = manager(2, idsB, { ownershipPctByPlayerId: Object.fromEntries(idsB.map((id) => [id, 90])) });
    // Both directions should at least compute without throwing and stay in [0,100].
    const ab = computeFtsi(a, b);
    const ba = computeFtsi(b, a);
    expect(ab).toBeGreaterThanOrEqual(0);
    expect(ab).toBeLessThanOrEqual(100);
    expect(ba).toBeGreaterThanOrEqual(0);
    expect(ba).toBeLessThanOrEqual(100);
  });
});

describe("computeTts — template similarity (item 146)", () => {
  it("scores a manager identical to the sole other manager (i.e. the template) near 100", () => {
    const ids = Array.from({ length: 15 }, (_, i) => i + 1);
    const a = manager(1, ids, { captainId: 1, formation: "4-4-2" });
    const template = { squadIds: ids, xiIds: ids.slice(0, 11), positionByPlayerId: a.positionByPlayerId, formation: "4-4-2" };
    const tts = computeTts(a, template);
    expect(tts.j15).toBe(100);
    expect(tts.jXi).toBe(100);
    expect(tts.tts).toBeGreaterThan(90);
  });
});

describe("buildUtiTable — full pipeline (items 145, 147, 148)", () => {
  it("returns an empty table for zero managers", () => {
    expect(buildUtiTable([])).toEqual([]);
  });

  it("ranks a manager identical to everyone else above a fully differential manager", () => {
    const templateIds = Array.from({ length: 15 }, (_, i) => i + 1);
    const identicalA = manager(1, templateIds, { isMe: true, captainId: 1, formation: "4-4-2" });
    const identicalB = manager(2, templateIds, { captainId: 1, formation: "4-4-2" });
    const identicalC = manager(3, templateIds, { captainId: 1, formation: "4-4-2" });
    const differential = manager(4, Array.from({ length: 15 }, (_, i) => i + 501), { captainId: 501, formation: "3-5-2" });

    const table = buildUtiTable([identicalA, identicalB, identicalC, differential]);
    expect(table.length).toBe(4);
    const diffRow = table.find((r) => r.entryId === 4)!;
    const identicalRow = table.find((r) => r.entryId === 1)!;
    expect(identicalRow.uti).toBeGreaterThan(diffRow.uti);
    expect(identicalRow.band.key).not.toBe("CHAOS");
    // Every avgFtsi should be the mean of that manager's individual FTSI rows.
    expect(identicalRow.ftsiByRival.length).toBe(3);
    const expectedAvg = Math.round((identicalRow.ftsiByRival.reduce((s, r) => s + r.ftsi, 0) / 3) * 10) / 10;
    expect(identicalRow.avgFtsi).toBe(expectedAvg);
  });

  it("sorts rows by descending UTI", () => {
    const templateIds = Array.from({ length: 15 }, (_, i) => i + 1);
    const a = manager(1, templateIds, { captainId: 1, formation: "4-4-2" });
    const b = manager(2, templateIds, { captainId: 1, formation: "4-4-2" });
    const c = manager(3, Array.from({ length: 15 }, (_, i) => i + 901), { captainId: 901, formation: "5-3-2" });
    const table = buildUtiTable([c, a, b]);
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1].uti).toBeGreaterThanOrEqual(table[i].uti);
    }
  });

  it("computes UTI as exactly 0.6*TTS + 0.4*avgFtsi (item 145 formula)", () => {
    const templateIds = Array.from({ length: 15 }, (_, i) => i + 1);
    const a = manager(1, templateIds, { captainId: 1, formation: "4-4-2" });
    const b = manager(2, templateIds, { captainId: 1, formation: "4-4-2" });
    const c = manager(3, Array.from({ length: 15 }, (_, i) => i + 701), { captainId: 701, formation: "3-4-3" });
    const table = buildUtiTable([a, b, c]);
    const row = table.find((r) => r.entryId === 1)!;
    const expected = Math.round((0.6 * row.tts.tts + 0.4 * row.avgFtsi) * 10) / 10;
    expect(row.uti).toBe(expected);
  });
});

describe("buildUtiManagersFromSquads — adapter from SquadPick/RivalProfile (item 145 wiring)", () => {
  it("includes me and every rival with a verified squad, skipping unverified ones", () => {
    const p1 = player(1, "GKP");
    const p2 = player(2, "DEF");
    const mySquad = [pick(p1, 1, 1, true), pick(p2, 2, 1, false, true)];
    const verifiedRival = rival(10, [pick(p1, 1, 1), pick(p2, 2, 1)]);
    const unverifiedRival = rival(11, null);

    const managers = buildUtiManagersFromSquads(1, "Me", "My Team", mySquad, [verifiedRival, unverifiedRival]);
    expect(managers.length).toBe(2); // me + verifiedRival only
    expect(managers.find((m) => m.entryId === 1)?.isMe).toBe(true);
    expect(managers.find((m) => m.entryId === 11)).toBeUndefined();
  });

  it("derives captain/vice-captain and formation from the squad's isCaptain/isXI flags", () => {
    const gk = player(1, "GKP");
    const def = player(2, "DEF");
    const mid = player(3, "MID");
    const squad = [pick(gk, 1, 1, false, false), pick(def, 2, 1, true, false), pick(mid, 3, 2, false, true)];
    const managers = buildUtiManagersFromSquads(1, "Me", "My Team", squad, []);
    const me = managers[0];
    expect(me.captainId).toBe(2);
    expect(me.viceCaptainId).toBe(3);
    expect(me.xiIds.sort()).toEqual([1, 2, 3]);
    expect(me.formation).toBe("1-1-0"); // DEF-MID-FWD counts among the 3 XI picks
  });
});
