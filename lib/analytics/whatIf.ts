import type { EnrichedPlayer, RivalProfile, SquadPick } from "../types";
import type { ManagerSeasonRow } from "./comprehensiveTable";
import { gwAdjustedPoints } from "./comprehensiveTable";
import { optimizeXI } from "./xiOptimizer";
import { projectNextGw } from "./projection";
import { DGH_RULES } from "../config";

/**
 * "What If" simulator — the ultimate goal is answering questions like
 * "what if I sold Player X and bought Player Y" (or changed captain, or
 * played a chip) BEFORE committing, seeing the projected effect on:
 *   1. This GW's projected points (via the same projection engine used
 *      everywhere else in the app — no separate/inconsistent math)
 *   2. GW Adjusted points under the DGH formula (accounting for the hit cost
 *      of any extra transfers beyond free transfers)
 *   3. Projected rank shift in the DGH Comprehensive Table against rivals
 *
 * This module does not fetch anything — it's pure simulation over data the
 * caller already has (mySquad, playerPool, rivals, current comprehensive table).
 */

export type WhatIfMove = { outPlayerId: number; inPlayerId: number };

export type WhatIfChipChoice = "none" | "bboost" | "3xc" | "wildcard" | "freehit";

export type WhatIfInput = {
  currentSquad: SquadPick[];
  playerPool: EnrichedPlayer[];
  bank: number;
  freeTransfers: number;
  moves: WhatIfMove[];
  captainOverridePlayerId?: number | null;
  chip?: WhatIfChipChoice;
};

export type WhatIfResult = {
  valid: boolean;
  error: string | null;
  moves: { outName: string; inName: string; outProjected: number; inProjected: number; delta: number; valid: boolean; error?: string }[];
  transferNetDelta: number; // combined projected GW gain/loss across all requested transfers before hits/chips
  transfersMade: number;
  freeTransfersUsed: number;
  paidTransfers: number;
  transferHits: number; // points cost, e.g. 0, 4, 8...
  baselineGwProjected: number; // current squad, no changes
  scenarioRawProjected: number; // projected raw GW points after changes, before hits/BB/TC deductions
  bbBenchPoints: number;
  tcExtraPoints: number;
  scenarioGwAdjusted: number; // final DGH-formula projected GW Adjusted
  netSwing: number; // scenarioGwAdjusted - baseline GW Adjusted (baseline has 0 hits/BB/TC assumed)
  bankAfter: number;
  netBankChange: number; // combined cash movement across the full transfer package; positive means more bank
  newCaptainName: string | null;
  formation: string;
};

function findPlayer(pool: EnrichedPlayer[], squad: SquadPick[], id: number): EnrichedPlayer | null {
  return squad.find((p) => p.playerId === id)?.player ?? pool.find((p) => p.id === id) ?? null;
}

/**
 * Simulates a hypothetical set of transfers (+ optional captain override and
 * chip choice) against the DGH GW Adjusted formula, using the same
 * projection model (`projectNextGw`) as the rest of the app so numbers stay
 * consistent with the Transfers tab and War Room.
 */
