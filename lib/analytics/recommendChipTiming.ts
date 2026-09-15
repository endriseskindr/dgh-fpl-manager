import type { Bootstrap, EnrichedPlayer, FplFixture, SquadPick } from "../types";
import type { ChipName, ChipStatus } from "./chips";
import { optimizeChipWindow, type ChipWindow } from "./chipOptimizer";
import { scanDgwBgw, type DgwBgwScan, type GwFixtureLoad } from "./dgwIntel";

/**
 * Chip TIMING, ported from x402-fpl-api's chips.py — layered on top of DGH's
 * existing chipOptimizer.ts rather than replacing it.
 *
 * chipOptimizer.optimizeChipWindow() already answers "how good would this
 * chip be in this specific gameweek" — and it's already fixture-aware: its
 * fixtureAdjustedProjection sums a player's projection across every fixture
 * they have in that gameweek, so a double-gameweek player is already scored
 * roughly 2x there, and a blanking player already scores 0. What DGH didn't
 * have was (a) a way to know WHICH future gameweek is worth checking, and
 * (b) sequencing logic between chips — the single biggest lever in the
 * source material being Wildcard-the-week-before-Bench-Boost, to rebuild the
 * bench specifically for a double gameweek.
 *
 * IMPORTANT LIMITATION: scanning "future" gameweeks re-uses today's squad,
 * player pool, prices and ownership for every candidate gw — there's no way
 * to know a future price change, injury, or transfer market shift ahead of
 * time. Treat scores for gw > fromEvent+1 as directional ("this window looks
 * promising"), not as precise point predictions. This mirrors the same
 * limitation x402's own scan carried.
 */

const COMBO_WEIGHT = 0.5; // how much of the BB gameweek's value counts toward the WC-before-it bonus

export type ChipTimingCandidate = {
  chip: ChipName;
  gw: number;
  window: ChipWindow;
  comboBonus: number;
  comboReason: string | null;
  score: number; // window.expectedGain + comboBonus — used to rank candidate gameweeks for this chip
};

export type ChipTimingRecommendation = {
  chip: ChipName;
  available: boolean;
  bestGw: number | null;
  window: ChipWindow | null;
  reasoning: string[];
  allCandidates: ChipTimingCandidate[]; // sorted best-first, for a "why not GW32 instead" UI if wanted
};

export type ChipTimingPlan = {
  scan: DgwBgwScan;
  recommendations: ChipTimingRecommendation[];
};

function teamNameLookup(bootstrap: Bootstrap): Map<number, { short_name: string }> {
  return new Map(bootstrap.teams.map((t) => [t.id, { short_name: t.short_name }]));
}

/** Which gameweeks are actually worth running the expensive wildcard/free-hit
 * search on: any DGW or BGW gameweek, plus always the very next gameweek as a
 * baseline. Bench boost and triple captain are cheap (just current squad), so
 * those run across the whole scan window. */
function heavyChipCandidateEvents(scan: DgwBgwScan): number[] {
  const events = new Set<number>([scan.fromEvent]);
  for (const gw of scan.gameweeks) {
    if (gw.dgwTeamIds.length || gw.bgwTeamIds.length) events.add(gw.event);
  }
  return [...events].sort((a, b) => a - b);
}

function buildReasoning(chip: ChipName, best: ChipTimingCandidate | null, gwByEvent: Map<number, GwFixtureLoad>, teamById: Map<number, { short_name: string }>): string[] {
  if (!best) return [`No viable ${chip} window found in the scan range.`];
  const reasons: string[] = [best.window.explanation];
  const gw = gwByEvent.get(best.gw);
  const shortNames = (ids: number[]) => ids.map((id) => teamById.get(id)?.short_name ?? "UNK").join(", ");
  if (gw?.dgwTeamIds.length) reasons.push(`GW${best.gw} is a double gameweek for ${shortNames(gw.dgwTeamIds)}.`);
  if (gw?.bgwTeamIds.length) reasons.push(`GW${best.gw} is a blank gameweek for ${shortNames(gw.bgwTeamIds)}.`);
  if (best.comboReason) reasons.push(best.comboReason);
  return reasons;
}

/**
 * Recommend the best gameweek for each remaining chip, sequencing them
 * against each other (currently: the Wildcard-before-Bench-Boost combo,
 * the single highest-value chip interaction in the source material).
 */
