import type { EnrichedPlayer, RivalTransferInCandidate, RivalTransferOutCandidate, SquadPick } from "../types";
import type { TeamFixtureRun } from "./fixtures";
import { hasNegativeNews } from "./newsIntel";

/**
 * Rival transfer-pattern prediction, ported from x402-fpl-api-main's
 * rivals.py (`_predict_next_move` / `_find_weaknesses` / `bootstrap_top_
 * transfers_in`). Net new — DGH's warRoom.ts/eliteManager.ts compare current
 * squads but never predicted a rival's NEXT move from squad state (see
 * PORT_NOTES.md, "Still open from the audit").
 *
 * Heuristics (unchanged from source):
 *  - injured/doubtful starters are the top transfer-out candidates
 *  - poor form + tough upcoming fixture also raise urgency
 *  - a blank gameweek (no fixture at all) is treated like a tough fixture
 *  - likely transfer-IN targets are in-form (>=5.0), fixture-friendly players
 *    the rival doesn't already own
 *
 * LIMITATION carried over: this reasons from the rival's CURRENT squad and
 * this GW's fixtures/form only. It has no visibility into what the rival is
 * actually planning — it's a heuristic guess, not a leak.
 */

const INJURY_STATUSES = new Set(["i", "d", "s", "u"]);

function fixtureRunFor(teamId: number, byTeam: Map<number, TeamFixtureRun>): TeamFixtureRun | undefined {
  return byTeam.get(teamId);
}

export function buildFixtureRunLookup(runs: TeamFixtureRun[]): Map<number, TeamFixtureRun> {
  return new Map(runs.map((r) => [r.teamId, r]));
}

function outReason(p: EnrichedPlayer, run: TeamFixtureRun | undefined): string {
  const reasons: string[] = [];
  if (INJURY_STATUSES.has(p.status)) reasons.push("injured/doubtful");
  if (p.form < 3.0) reasons.push(`poor form (${p.form.toFixed(1)})`);
  const nextFixture = run?.next[0];
  if (!nextFixture) reasons.push("blank GW");
  else if (run && run.averageDifficulty >= 4.0) reasons.push(`tough fixture (${nextFixture.opponentShort})`);
  if (hasNegativeNews(p.availability.news)) reasons.push(`news: ${p.availability.news.trim()}`);
  return reasons.length ? reasons.join(", ") : "underperforming";
}

/** Predict which of a rival's current starters they're likely to transfer
 * out this week, ranked by urgency (highest first, top 3). */
export function predictTransferOut(rivalSquad: SquadPick[], fixtureRunByTeam: Map<number, TeamFixtureRun>): RivalTransferOutCandidate[] {
  const candidates: RivalTransferOutCandidate[] = [];
  for (const pick of rivalSquad) {
    if (pick.isBench) continue; // bench players are less likely to be transferred
    const p = pick.player;
    const run = fixtureRunFor(p.teamId, fixtureRunByTeam);
    let urgency = 0;

    if (INJURY_STATUSES.has(p.status)) urgency += 10;
    if (p.form < 3.0) urgency += (3.0 - p.form) * 2;

    if (run?.next.length) {
      if (run.averageDifficulty >= 3.5) urgency += (run.averageDifficulty - 3.0) * 2;
    } else {
      urgency += 3; // blank GW
    }
    if (p.priceChangeEvent < 0) urgency += 2;

    if (urgency > 3.0) {
      candidates.push({
        playerId: p.id,
        webName: p.webName,
        teamShort: p.teamShort,
        reason: outReason(p, run),
        urgency: Math.round(urgency * 10) / 10,
      });
    }
  }
  return candidates.sort((a, b) => b.urgency - a.urgency).slice(0, 3);
}

/** Likely transfer-IN targets: in-form, fixture-friendly players the rival
 * doesn't already own, ranked by a form + fixture + transfer-volume score. */
export function predictTransferIn(
  pool: EnrichedPlayer[],
  rivalPlayerIds: Set<number>,
  fixtureRunByTeam: Map<number, TeamFixtureRun>,
): RivalTransferInCandidate[] {
  const candidates: RivalTransferInCandidate[] = [];
  for (const p of pool) {
    if (rivalPlayerIds.has(p.id)) continue;
    if (p.form < 5.0) continue;
    if (INJURY_STATUSES.has(p.status)) continue;
    const run = fixtureRunFor(p.teamId, fixtureRunByTeam);
    if (!run?.next.length) continue; // blank GW — skip as a transfer-in target

    const score = p.form * 2.0 + (5 - run.averageDifficulty) * 1.5 + p.transfersInEvent / 100_000;
    candidates.push({
      playerId: p.id,
      webName: p.webName,
      teamShort: p.teamShort,
      reason: `Form ${p.form.toFixed(1)} · avg FDR ${run.averageDifficulty.toFixed(1)}${p.transfersInEvent > 50_000 ? " · trending in" : ""}`,
      score: Math.round(score * 10) / 10,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** Human-readable weaknesses in a rival's current XI — for a "how do I beat
 * them" summary. Ported from rivals.py `_find_weaknesses`. */
export function findRivalWeaknesses(rivalSquad: SquadPick[], fixtureRunByTeam: Map<number, TeamFixtureRun>): string[] {
  const weaknesses: string[] = [];
  const xi = rivalSquad.filter((p) => p.isXI);

  const injured = xi.filter((p) => INJURY_STATUSES.has(p.player.status)).map((p) => p.player.webName);
  if (injured.length) weaknesses.push(`Injured/doubtful: ${injured.join(", ")}`);

  const blanks = xi.filter((p) => !fixtureRunFor(p.player.teamId, fixtureRunByTeam)?.next.length).map((p) => p.player.webName);
  if (blanks.length) weaknesses.push(`Blank GW (no fixture): ${blanks.join(", ")}`);

  const poorForm = xi.filter((p) => p.player.form < 3.0).map((p) => `${p.player.webName} (${p.player.form.toFixed(1)})`);
  if (poorForm.length >= 3) weaknesses.push(`Poor form starters: ${poorForm.slice(0, 4).join(", ")}`);

  const toughFixtures = xi
    .filter((p) => {
      const run = fixtureRunFor(p.player.teamId, fixtureRunByTeam);
      return run && run.next.length > 0 && run.averageDifficulty >= 4.0;
    })
    .map((p) => {
      const run = fixtureRunFor(p.player.teamId, fixtureRunByTeam)!;
      return `${p.player.webName} vs ${run.next[0].opponentShort}`;
    });
  if (toughFixtures.length) weaknesses.push(`Tough fixtures: ${toughFixtures.slice(0, 3).join(", ")}`);

  return weaknesses.length ? weaknesses : ["No obvious weaknesses — strong squad"];
}
