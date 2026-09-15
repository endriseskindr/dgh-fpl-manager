import type { RivalProfile, SquadPick } from "../types";

/**
 * Unified Template Index (UTI) engine — master feature list items 145–148.
 *
 * This is deliberately a separate, more granular metric from
 * lib/analytics/miniLeagueTemplate.ts's ManagerTemplateSimilarity: that
 * module measures raw overlap-count against a single assembled "template
 * team" (simple counting, no weighting, no captain/formation signal). UTI
 * instead scores every manager two ways — against the league's aggregate
 * template (TTS) and pairwise against every other manager (FTSI) — using
 * ownership-weighted Jaccard overlaps, captain-match, and formation-match
 * terms, per the exact weights specified in the feature list. Both modules
 * can coexist; UTI does not replace or recompute miniLeagueTemplate's output.
 *
 * Formulas (kept verbatim from the spec so the weights are auditable):
 *   TTS_i  = 100 × [0.40·J15 + 0.25·J_XI + 0.15·POS + 0.10·OC + 0.05·CAP + 0.05·FORM]
 *   FTSI_ij = 100 × [0.35·J15 + 0.20·J_XI + 0.15·J_POS + 0.10·C + 0.05·F + 0.15·OCS]
 *   avg_FTSI_i = mean(FTSI_ij) across all other managers in the league
 *   UTI_i  = 0.60·TTS_i + 0.40·avg_FTSI_i
 *
 * J15/J_XI: Jaccard overlap of the 15-man squad / starting XI (vs. the
 * league template T for TTS, vs. the other manager's squad for FTSI).
 * POS/J_POS: ownership-weighted position-slot alignment (how many of a
 * manager's XI position slots match the template/other manager's XI at
 * the same position, weighted by low-ownership differentials).
 * OC/OCS: ownership-weighted overlap concentration — overlapping players
 * are worth more when they're low-owned differentials, using
 * w_p = 1 + (1 − Own_p/100).
 * CAP/C: 1.0 same captain, 0.5 same captain *candidate* (i.e. either
 * manager captained a player the other had as captain or vice-captain),
 * 0 otherwise.
 * FORM/F: 1.0 if formations match exactly, 0 otherwise.
 */

export type UtiInputManager = {
  entryId: number;
  managerName: string;
  teamName: string;
  isMe: boolean;
  squadIds: number[]; // all 15 (or fewer if unverified — caller filters)
  xiIds: number[]; // starting XI (normally 11)
  positionByPlayerId: Record<number, string>; // GKP/DEF/MID/FWD
  ownershipPctByPlayerId: Record<number, number>; // league-local ownership, 0-100
  captainId: number | null;
  viceCaptainId: number | null;
  formation: string; // e.g. "3-4-3"
};

export type TtsBreakdown = {
  j15: number;
  jXi: number;
  pos: number;
  oc: number;
  cap: number;
  form: number;
  tts: number;
};

export type FtsiRow = {
  entryId: number;
  managerName: string;
  teamName: string;
  ftsi: number;
};

export type UtiRow = {
  entryId: number;
  managerName: string;
  teamName: string;
  isMe: boolean;
  tts: TtsBreakdown;
  avgFtsi: number;
  ftsiByRival: FtsiRow[];
  uti: number;
  band: UtiBand;
};

export type UtiBand = {
  key: "IDENTICAL" | "VERY_SIMILAR" | "SIMILAR" | "BALANCED" | "DIFFERENTIAL" | "REBEL" | "CHAOS";
  label: string;
  emoji: string;
  min: number; // inclusive
  max: number | null; // inclusive, null = no upper bound
};

// Fixed classification bands, applied identically every gameweek — item 148.
export const UTI_BANDS: UtiBand[] = [
  { key: "IDENTICAL", label: "Identical", emoji: "🔵", min: 50.0001, max: null },
  { key: "VERY_SIMILAR", label: "Very Similar", emoji: "🟣", min: 45, max: 50 },
  { key: "SIMILAR", label: "Similar", emoji: "🟢", min: 40, max: 44.9999 },
  { key: "BALANCED", label: "Balanced", emoji: "🟡", min: 35, max: 39.9999 },
  { key: "DIFFERENTIAL", label: "Differential", emoji: "🟠", min: 30, max: 34.9999 },
  { key: "REBEL", label: "Rebel", emoji: "🔴", min: 25, max: 29.9999 },
  { key: "CHAOS", label: "Chaos", emoji: "⚫", min: 0, max: 24.9999 },
];

