import * as SQLite from "expo-sqlite";
import type { RivalProfile, SquadPick, StandingsRow } from "./types";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let schemaReady = false;

async function db() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync("dgh-season.db");
  const database = await dbPromise;
  if (!schemaReady) {
    await database.execAsync(`PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS gw_snapshots (event INTEGER PRIMARY KEY NOT NULL, captured_at INTEGER NOT NULL, my_rank INTEGER, my_total INTEGER, my_event_points INTEGER, my_squad_json TEXT NOT NULL, standings_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rival_weekly (event INTEGER NOT NULL, entry_id INTEGER NOT NULL, manager_name TEXT NOT NULL, team_name TEXT NOT NULL, gw_points INTEGER NOT NULL, total_points INTEGER NOT NULL, rank INTEGER NOT NULL, captured_at INTEGER NOT NULL, PRIMARY KEY(event, entry_id)); CREATE TABLE IF NOT EXISTS rival_transfers_seen (entry_id INTEGER PRIMARY KEY NOT NULL, transfer_key TEXT NOT NULL, seen_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS dgh_ledger_gw (event INTEGER NOT NULL, entry_id INTEGER NOT NULL, manager_name TEXT NOT NULL, team_name TEXT NOT NULL, raw_points INTEGER NOT NULL, transfer_hits INTEGER NOT NULL, bb_bench_points INTEGER NOT NULL, tc_extra_points INTEGER NOT NULL, active_chip TEXT, overall_rank INTEGER, captured_at INTEGER NOT NULL, PRIMARY KEY(event, entry_id)); CREATE TABLE IF NOT EXISTS dgh_league_config (id INTEGER PRIMARY KEY CHECK (id = 1), prize_pool_per_gw REAL NOT NULL DEFAULT 0, fee_per_gw REAL NOT NULL DEFAULT 100, relegation_fine REAL NOT NULL DEFAULT 50, relegation_enabled INTEGER NOT NULL DEFAULT 1, currency TEXT NOT NULL DEFAULT 'ETB', prize_pct_1st REAL NOT NULL DEFAULT 50, prize_pct_2nd REAL NOT NULL DEFAULT 30, prize_pct_3rd REAL NOT NULL DEFAULT 20, updated_at INTEGER); CREATE TABLE IF NOT EXISTS dgh_manager_overrides (entry_id INTEGER NOT NULL, event INTEGER NOT NULL, fee_waived INTEGER NOT NULL DEFAULT 0, fine_waived INTEGER NOT NULL DEFAULT 0, note TEXT, PRIMARY KEY(entry_id, event)); CREATE TABLE IF NOT EXISTS dgh_manager_metadata (entry_id INTEGER PRIMARY KEY NOT NULL, manager_name TEXT NOT NULL, team_name TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS price_alerts_seen (player_id INTEGER NOT NULL, direction TEXT NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY(player_id, direction)); CREATE TABLE IF NOT EXISTS deadline_alerts_scheduled (event INTEGER PRIMARY KEY NOT NULL, scheduled_at INTEGER NOT NULL);`);
    schemaReady = true;
  }
  return database;
}

// ---- DGH Comprehensive Table ledger (hits / bench boost / triple captain / league money config) ----

export type DghLedgerRow = {
  event: number;
  entryId: number;
  managerName: string;
  teamName: string;
  rawPoints: number;
  transferHits: number; // positive number of points deducted, e.g. 4, 8, 12
  bbBenchPoints: number; // positive number of points deducted when Bench Boost was active
  tcExtraPoints: number; // positive number of points deducted for the 3rd (extra) TC multiplier
  activeChip: string | null;
  overallRank: number | null;
};

export type DghLeagueConfig = {
  prizePoolPerGw: number;
  feePerGw: number;
  relegationFine: number;
  relegationEnabled: boolean;
  currency: string;
  prizePct1st: number;
  prizePct2nd: number;
  prizePct3rd: number;
};

