/**
 * DGH FPL Manager — Central Configuration
 * Single source of truth for the league/entry this app is locked to.
 * DO NOT change these at runtime from arbitrary user input — the app's
 * validation layer (lib/validation.ts) checks every fetch against these.
 */

export const LEAGUE_ID = 170174;
export const MY_ENTRY_ID = 871842;

export const APP_NAME = "DGH FPL Manager";

export const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

// How long cached data is considered "fresh" before a background refetch,
// per data type (ms). Live/gameweek data refreshes much faster than
// season-long reference data like bootstrap-static.
export const CACHE_TTL_MS = {
  bootstrap: 10 * 60 * 1000, // 10 min — teams/players/rules rarely change intra-day
  live: 60 * 1000, // 60s — live scores during a GW
  standings: 3 * 60 * 1000, // 3 min
  picks: 3 * 60 * 1000,
  fixtures: 10 * 60 * 1000,
  entry: 5 * 60 * 1000,
  history: 10 * 60 * 1000, // 10 min — season history is reused across refreshes; live scoring uses the live feed.
  // Per-player round-by-round history only changes for a player currently
  // playing a live fixture; for everyone else (the vast majority of TES's
  // unique-element set on any given refresh) it is fully static until their
  // next kickoff. 10 min meant TES re-fetched every finished player's whole
  // history on almost every enrichment pass. 60 min cuts that repeat-fetch
  // volume ~6x while still catching a live player's updated total within an
  // hour — TES is a best-effort/background signal, not a live scoreline.
  elementSummary: 60 * 60 * 1000,
};

// DGH hit rules used by the transfer engine. A hit is only recommended when
// projected net gain clears these thresholds against the DGH risk posture.
export const DGH_RULES = {
  hitCost: 4, // points per extra transfer beyond free transfers
  maxHitsConsidered: 3, // evaluate 0, -4, -8, -12
  minNetGainForHit: 2.0, // don't recommend a -4 unless EV net gain exceeds this
  minNetGainForDoubleHit: 5.0, // stricter bar for -8
  minNetGainForTripleHit: 9.0, // stricter bar for -12+
  leadingPositionThreshold: 1, // rank <= this => "leading" posture (defensive/shields)
  chasingGapPointsForDifferentials: 15, // gap to leader beyond which differentials are favored
};

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CONFIDENCE_LEVELS = ["CONFIRMED", "SUPPORTED", "PROBABLE", "SPECULATIVE"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
