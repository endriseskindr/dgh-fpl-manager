import type { DghLedgerRow } from "../seasonStore";
import { dghScore } from "./comprehensiveTable";

/** Canonical DGH score projection primitives. No raw/FPL score is returned as DGH. */
export function projectDghGw(row: DghLedgerRow): number {
  return dghScore(row);
}

export function projectDghTotal(rows: DghLedgerRow[]): number {
  return rows.reduce((sum, row) => sum + projectDghGw(row), 0);
}
