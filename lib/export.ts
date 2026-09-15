import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { OwnershipRow } from "./analytics/ownership";
import type { RivalImpact, TransferScenario } from "./analytics/transferEngine";
import type { RivalProfile, StandingsRow, SquadPick } from "./types";

function toCsvValue(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers.join(","), ...rows.map((r) => r.map(toCsvValue).join(","))].join("\n");
}

export class ExportError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ExportError";
  }
}

async function writeAndShare(filename: string, content: string): Promise<{ uri: string; shared: boolean }> {
  if (!content || content.trim().length === 0) {
    throw new ExportError("Nothing to export — this dataset is empty.");
  }
  let file: File;
  try {
    file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
  } catch (err) {
    // Covers missing permissions, disk full, and any other filesystem error.
    throw new ExportError(
      `Could not write "${filename}" to device storage. Check available storage and app permissions, then try again.`,
      err,
    );
  }

  let shared = false;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri);
      shared = true;
    }
  } catch (err) {
    // File was written successfully — sharing failing (e.g. user cancelled,
    // no share target) is non-fatal; the file still exists and its path is
    // returned so the caller can tell the user where it landed.
    shared = false;
  }
  return { uri: file.uri, shared };
}

/** Generic plain-text/CSV export + native share sheet — used by the
 * newsletter and GW Domination Sheet generators, which produce a single
 * formatted document rather than a structured dataset. */
export async function exportText(filename: string, content: string) {
  return writeAndShare(filename, content);
}

export async function exportStandings(standings: StandingsRow[], format: "csv" | "json") {
  if (format === "json") return writeAndShare("standings.json", JSON.stringify(standings, null, 2));
  const rows = standings.map((r) => [r.rank, r.player_name, r.entry_name, r.entry, r.event_total, r.total, r.last_rank]);
  return writeAndShare("standings.csv", rowsToCsv(["rank", "manager", "team", "entry_id", "gw_points", "total_points", "last_rank"], rows));
}

export async function exportSquad(squad: SquadPick[], label: string, format: "csv" | "json") {
  if (format === "json") return writeAndShare(`${label}.json`, JSON.stringify(squad, null, 2));
  const rows = squad.map((p) => [
    p.player.webName,
    p.player.position,
    p.player.teamShort,
    p.player.price,
    p.isXI ? "XI" : "BENCH",
    p.isCaptain ? "C" : p.isViceCaptain ? "VC" : "",
    p.livePoints,
  ]);
  return writeAndShare(`${label}.csv`, rowsToCsv(["name", "position", "team", "price", "status", "armband", "live_points"], rows));
}

export async function exportOpponentSquads(rivals: RivalProfile[], format: "csv" | "json") {
  if (format === "json") return writeAndShare("opponent_squads.json", JSON.stringify(rivals, null, 2));
  const rows: (string | number)[][] = [];
  for (const r of rivals) {
    for (const p of r.squad ?? []) {
      rows.push([r.entryId, r.managerName, r.teamName, p.player.webName, p.player.position, p.isXI ? "XI" : "BENCH", p.isCaptain ? "C" : ""]);
    }
  }
  return writeAndShare("opponent_squads.csv", rowsToCsv(["entry_id", "manager", "team_name", "player", "position", "status", "armband"], rows));
}

export async function exportOwnershipMap(ownership: OwnershipRow[], format: "csv" | "json") {
  if (format === "json") return writeAndShare("ownership_map.json", JSON.stringify(ownership, null, 2));
  const rows = ownership.map((o) => [o.player.webName, o.onMyTeam ? "YES" : "NO", o.rivalOwners.length, o.rivalOwnershipPct, o.overallOwnershipPct, o.label]);
  return writeAndShare(
    "ownership_map.csv",
    rowsToCsv(["player", "on_my_team", "rival_owner_count", "rival_ownership_pct", "overall_fpl_ownership_pct", "label"], rows),
  );
}

export async function exportTransferSimulations(scenarios: TransferScenario[], rivalImpacts: RivalImpact[], format: "csv" | "json") {
  if (format === "json") return writeAndShare("transfer_simulations.json", JSON.stringify({ scenarios, rivalImpacts }, null, 2));
  const rows = scenarios.map((s) => [
    s.id,
    s.hits,
    s.hitCost,
    s.moves.map((m) => `${m.out.webName}->${m.in.webName}`).join("; "),
    s.projectedGwPointsGain,
    s.netGain,
    s.riskLevel,
    s.meetsDghThreshold ? "YES" : "NO",
  ]);
  return writeAndShare(
    "transfer_simulations.csv",
    rowsToCsv(["scenario", "hits", "hit_cost", "moves", "projected_gw_points_gain", "net_gain", "risk", "meets_dgh_threshold"], rows),
  );
}