const DEFAULT_LEAGUE_CONFIG: DghLeagueConfig = {
  prizePoolPerGw: 0,
  feePerGw: 100,
  relegationFine: 50,
  relegationEnabled: true,
  currency: "ETB",
  prizePct1st: 50,
  prizePct2nd: 30,
  prizePct3rd: 20,
};

export type DghManagerMetadata = { entryId: number; managerName: string; teamName: string };

export async function saveDghManagerMetadata(rows: DghManagerMetadata[]) {
  if (!rows.length) return;
  const database = await db();
  const updatedAt = Date.now();
  for (const row of rows) {
    await database.runAsync(
      `INSERT INTO dgh_manager_metadata(entry_id,manager_name,team_name,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(entry_id) DO UPDATE SET manager_name=excluded.manager_name,team_name=excluded.team_name,updated_at=excluded.updated_at`,
      row.entryId, row.managerName, row.teamName, updatedAt,
    );
  }
}

export async function getDghManagerMetadata(): Promise<DghManagerMetadata[]> {
  const database = await db();
  return database.getAllAsync<DghManagerMetadata>(
    `SELECT entry_id as entryId, manager_name as managerName, team_name as teamName FROM dgh_manager_metadata ORDER BY team_name ASC`,
  );
}

export async function saveDghLedgerRows(rows: DghLedgerRow[]) {
  const database = await db();
  const capturedAt = Date.now();
  for (const row of rows) {
    await database.runAsync(
      `INSERT INTO dgh_ledger_gw(event,entry_id,manager_name,team_name,raw_points,transfer_hits,bb_bench_points,tc_extra_points,active_chip,overall_rank,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(event,entry_id) DO UPDATE SET manager_name=excluded.manager_name,team_name=excluded.team_name,raw_points=excluded.raw_points,transfer_hits=excluded.transfer_hits,bb_bench_points=excluded.bb_bench_points,tc_extra_points=excluded.tc_extra_points,active_chip=excluded.active_chip,overall_rank=excluded.overall_rank,captured_at=excluded.captured_at`,
      row.event, row.entryId, row.managerName, row.teamName, row.rawPoints, row.transferHits, row.bbBenchPoints, row.tcExtraPoints, row.activeChip, row.overallRank, capturedAt,
    );
  }
}

export async function getAllDghLedgerRows(): Promise<DghLedgerRow[]> {
  const database = await db();
  const rows = await database.getAllAsync<{
    event: number; entryId: number; managerName: string; teamName: string;
    rawPoints: number; transferHits: number; bbBenchPoints: number; tcExtraPoints: number;
    activeChip: string | null; overallRank: number | null;
  }>(
    `SELECT event, entry_id as entryId, manager_name as managerName, team_name as teamName, raw_points as rawPoints, transfer_hits as transferHits, bb_bench_points as bbBenchPoints, tc_extra_points as tcExtraPoints, active_chip as activeChip, overall_rank as overallRank FROM dgh_ledger_gw ORDER BY event ASC`,
  );
  return rows;
}

export async function getDghLeagueConfig(): Promise<DghLeagueConfig> {
  const database = await db();
  const row = await database.getFirstAsync<{
    prize_pool_per_gw: number; fee_per_gw: number; relegation_fine: number; relegation_enabled: number;
    currency: string; prize_pct_1st: number; prize_pct_2nd: number; prize_pct_3rd: number;
  }>(`SELECT prize_pool_per_gw, fee_per_gw, relegation_fine, relegation_enabled, currency, prize_pct_1st, prize_pct_2nd, prize_pct_3rd FROM dgh_league_config WHERE id = 1`);
  if (!row) return DEFAULT_LEAGUE_CONFIG;
  return {
    prizePoolPerGw: row.prize_pool_per_gw,
    feePerGw: row.fee_per_gw,
    relegationFine: row.relegation_fine,
    relegationEnabled: !!row.relegation_enabled,
    currency: row.currency,
    prizePct1st: row.prize_pct_1st,
    prizePct2nd: row.prize_pct_2nd,
    prizePct3rd: row.prize_pct_3rd,
  };
}