export function simulateWhatIf(input: WhatIfInput): WhatIfResult {
  const { currentSquad, playerPool, bank, freeTransfers, moves, captainOverridePlayerId, chip = "none" } = input;

  const baselineXI = optimizeXI(currentSquad);
  const baselineCaptainProjected = baselineXI.captain ? projectNextGw(baselineXI.captain.pick.player) : 0;
  const baselineGwProjected = baselineXI.startingXI.reduce((s, p) => s + projectNextGw(p.player), 0) + baselineCaptainProjected;

  if (!moves.length && chip === "none" && !captainOverridePlayerId) {
    return {
      valid: true,
      error: null,
      moves: [],
      transfersMade: 0,
      freeTransfersUsed: 0,
      paidTransfers: 0,
      transferHits: 0,
      baselineGwProjected: Math.round(baselineGwProjected * 10) / 10,
      scenarioRawProjected: Math.round(baselineGwProjected * 10) / 10,
      bbBenchPoints: 0,
      tcExtraPoints: 0,
      scenarioGwAdjusted: Math.round(baselineGwProjected * 10) / 10,
      netSwing: 0,
      transferNetDelta: 0,
      bankAfter: bank,
      netBankChange: 0,
      newCaptainName: baselineXI.captain?.pick.player.webName ?? null,
      formation: baselineXI.formation,
    };
  }

  // Apply hypothetical squad swaps.
  let workingSquad: SquadPick[] = [...currentSquad];
  let workingBank = bank;
  const moveDetails: WhatIfResult["moves"] = [];
  let error: string | null = null;

  for (const move of moves) {
    const outPick = workingSquad.find((p) => p.playerId === move.outPlayerId);
    const inPlayer = findPlayer(playerPool, workingSquad, move.inPlayerId);
    const outName = outPick?.player.webName ?? `Player #${move.outPlayerId}`;
    const inName = inPlayer?.webName ?? `Player #${move.inPlayerId}`;
    let moveError: string | null = null;
    if (!outPick) moveError = `Player to sell (id ${move.outPlayerId}) not found in current squad.`;
    else if (!inPlayer) moveError = `Player to buy (id ${move.inPlayerId}) not found in player pool.`;
    else if (outPick.player.position !== inPlayer.position) moveError = `${outPick.player.webName} (${outPick.player.position}) and ${inPlayer.position} are different positions — not a legal swap.`;
    else if (workingSquad.some((p) => p.playerId === inPlayer.id)) moveError = `${inPlayer.webName} is already in your squad.`;
    else {
      const teamCount = workingSquad.filter((p) => p.player.teamId === inPlayer.teamId && p.playerId !== outPick.playerId).length;
      if (teamCount >= 3) moveError = `Adding ${inPlayer.webName} would exceed the 3-per-club limit.`;
      else {
        const costDelta = inPlayer.price - (outPick.sellingPrice ?? outPick.player.price);
        if (costDelta > workingBank + 1e-9) moveError = `Not enough bank: need ${costDelta.toFixed(1)}, have ${workingBank.toFixed(1)}.`;
      }
    }

    if (moveError || !outPick || !inPlayer) {
      error ??= moveError ?? "Invalid transfer.";
      moveDetails.push({ outName, inName, outProjected: outPick ? projectNextGw(outPick.player) : 0, inProjected: inPlayer ? projectNextGw(inPlayer) : 0, delta: 0, valid: false, error: moveError ?? "Invalid transfer." });
      continue;
    }

    const costDelta = inPlayer.price - (outPick.sellingPrice ?? outPick.player.price);
    workingBank = Math.round((workingBank - costDelta) * 10) / 10;
    const outProjected = projectNextGw(outPick.player);
    const inProjected = projectNextGw(inPlayer);
    const delta = Math.round((inProjected - outProjected) * 10) / 10;
    moveDetails.push({ outName, inName, outProjected, inProjected, delta, valid: true });

    workingSquad = workingSquad.map((p) =>
      p.playerId === outPick.playerId
        ? { ...p, playerId: inPlayer.id, player: inPlayer, isCaptain: false, isViceCaptain: false, multiplier: p.multiplier, livePoints: 0 }
        : p,
    );
  }
  const transferNetDelta = Math.round(moveDetails.filter((m) => m.valid).reduce((sum, m) => sum + m.delta, 0) * 10) / 10;

  if (error) {
    return {
      valid: false,
      error,
      moves: moveDetails,
      transfersMade: moves.length,
      freeTransfersUsed: 0,
      paidTransfers: 0,
      transferHits: 0,
      baselineGwProjected: Math.round(baselineGwProjected * 10) / 10,
      scenarioRawProjected: Math.round((baselineGwProjected + transferNetDelta) * 10) / 10,
      bbBenchPoints: 0,
      tcExtraPoints: 0,
      scenarioGwAdjusted: Math.round((baselineGwProjected + transferNetDelta) * 10) / 10,
      netSwing: transferNetDelta,
      transferNetDelta,
      bankAfter: workingBank,
      netBankChange: Math.round((workingBank - bank) * 10) / 10,
      newCaptainName: null,
      formation: "N/A",
    };
  }

  const transfersMade = moves.length;
  const ft = Math.max(0, Math.min(5, Math.floor(freeTransfers || 0)));
  const freeTransfersUsed = Math.min(transfersMade, ft);
  const paidTransfers = Math.max(0, transfersMade - ft);
  const transferHits = paidTransfers * DGH_RULES.hitCost;

  const scenarioXI = optimizeXI(workingSquad);

  // Captain: honor an explicit override if given and legal (must be in the XI), else use the optimizer's pick.
  let captainPick = scenarioXI.captain;
  if (captainOverridePlayerId) {
    const forced = scenarioXI.startingXI.find((p) => p.playerId === captainOverridePlayerId);
    if (forced) captainPick = { pick: forced, projected: projectNextGw(forced.player), reason: "Manual captain override" };
  }

  const nonCaptainSum = scenarioXI.startingXI
    .filter((p) => p.playerId !== captainPick?.pick.playerId)
    .reduce((s, p) => s + projectNextGw(p.player), 0);
  const captainProjected = captainPick ? projectNextGw(captainPick.pick.player) : 0;

  // Under Triple Captain the captain scores 3x instead of 2x; the DGH engine
  // then deducts that extra 1x as "TC 3rd Multiplier" — net effect on GW
  // Adjusted is therefore zero from TC itself (it's a wash under DGH rules),
  // but we still surface the raw uplift and the deduction transparently.
  const captainMultiplier = chip === "3xc" ? 3 : 2;
  const scenarioRawProjected = nonCaptainSum + captainProjected * captainMultiplier;

  const benchSum = scenarioXI.bench.reduce((s, p) => s + projectNextGw(p.player), 0);
  const bbBenchPoints = chip === "bboost" ? benchSum : 0;
  const tcExtraPoints = chip === "3xc" ? captainProjected : 0;

  const rawWithChip = chip === "bboost" ? scenarioRawProjected + benchSum : scenarioRawProjected;
  const scenarioGwAdjusted = gwAdjustedPoints({ rawPoints: rawWithChip, transferHits, bbBenchPoints, tcExtraPoints });

  return {
    valid: true,
    error: null,
    moves: moveDetails,
    transfersMade,
    freeTransfersUsed,
    paidTransfers,
    transferHits,
    baselineGwProjected: Math.round(baselineGwProjected * 10) / 10,
    scenarioRawProjected: Math.round(rawWithChip * 10) / 10,
    bbBenchPoints: Math.round(bbBenchPoints * 10) / 10,
    tcExtraPoints: Math.round(tcExtraPoints * 10) / 10,
    scenarioGwAdjusted: Math.round(scenarioGwAdjusted * 10) / 10,
    netSwing: Math.round((scenarioGwAdjusted - baselineGwProjected) * 10) / 10,
    transferNetDelta,
    bankAfter: workingBank,
    netBankChange: Math.round((workingBank - bank) * 10) / 10,
    newCaptainName: captainPick?.pick.player.webName ?? null,
    formation: scenarioXI.formation,
  };
}

