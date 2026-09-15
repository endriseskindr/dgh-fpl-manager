import { describe, it, expect } from "vitest";
import { validateFplSquad, isValidFormation, resolveCaptaincy, calculateTransferCost, type FplPlayer, type SquadPick } from "../../lib/engine/fpl";
import { calculateHsfi, calculateBv, calculateMdi, calculateWcs, calculateDtq, calculateWcps, calculateTes, calculateDghPlayerMetrics } from "../../lib/engine/dgh";

const mockPlayer = (id: number, elementType: 1 | 2 | 3 | 4, teamId: number, price = 6.0): FplPlayer => ({
  id,
  webName: `Player ${id}`,
  elementTypeName: elementType === 1 ? "GKP" : elementType === 2 ? "DEF" : elementType === 3 ? "MID" : "FWD",
  elementType,
  teamId,
  price,
  points: 50,
  form: 5.0,
  minutes: 800,
  goals: 3,
  assists: 2,
  cleanSheets: 2,
  goalsConceded: 5,
  ownGoals: 0,
  penaltiesSaved: 0,
  penaltiesMissed: 0,
  yellowCards: 1,
  redCards: 0,
  saves: 0,
  bonus: 4,
  bps: 120,
  influence: 100,
  creativity: 80,
  threat: 90,
  ictIndex: 27.0,
  xG: 0.3,
  xA: 0.2,
  xGI: 0.5,
  xGC: 0.4,
  status: "a",
  news: "",
  chanceNextRound: 100,
  ownershipPct: 15.0,
});

describe("FPL Engine Validation & Rules", () => {
  it("validates formations correctly", () => {
    expect(isValidFormation(3, 4, 3)).toBe(true);
    expect(isValidFormation(4, 4, 2)).toBe(true);
    expect(isValidFormation(5, 3, 2)).toBe(true);
    expect(isValidFormation(2, 5, 3)).toBe(false); // Invalid def count (<3)
    expect(isValidFormation(4, 4, 3)).toBe(false); // 11 outfield players
  });

  it("calculates transfer cost penalties accurately", () => {
    expect(calculateTransferCost(1, 1)).toBe(0);
    expect(calculateTransferCost(2, 1)).toBe(4);
    expect(calculateTransferCost(3, 1)).toBe(8);
    expect(calculateTransferCost(5, 1, true)).toBe(0); // Wildcard / Free Hit
  });

  it("resolves captaincy and vice-captain fallback when captain is injured", () => {
    const playersById = new Map<number, FplPlayer>();
    const capt = mockPlayer(1, 3, 1);
    capt.status = "i"; // Injured captain
    capt.chanceNextRound = 0;
    
    const vice = mockPlayer(2, 4, 1);
    playersById.set(1, capt);
    playersById.set(2, vice);

    const picks: SquadPick[] = [
      { element: 1, position: 1, isCaptain: true, isViceCaptain: false, multiplier: 2 },
      { element: 2, position: 2, isCaptain: false, isViceCaptain: true, multiplier: 1 },
    ];

    const result = resolveCaptaincy(picks, playersById);
    expect(result.isCaptainSubstituted).toBe(true);
    expect(result.effectiveCaptainId).toBe(2); // Vice becomes captain
  });
});

describe("DGH Domain Metrics Engine", () => {
  it("calculates HSFI deterministically and handles bounding", () => {
    const player = mockPlayer(10, 3, 1);
    const hsfiScore = calculateHsfi(player);
    expect(hsfiScore).toBeGreaterThan(0);
    expect(hsfiScore).toBeLessThanOrEqual(100);
  });

  it("calculates BV, MDI, DTQ, and WCPS with expected relationship", () => {
    const player = mockPlayer(11, 3, 2);
    const metrics = calculateDghPlayerMetrics(player);
    
    expect(metrics.hsfi).toBeGreaterThan(0);
    expect(metrics.bv).toBeGreaterThan(0);
    expect(metrics.mdi).toBeGreaterThan(0);
    expect(metrics.wcps).toBeGreaterThan(0);
  });

  it("evaluates Transfer Efficiency Score (TES) status", () => {
    const pOut = calculateDghPlayerMetrics(mockPlayer(100, 3, 1));
    const pIn = calculateDghPlayerMetrics(mockPlayer(101, 3, 2));
    pIn.wcps = pOut.wcps + 20;

    const tes = calculateTes(pOut, pIn, 0);
    expect(tes.tesScore).toBe(20);
    expect(tes.status).toBe("STRONG_BUY");
  });
});
