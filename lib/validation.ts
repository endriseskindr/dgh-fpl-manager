import { LEAGUE_ID, MY_ENTRY_ID } from "./config";
import type { Bootstrap, RivalProfile, SquadPick, StandingsRow } from "./types";

export type ValidationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type ValidationReport = {
  checks: ValidationCheck[];
  allPassed: boolean;
};

export function validateWarRoomData(input: {
  configuredLeagueId: number;
  configuredEntryId: number;
  standings: StandingsRow[];
  gameweek: number | null;
  rivals: RivalProfile[];
  mySquadPickCount: number;
  /** Full squad, when available, powers the 5 extra checks below (squad
   * size, captaincy flags, bench count, price sanity, XI legality). Kept
   * optional so any existing caller passing only mySquadPickCount still
   * compiles — those 5 checks simply report PENDING (not FAIL) if omitted,
   * same convention PerformanceGate uses in dghMetrics.ts. */
  mySquad?: SquadPick[];
}): ValidationReport {
  const checks: ValidationCheck[] = [];

  checks.push({
    id: "league-id",
    label: "Correct league (170174)",
    passed: input.configuredLeagueId === LEAGUE_ID,
    detail: `Configured league ID: ${input.configuredLeagueId}`,
  });

  checks.push({
    id: "entry-id",
    label: "Correct entry (871842)",
    passed: input.configuredEntryId === MY_ENTRY_ID,
    detail: `Configured entry ID: ${input.configuredEntryId}`,
  });

  const meInStandings = input.standings.some((r) => r.entry === MY_ENTRY_ID);
  checks.push({
    id: "me-in-standings",
    label: "My entry present in league standings",
    passed: meInStandings,
    detail: meInStandings ? "Entry 871842 found in standings" : "Entry 871842 missing — league ID or entry ID may be wrong",
  });

  const rivalsExcludeMe = !input.rivals.some((r) => r.entryId === MY_ENTRY_ID);
  checks.push({
    id: "my-entry-not-in-returned-rivals",
    label: "My entry not duplicated in rival list",
    passed: rivalsExcludeMe,
    detail: rivalsExcludeMe ? "Confirmed — self-entry is not present in returned rivals" : "FAILED — self-entry leaked into rivals",
  });

  // Manager exclusions, part 1: every rival entry ID must be unique — a
  // duplicate would silently double-count that manager in ownership %,
  // the mini-league template, ownership EO, and UTI/TTS/FTSI.
  const rivalIds = input.rivals.map((r) => r.entryId);
  const uniqueRivalIds = new Set(rivalIds);
  const rivalsUnique = uniqueRivalIds.size === rivalIds.length;
  checks.push({
    id: "rivals-no-duplicates",
    label: "No duplicate manager entries",
    passed: rivalsUnique,
    detail: rivalsUnique ? `${rivalIds.length} unique rival entries` : `FAILED — ${rivalIds.length - uniqueRivalIds.size} duplicate entry ID(s) found in rivals`,
  });

  const expectedRivalCount = Math.max(0, input.standings.length - 1);
  const rivalsComplete = input.rivals.length === expectedRivalCount;
  checks.push({
    id: "rivals-complete",
    label: "All opponents included",
    passed: rivalsComplete,
    detail: `${input.rivals.length}/${expectedRivalCount} rival entries present`,
  });

  const squadsFetched = input.rivals.filter((r) => r.squad && r.squad.length > 0).length;
  checks.push({
    id: "rival-squads-fetched",
    label: "Rival squads successfully fetched",
    passed: squadsFetched === input.rivals.length,
    detail: `${squadsFetched}/${input.rivals.length} rival squads loaded`,
  });

  checks.push({
    id: "gameweek",
    label: "Current gameweek detected",
    passed: input.gameweek !== null && input.gameweek > 0,
    detail: input.gameweek ? `Gameweek ${input.gameweek}` : "No gameweek resolved",
  });

  checks.push({
    id: "squad-valid",
    label: "My squad has 15 valid picks",
    passed: input.mySquadPickCount === 15,
    detail: `${input.mySquadPickCount}/15 picks loaded`,
  });

  // --- The 5 additional checks that bring this to the full 14-point list ---

  const pending = (id: string, label: string, why: string): ValidationCheck => ({ id, label, passed: false, detail: why });

  if (!input.mySquad || input.mySquad.length === 0) {
    checks.push(pending("squad-size-15", "Squad size is exactly 15", "No squad data supplied to validator"));
    checks.push(pending("xi-size-11", "Starting XI has exactly 11 players", "No squad data supplied to validator"));
    checks.push(pending("bench-size-4", "Bench has exactly 4 players", "No squad data supplied to validator"));
    checks.push(pending("captaincy-flags", "Exactly one captain and one distinct vice-captain", "No squad data supplied to validator"));
    checks.push(pending("price-accuracy", "Squad prices are within a sane FPL range", "No squad data supplied to validator"));
  } else {
    const squad = input.mySquad;

    const squadSizeOk = squad.length === 15;
    checks.push({
      id: "squad-size-15",
      label: "Squad size is exactly 15",
      passed: squadSizeOk,
      detail: `${squad.length}/15 picks in squad`,
    });

    const xi = squad.filter((p) => p.isXI);
    const xiSizeOk = xi.length === 11;
    checks.push({
      id: "xi-size-11",
      label: "Starting XI has exactly 11 players",
      passed: xiSizeOk,
      detail: `${xi.length}/11 XI slots filled`,
    });

    const bench = squad.filter((p) => p.isBench);
    const benchSizeOk = bench.length === 4;
    checks.push({
      id: "bench-size-4",
      label: "Bench has exactly 4 players",
      passed: benchSizeOk,
      detail: `${bench.length}/4 bench slots filled`,
    });

    const captains = squad.filter((p) => p.isCaptain);
    const viceCaptains = squad.filter((p) => p.isViceCaptain);
    const captainDistinctFromVice = captains.length === 1 && viceCaptains.length === 1 && captains[0].playerId !== viceCaptains[0].playerId;
    checks.push({
      id: "captaincy-flags",
      label: "Exactly one captain and one distinct vice-captain",
      passed: captainDistinctFromVice,
      detail: captainDistinctFromVice
        ? `Captain: ${captains[0].player.webName} · Vice: ${viceCaptains[0].player.webName}`
        : `FAILED — ${captains.length} captain flag(s), ${viceCaptains.length} vice-captain flag(s) found (expected exactly 1 each, and they must differ)`,
    });

    // Price accuracy: every squad player's price should sit inside FPL's
    // known real-world bounds (all-time min ~£3.9m for a bench GKP, no
    // outfield player has ever exceeded ~£16m) — catches a corrupted/stale
    // bootstrap price feed without hardcoding this season's exact figures.
    const MIN_SANE_PRICE = 3.5;
    const MAX_SANE_PRICE = 20.0;
    const badPricePlayers = squad.filter((p) => p.player.price < MIN_SANE_PRICE || p.player.price > MAX_SANE_PRICE);
    const priceAccuracyOk = badPricePlayers.length === 0;
    checks.push({
      id: "price-accuracy",
      label: "Squad prices are within a sane FPL range",
      passed: priceAccuracyOk,
      detail: priceAccuracyOk
        ? `All ${squad.length} prices within £${MIN_SANE_PRICE}m–£${MAX_SANE_PRICE}m`
        : `FAILED — ${badPricePlayers.map((p) => `${p.player.webName} (£${p.player.price}m)`).join(", ")} outside sane range`,
    });
  }

  return { checks, allPassed: checks.every((c) => c.passed) };
}

export function assertBootstrapSane(bootstrap: Bootstrap) {
  if (!bootstrap.elements?.length) throw new Error("Bootstrap returned no players — refusing to proceed rather than show fabricated data.");
  if (!bootstrap.events?.length) throw new Error("Bootstrap returned no gameweeks.");
}