// Ordered weakest → strongest, matching the spec's stated progression
// Identical → Very Similar → Similar → Balanced → Differential → Rebel →
// Chaos. Kept for any screen that wants to render the ladder in order.
export const UTI_PROGRESSION_HIGH_TO_LOW: UtiBand["key"][] = [
  "IDENTICAL",
  "VERY_SIMILAR",
  "SIMILAR",
  "BALANCED",
  "DIFFERENTIAL",
  "REBEL",
  "CHAOS",
];

export function classifyUti(uti: number): UtiBand {
  return UTI_BANDS.find((b) => uti >= b.min && (b.max === null || uti <= b.max)) ?? UTI_BANDS[UTI_BANDS.length - 1];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function jaccard(a: number[], b: number[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const id of setA) if (setB.has(id)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** w_p = 1 + (1 − Own_p/100): low-owned overlapping players count for more. */
function differentialWeight(ownershipPct: number): number {
  return 1 + (1 - clamp01(ownershipPct / 100));
}

/**
 * Ownership-weighted overlap concentration: sum of differential weights
 * over the overlapping player set, normalised to 0–1 by the maximum
 * possible weighted sum (every unique player in both sets at 0% owned).
 */
function overlapConcentration(idsA: number[], idsB: number[], ownershipPctByPlayerId: Record<number, number>): number {
  const setB = new Set(idsB);
  const overlap = idsA.filter((id) => setB.has(id));
  if (overlap.length === 0) return 0;
  const weighted = overlap.reduce((s, id) => s + differentialWeight(ownershipPctByPlayerId[id] ?? 50), 0);
  const maxPossible = overlap.length * 2; // differentialWeight tops out at 2 (0% owned)
  return maxPossible > 0 ? weighted / maxPossible : 0;
}

/**
 * Ownership-weighted position-slot alignment: for each position, how many
 * template/other-manager XI slots at that position this manager also fills
 * from their own XI, weighted by how low-owned the matching players are.
 * Normalised 0–1 across all XI slots being compared.
 */
function positionAlignment(
  myXiIds: number[],
  otherXiIds: number[],
  positionByPlayerId: Record<number, string>,
  ownershipPctByPlayerId: Record<number, number>,
): number {
  const myByPos = new Map<string, number[]>();
  for (const id of myXiIds) {
    const pos = positionByPlayerId[id] ?? "UNK";
    myByPos.set(pos, [...(myByPos.get(pos) ?? []), id]);
  }
  const otherByPos = new Map<string, number[]>();
  for (const id of otherXiIds) {
    const pos = positionByPlayerId[id] ?? "UNK";
    otherByPos.set(pos, [...(otherByPos.get(pos) ?? []), id]);
  }
  let weightedMatch = 0;
  let weightedTotal = 0;
  for (const [pos, otherIds] of otherByPos) {
    const mineAtPos = new Set(myByPos.get(pos) ?? []);
    for (const id of otherIds) {
      const w = differentialWeight(ownershipPctByPlayerId[id] ?? 50);
      weightedTotal += w;
      if (mineAtPos.has(id)) weightedMatch += w;
    }
  }
  return weightedTotal > 0 ? weightedMatch / weightedTotal : 0;
}

/** CAP/C: 1 same captain, 0.5 same captain candidate (either manager's
 * captain was the other's captain-or-vice), 0 otherwise. */
function captainScore(
  captainA: number | null,
  viceA: number | null,
  captainB: number | null,
  viceB: number | null,
): number {
  if (captainA != null && captainA === captainB) return 1;
  const aCandidates = new Set([captainA, viceA].filter((x): x is number => x != null));
  const bCandidates = new Set([captainB, viceB].filter((x): x is number => x != null));
  for (const id of aCandidates) if (bCandidates.has(id)) return 0.5;
  return 0;
}

function formationScore(formationA: string, formationB: string): number {
  return formationA && formationA === formationB && formationA !== "N/A" ? 1 : 0;
}

/**
 * Assembles the league's aggregate "template" XI/squad from every manager
 * whose squad is included (weighted simply by inclusion — the same set
 * fed into buildMiniLeagueTemplate). Reused here so TTS is measured
 * against a genuinely leaguewide template rather than any single manager.
 */
function buildAggregateTemplate(managers: UtiInputManager[]): { squadIds: number[]; xiIds: number[]; positionByPlayerId: Record<number, string>; formation: string } {
  const squadCounts = new Map<number, number>();
  const xiCounts = new Map<number, number>();
  const positionByPlayerId: Record<number, string> = {};
  const formationCounts = new Map<string, number>();
  for (const m of managers) {
    for (const id of m.squadIds) squadCounts.set(id, (squadCounts.get(id) ?? 0) + 1);
    for (const id of m.xiIds) xiCounts.set(id, (xiCounts.get(id) ?? 0) + 1);
    Object.assign(positionByPlayerId, m.positionByPlayerId);
    if (m.formation) formationCounts.set(m.formation, (formationCounts.get(m.formation) ?? 0) + 1);
  }
  const bestFormation = [...formationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
  // Template squad = the 15 most-owned unique players leaguewide;
  // template XI = the most-owned XI players, capped to the number of XI
  // slots the most common formation actually uses (falls back to 11).
  const squadIds = [...squadCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id]) => id);
  const xiSize = bestFormation !== "N/A" ? bestFormation.split("-").reduce((s, n) => s + Number(n), 1) : 11;
  const xiIds = [...xiCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, xiSize).map(([id]) => id);
  return { squadIds, xiIds, positionByPlayerId, formation: bestFormation };
}

/** TTS_i for one manager against the league's aggregate template. */
export function computeTts(manager: UtiInputManager, template: ReturnType<typeof buildAggregateTemplate>): TtsBreakdown {
  const j15 = jaccard(manager.squadIds, template.squadIds);
  const jXi = jaccard(manager.xiIds, template.xiIds);
  const pos = positionAlignment(manager.xiIds, template.xiIds, template.positionByPlayerId, manager.ownershipPctByPlayerId);
  const oc = overlapConcentration(manager.squadIds, template.squadIds, manager.ownershipPctByPlayerId);
  // CAP for TTS: does this manager's captain sit in the template XI at all
  // (the template has no single captain, so "match" means the template's
  // most-captained player among the cohort equals this manager's captain —
  // approximated here as "captain is in the template XI").
  const cap = manager.captainId != null && template.xiIds.includes(manager.captainId) ? 1 : 0;
  const form = formationScore(manager.formation, template.formation);
  const tts = 100 * (0.4 * j15 + 0.25 * jXi + 0.15 * pos + 0.1 * oc + 0.05 * cap + 0.05 * form);
  return { j15: round1(j15 * 100), jXi: round1(jXi * 100), pos: round1(pos * 100), oc: round1(oc * 100), cap: round1(cap * 100), form: round1(form * 100), tts: round1(tts) };
}

/** FTSI_ij between two individual managers. */
export function computeFtsi(a: UtiInputManager, b: UtiInputManager): number {
  const j15 = jaccard(a.squadIds, b.squadIds);

  // Exact identity is a hard ceiling: two managers with the same 15, same
  // XI, same captain/vice pair, and same formation are 100% similar. This
  // avoids the ownership-weighted OCS term artificially reducing an otherwise
  // identical squad (e.g. 50% ownership previously produced 96.3).
  if (
    j15 === 1 &&
    jaccard(a.xiIds, b.xiIds) === 1 &&
    captainScore(a.captainId, a.viceCaptainId, b.captainId, b.viceCaptainId) === 1 &&
    formationScore(a.formation, b.formation) === 1
  ) {
    return 100;
  }
  const jXi = jaccard(a.xiIds, b.xiIds);
  const jPos = positionAlignment(a.xiIds, b.xiIds, { ...b.positionByPlayerId, ...a.positionByPlayerId }, a.ownershipPctByPlayerId);
  const c = captainScore(a.captainId, a.viceCaptainId, b.captainId, b.viceCaptainId);
  const f = formationScore(a.formation, b.formation);
  const ocs = overlapConcentration(a.squadIds, b.squadIds, a.ownershipPctByPlayerId);
  return round1(100 * (0.35 * j15 + 0.2 * jXi + 0.15 * jPos + 0.1 * c + 0.05 * f + 0.15 * ocs));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Full UTI table for a mini-league: TTS + pairwise FTSI + avg_FTSI + UTI +
 * band, for every manager with a verified squad this refresh (mirrors the
 * "never fabricate a similarity score for an unverified squad" rule used
 * throughout lib/analytics/miniLeagueTemplate.ts). Sorted highest-UTI
 * (most template-like) first, matching the existing template-similarity
 * screen's convention.
 */
export function buildUtiTable(managers: UtiInputManager[]): UtiRow[] {
  if (managers.length === 0) return [];
  const template = buildAggregateTemplate(managers);
  const rows: UtiRow[] = managers.map((m) => {
    const tts = computeTts(m, template);
    const others = managers.filter((o) => o.entryId !== m.entryId);
    const ftsiByRival: FtsiRow[] = others
      .map((o) => ({ entryId: o.entryId, managerName: o.managerName, teamName: o.teamName, ftsi: computeFtsi(m, o) }))
      .sort((a, b) => b.ftsi - a.ftsi);
    const avgFtsi = ftsiByRival.length ? round1(ftsiByRival.reduce((s, r) => s + r.ftsi, 0) / ftsiByRival.length) : 0;
    const uti = round1(0.6 * tts.tts + 0.4 * avgFtsi);
    return { entryId: m.entryId, managerName: m.managerName, teamName: m.teamName, isMe: m.isMe, tts, avgFtsi, ftsiByRival, uti, band: classifyUti(uti) };
  });
  return rows.sort((a, b) => b.uti - a.uti);
}

/**
 * Convenience adapter from the shapes already computed elsewhere in the
 * app (SquadPick[] + RivalProfile[], as used by miniLeagueTemplate.ts and
 * dataService.ts) into UtiInputManager[], so callers don't need to
 * hand-build the UTI input shape. Only includes managers with a verified
 * squad — RivalProfile.squad === null is skipped, never fabricated.
 */
export function buildUtiManagersFromSquads(
  myEntryId: number,
  myManagerName: string,
  myTeamName: string,
  mySquad: SquadPick[],
  rivals: RivalProfile[],
): UtiInputManager[] {
  const toManager = (
    entryId: number,
    managerName: string,
    teamName: string,
    isMe: boolean,
    squad: SquadPick[],
  ): UtiInputManager => {
    const positionByPlayerId: Record<number, string> = {};
    const ownershipPctByPlayerId: Record<number, number> = {};
    for (const p of squad) {
      positionByPlayerId[p.playerId] = p.player.position;
      ownershipPctByPlayerId[p.playerId] = p.player.ownershipPct;
    }
    const xi = squad.filter((p) => p.isXI);
    const counts: Record<string, number> = {};
    for (const p of xi) counts[p.player.position] = (counts[p.player.position] ?? 0) + 1;
    const formation = `${counts.DEF ?? 0}-${counts.MID ?? 0}-${counts.FWD ?? 0}`;
    return {
      entryId,
      managerName,
      teamName,
      isMe,
      squadIds: squad.map((p) => p.playerId),
      xiIds: xi.map((p) => p.playerId),
      positionByPlayerId,
      ownershipPctByPlayerId,
      captainId: squad.find((p) => p.isCaptain)?.playerId ?? null,
      viceCaptainId: squad.find((p) => p.isViceCaptain)?.playerId ?? null,
      formation,
    };
  };

  const out: UtiInputManager[] = [toManager(myEntryId, myManagerName, myTeamName, true, mySquad)];
  for (const rival of rivals) {
    if (!rival.squad) continue; // unverified this refresh — never fabricate
    out.push(toManager(rival.entryId, rival.managerName, rival.teamName, false, rival.squad));
  }
  return out;
}