export function recommendChipTiming(input: {
  chipStatuses: ChipStatus[];
  currentSquad: SquadPick[];
  pool: EnrichedPlayer[];
  fixtures: FplFixture[];
  bootstrap: Bootstrap;
  budget: number;
  fromEvent: number;
  scanWindow?: number;
}): ChipTimingPlan {
  const scan = scanDgwBgw(input.bootstrap, input.fixtures, input.fromEvent, input.scanWindow ?? 10);
  const gwByEvent = new Map(scan.gameweeks.map((g) => [g.event, g]));
  const teamById = teamNameLookup(input.bootstrap);
  const heavyEvents = heavyChipCandidateEvents(scan);
  const availableByName = new Map(input.chipStatuses.map((c) => [c.name, c.available]));

  const candidatesByChip = new Map<ChipName, ChipTimingCandidate[]>();

  const evaluate = (chip: ChipName, events: number[]) => {
    const list: ChipTimingCandidate[] = [];
    for (const gw of events) {
      const window = optimizeChipWindow({
        chip,
        gw,
        currentSquad: input.currentSquad,
        pool: input.pool,
        fixtures: input.fixtures,
        budget: input.budget,
      });
      list.push({ chip, gw, window, comboBonus: 0, comboReason: null, score: window.expectedGain });
    }
    candidatesByChip.set(chip, list);
  };

  if (availableByName.get("bboost")) evaluate("bboost", scan.gameweeks.map((g) => g.event));
  if (availableByName.get("3xc")) evaluate("3xc", scan.gameweeks.map((g) => g.event));
  if (availableByName.get("wildcard")) evaluate("wildcard", heavyEvents);
  if (availableByName.get("freehit")) evaluate("freehit", heavyEvents);

  // --- Wildcard -> Bench Boost combo ---
  // The single highest-value sequencing rule in the source material: wildcard
  // the gameweek immediately before your best bench-boost week, to rebuild
  // the bench specifically for that double gameweek.
  const bbCandidates = candidatesByChip.get("bboost");
  const wcCandidates = candidatesByChip.get("wildcard");
  if (bbCandidates?.length && wcCandidates?.length) {
    const bestBB = [...bbCandidates].sort((a, b) => b.score - a.score)[0];
    const comboTarget = wcCandidates.find((c) => c.gw === bestBB.gw - 1);
    if (comboTarget && bestBB.window.expectedGain > 0) {
      comboTarget.comboBonus = round1(bestBB.window.expectedGain * COMBO_WEIGHT);
      comboTarget.comboReason = `Wildcarding here rebuilds the bench for GW${bestBB.gw}'s bench boost, worth an extra ${bestBB.window.expectedGain.toFixed(1)} pts there.`;
      comboTarget.score = comboTarget.window.expectedGain + comboTarget.comboBonus;
    }
  }

  const recommendations: ChipTimingRecommendation[] = (["wildcard", "freehit", "bboost", "3xc"] as ChipName[]).map((chip) => {
    const available = availableByName.get(chip) ?? false;
    const candidates = (candidatesByChip.get(chip) ?? []).sort((a, b) => b.score - a.score);
    const best = candidates[0] ?? null;
    return {
      chip,
      available,
      bestGw: best?.gw ?? null,
      window: best?.window ?? null,
      reasoning: available ? buildReasoning(chip, best, gwByEvent, teamById) : [`${chip} already used this half.`],
      allCandidates: candidates,
    };
  });

  return { scan, recommendations };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Safe fallback shape for callers (dataService.loadWarRoomData) that must
 * never let a chip-timing computation failure block the rest of war room
 * data — mirrors spyService's emptySpyIntel() for the same reason. */
export function emptyChipTimingPlan(fromEvent: number): ChipTimingPlan {
  return {
    scan: { fromEvent, scanWindow: 0, gameweeks: [], unscheduledFixtures: [], likelyFutureDgws: [] },
    recommendations: (["wildcard", "freehit", "bboost", "3xc"] as ChipName[]).map((chip) => ({
      chip,
      available: false,
      bestGw: null,
      window: null,
      reasoning: ["Chip timing intelligence unavailable this refresh."],
      allCandidates: [],
    })),
  };
}
