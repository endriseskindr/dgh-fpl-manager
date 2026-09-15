import type { ComprehensiveTable } from "./comprehensiveTable";

/**
 * GW Domination Sheet — a structured, exportable A–G breakdown of a single
 * gameweek, built from the same DGH ledger the League/Live tabs already use
 * plus the current war-room state (chip, hits, bank). Pure/deterministic;
 * rendering to text/CSV is separate so the screen can preview before export.
 */

export type DominationSheetSection = { id: string; letter: string; title: string; lines: string[] };
export type DominationSheet = { gameweek: number; generatedAt: number; sections: DominationSheetSection[] };

export function buildDominationSheet(input: {
  table: ComprehensiveTable;
  gameweek: number;
  myEntryId: number | null;
  activeChip: string | null;
  currentTransferHits: number;
  currentFreeTransfers: number;
  bank: number;
  teamValue: number;
  nextDeadlineISO: string;
  chipsAvailable: string[];
}): DominationSheet {
  const { table, gameweek, myEntryId } = input;
  const me = myEntryId !== null ? table.managers.find((m) => m.entryId === myEntryId) ?? null : null;
  const myGwRow = me?.gwRows.find((r) => r.event === gameweek) ?? null;

  const orderedBySeason = [...table.managers].sort((a, b) => a.overallRank - b.overallRank);
  const orderedByGw = table.managers
    .map((m) => ({ m, row: m.gwRows.find((r) => r.event === gameweek) ?? null }))
    .filter((x): x is { m: (typeof table.managers)[number]; row: NonNullable<(typeof table.managers)[number]["gwRows"][number]> } => x.row !== null)
    .sort((a, b) => b.row.gwAdjusted - a.row.gwAdjusted);

  const leader = orderedBySeason[0] ?? null;
  const gapToLeader = me && leader ? leader.overallPoints - me.overallPoints : null;

  const sections: DominationSheetSection[] = [];

  sections.push({
    id: "result",
    letter: "A",
    title: "Gameweek Result",
    lines: myGwRow
      ? [
          `DGH Adjusted: ${myGwRow.gwAdjusted} pts (raw ${myGwRow.rawPoints}, hits -${myGwRow.transferHits}, BB ded -${myGwRow.bbBenchPoints}, TC ded -${myGwRow.tcExtraPoints})`,
          `GW Rank: #${myGwRow.gwRank} of ${orderedByGw.length}`,
          `Chip used: ${myGwRow.activeChip ?? "none"}`,
          `Prize this GW: ${table.currency} ${myGwRow.prize.toFixed(0)}${myGwRow.relegationFine ? " · relegation fine applied" : ""}`,
        ]
      : ["No ledger row for this gameweek yet — sync the DGH ledger from the League tab."],
  });

  sections.push({
    id: "season",
    letter: "B",
    title: "Season Standing",
    lines: me
      ? [
          `Overall rank: #${me.overallRank} of ${table.managers.length}`,
          `Overall DGH points: ${me.overallPoints}`,
          `Record: ${me.wins}W · ${me.seconds} 2nd · ${me.thirds} 3rd · ${me.podiums} podiums · ${me.lastPlaceCount} relegation${me.lastPlaceCount === 1 ? "" : "s"}`,
          gapToLeader !== null ? (gapToLeader <= 0 ? `You lead the league by ${Math.abs(gapToLeader)} pts` : `${gapToLeader} pts behind the leader (${leader!.teamName})`) : "",
        ].filter(Boolean)
      : ["Not enough ledger history yet for your entry."],
  });

  sections.push({
    id: "table",
    letter: "C",
    title: "League Table Snapshot (Top 5)",
    lines: orderedBySeason.slice(0, 5).map((m, i) => `${i + 1}. ${m.teamName} — ${m.overallPoints} pts (${m.wins}W · ${m.podiums} podiums)`),
  });

  sections.push({
    id: "money",
    letter: "D",
    title: "Money Ledger",
    lines: me
      ? [
          `Prize won (season): ${table.currency} ${me.moneyWon.toFixed(0)}`,
          `Fees paid (season): ${table.currency} ${me.feesPaid.toFixed(0)}`,
          `Fines paid (season): ${table.currency} ${me.finesPaid.toFixed(0)}`,
          `Net money (season): ${table.currency} ${me.netMoney.toFixed(0)}`,
        ]
      : ["No ledger data yet."],
  });

  sections.push({
    id: "activity",
    letter: "E",
    title: "Chip & Transfer Activity",
    lines: [
      `Active chip: ${input.activeChip ?? "none"}`,
      `Hit cost taken this GW: -${input.currentTransferHits} pts`,
      `Free transfers available: ${input.currentFreeTransfers}`,
      `Bank: £${input.bank.toFixed(1)}m · Team value: £${input.teamValue.toFixed(1)}m`,
      `Chips still available: ${input.chipsAvailable.length ? input.chipsAvailable.join(", ") : "none"}`,
    ],
  });

  const topScorer = orderedByGw[0];
  const relegationCandidate = orderedByGw.find((x) => x.row.relegationFine);
  sections.push({
    id: "notable",
    letter: "F",
    title: "Notable Performances",
    lines: [
      topScorer ? `Top scorer this GW: ${topScorer.m.teamName} (${topScorer.row.gwAdjusted} pts)` : "",
      relegationCandidate ? `Relegation zone: ${relegationCandidate.m.teamName} (${relegationCandidate.row.gwAdjusted} pts)` : "No relegation fine triggered this GW.",
    ].filter(Boolean),
  });

  sections.push({
    id: "outlook",
    letter: "G",
    title: "Next Gameweek Outlook",
    lines: [`Next deadline: ${new Date(input.nextDeadlineISO).toLocaleString()}`],
  });

  return { gameweek, generatedAt: Date.now(), sections };
}

export function renderDominationSheetText(sheet: DominationSheet, leagueLabel = "DGH Mini-League"): string {
  const lines: string[] = [];
  lines.push(`GW DOMINATION SHEET — ${leagueLabel} — GW${sheet.gameweek}`);
  lines.push("");
  for (const s of sheet.sections) {
    lines.push(`${s.letter}. ${s.title.toUpperCase()}`);
    for (const l of s.lines) lines.push(`   ${l}`);
    lines.push("");
  }
  lines.push(`Generated ${new Date(sheet.generatedAt).toLocaleString()}`);
  return lines.join("\n");
}

export function renderDominationSheetCsv(sheet: DominationSheet): string {
  const esc = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = sheet.sections.flatMap((s) => s.lines.map((l) => [s.letter, s.title, l]));
  return ["section,title,detail", ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