/**
 * Given a What-If projected GW Adjusted score for "me", re-ranks the DGH
 * table for that GW against rivals' most recent actual GW Adjusted score,
 * so the user can see exactly where the move would place them this week.
 */
export function projectRankAgainstRivals(
  myProjectedGwAdjusted: number,
  latestManagerRows: ManagerSeasonRow[],
  myEntryId: number,
): { projectedGwRank: number; totalManagers: number; aheadOf: string[]; behindOf: string[] } {
  const latestByManager = latestManagerRows
    .map((m) => ({ entryId: m.entryId, name: m.teamName, latestGwAdjusted: m.gwRows[m.gwRows.length - 1]?.gwAdjusted ?? -Infinity }))
    .filter((m) => m.entryId !== myEntryId);

  const combined = [...latestByManager, { entryId: myEntryId, name: "YOU", latestGwAdjusted: myProjectedGwAdjusted }].sort(
    (a, b) => b.latestGwAdjusted - a.latestGwAdjusted,
  );
  const myIndex = combined.findIndex((m) => m.entryId === myEntryId);
  return {
    projectedGwRank: myIndex + 1,
    totalManagers: combined.length,
    aheadOf: combined.slice(0, myIndex).map((m) => m.name),
    behindOf: combined.slice(myIndex + 1).map((m) => m.name),
  };
}