export async function saveDghLeagueConfig(config: DghLeagueConfig) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO dgh_league_config(id,prize_pool_per_gw,fee_per_gw,relegation_fine,relegation_enabled,currency,prize_pct_1st,prize_pct_2nd,prize_pct_3rd,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET prize_pool_per_gw=excluded.prize_pool_per_gw,fee_per_gw=excluded.fee_per_gw,relegation_fine=excluded.relegation_fine,relegation_enabled=excluded.relegation_enabled,currency=excluded.currency,prize_pct_1st=excluded.prize_pct_1st,prize_pct_2nd=excluded.prize_pct_2nd,prize_pct_3rd=excluded.prize_pct_3rd,updated_at=excluded.updated_at`,
    config.prizePoolPerGw, config.feePerGw, config.relegationFine, config.relegationEnabled ? 1 : 0, config.currency, config.prizePct1st, config.prizePct2nd, config.prizePct3rd, Date.now(),
  );
}

export type ManagerOverride = { entryId: number; event: number; feeWaived: boolean; fineWaived: boolean; note: string | null };

export async function getManagerOverrides(): Promise<ManagerOverride[]> {
  const database = await db();
  const rows = await database.getAllAsync<{ entryId: number; event: number; feeWaived: number; fineWaived: number; note: string | null }>(
    `SELECT entry_id as entryId, event, fee_waived as feeWaived, fine_waived as fineWaived, note FROM dgh_manager_overrides`,
  );
  return rows.map((r) => ({ entryId: r.entryId, event: r.event, feeWaived: !!r.feeWaived, fineWaived: !!r.fineWaived, note: r.note }));
}

export async function setManagerOverride(input: ManagerOverride) {
  const database = await db();
  await database.runAsync(
    `INSERT INTO dgh_manager_overrides(entry_id,event,fee_waived,fine_waived,note) VALUES(?,?,?,?,?)
     ON CONFLICT(entry_id,event) DO UPDATE SET fee_waived=excluded.fee_waived,fine_waived=excluded.fine_waived,note=excluded.note`,
    input.entryId, input.event, input.feeWaived ? 1 : 0, input.fineWaived ? 1 : 0, input.note,
  );
}

export type WeeklyAward = { event: number; entryId: number; managerName: string; teamName: string; gwPoints: number; totalPoints: number; rank: number };

export async function saveGameweekSnapshot(input: { event: number; capturedAt?: number; myRank: number | null; myTotal: number | null; myEventPoints: number | null; mySquad: SquadPick[]; standings: StandingsRow[]; rivals: RivalProfile[] }) {
  const database = await db();
  const capturedAt = input.capturedAt ?? Date.now();
  await database.runAsync(`INSERT INTO gw_snapshots(event,captured_at,my_rank,my_total,my_event_points,my_squad_json,standings_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(event) DO UPDATE SET captured_at=excluded.captured_at,my_rank=excluded.my_rank,my_total=excluded.my_total,my_event_points=excluded.my_event_points,my_squad_json=excluded.my_squad_json,standings_json=excluded.standings_json`, input.event, capturedAt, input.myRank, input.myTotal, input.myEventPoints, JSON.stringify(input.mySquad), JSON.stringify(input.standings));
  for (const r of input.rivals) {
    await database.runAsync(`INSERT INTO rival_weekly(event,entry_id,manager_name,team_name,gw_points,total_points,rank,captured_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event,entry_id) DO UPDATE SET manager_name=excluded.manager_name,team_name=excluded.team_name,gw_points=excluded.gw_points,total_points=excluded.total_points,rank=excluded.rank,captured_at=excluded.captured_at`, input.event, r.entryId, r.managerName, r.teamName, r.gameweekPoints, r.totalPoints, r.rank, capturedAt);
  }
}

export async function getWeeklyAwards(limit = 10): Promise<WeeklyAward[]> {
  const database = await db();
  const rows = await database.getAllAsync<WeeklyAward>(`SELECT event,entry_id as entryId,manager_name as managerName,team_name as teamName,gw_points as gwPoints,total_points as totalPoints,rank FROM rival_weekly ORDER BY event DESC, gwPoints DESC`);
  const best: WeeklyAward[] = [];
  for (const row of rows) {
    if (!best.some((x) => x.event === row.event)) best.push(row);
    if (best.length >= limit) break;
  }
  return best;
}

export async function saveWeeklyRows(rows: WeeklyAward[]) {
  const database = await db();
  for (const row of rows) {
    await database.runAsync(`INSERT INTO rival_weekly(event,entry_id,manager_name,team_name,gw_points,total_points,rank,captured_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(event,entry_id) DO UPDATE SET manager_name=excluded.manager_name,team_name=excluded.team_name,gw_points=excluded.gw_points,total_points=excluded.total_points,rank=excluded.rank,captured_at=excluded.captured_at`, row.event, row.entryId, row.managerName, row.teamName, row.gwPoints, row.totalPoints, row.rank, Date.now());
  }
}

export async function getAllWeeklyRows(): Promise<WeeklyAward[]> {
  const database = await db();
  return database.getAllAsync<WeeklyAward>(`SELECT event,entry_id as entryId,manager_name as managerName,team_name as teamName,gw_points as gwPoints,total_points as totalPoints,rank FROM rival_weekly ORDER BY event ASC, gwPoints DESC`);
}

export async function getSeenTransferKey(entryId: number): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ transfer_key: string }>(`SELECT transfer_key FROM rival_transfers_seen WHERE entry_id=?`, entryId);
  return row?.transfer_key ?? null;
}

export async function setSeenTransferKey(entryId: number, transferKey: string) {
  const database = await db();
  await database.runAsync(`INSERT INTO rival_transfers_seen(entry_id,transfer_key,seen_at) VALUES(?,?,?) ON CONFLICT(entry_id) DO UPDATE SET transfer_key=excluded.transfer_key,seen_at=excluded.seen_at`, entryId, transferKey, Date.now());
}

// ---- Price-alert de-duplication: a player/direction pair is only pushed once
// until the direction flips (e.g. RISE -> FALL), never re-notified every refresh. ----

export async function getSeenPriceDirection(playerId: number): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ direction: string }>(`SELECT direction FROM price_alerts_seen WHERE player_id=?`, playerId);
  return row?.direction ?? null;
}

export async function setSeenPriceDirection(playerId: number, direction: string) {
  const database = await db();
  // A single row per player (not per player+direction) so a RISE->FALL flip
  // overwrites rather than accumulates; PRIMARY KEY is (player_id, direction)
  // to also let a repeat of the SAME direction no-op via the seen check above,
  // so clear the opposite direction's row first to avoid stale duplicates.
  await database.runAsync(`DELETE FROM price_alerts_seen WHERE player_id=? AND direction!=?`, playerId, direction);
  await database.runAsync(`INSERT INTO price_alerts_seen(player_id,direction,seen_at) VALUES(?,?,?) ON CONFLICT(player_id,direction) DO UPDATE SET seen_at=excluded.seen_at`, playerId, direction, Date.now());
}

// ---- Deadline-alert scheduling guard: avoid re-scheduling (cancel + re-create)
// the same gameweek's local notifications on every foreground data load. ----

export async function getScheduledDeadlineEvent(): Promise<number | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ event: number }>(`SELECT event FROM deadline_alerts_scheduled ORDER BY scheduled_at DESC LIMIT 1`);
  return row?.event ?? null;
}

export async function setScheduledDeadlineEvent(event: number) {
  const database = await db();
  await database.runAsync(`DELETE FROM deadline_alerts_scheduled`);
  await database.runAsync(`INSERT INTO deadline_alerts_scheduled(event,scheduled_at) VALUES(?,?)`, event, Date.now());
}
