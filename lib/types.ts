// Domain types. Kept intentionally loose (Record/any-ish) where the official
// FPL API response shape is large and only partially consumed, to avoid
// drift breaking the app when FPL adds fields.

export type Bootstrap = {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  total_players: number;
};

export type FplEvent = {
  id: number;
  name: string;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  is_previous: boolean;
  finished: boolean;
  data_checked: boolean;
  average_entry_score: number;
  highest_score: number | null;
};

export type FplTeam = {
  id: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
};

export type FplElementType = {
  id: number;
  singular_name_short: string;
  singular_name: string;
};

export type FplElement = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  total_points: number;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  minutes: number;
  status: "a" | "d" | "i" | "n" | "s" | "u";
  news: string;
  news_added: string | null;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  ep_next: string;
  ep_this: string;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  ict_index: string;
  bps: number;
  bonus: number;
  transfers_in_event: number;
  transfers_out_event: number;
  cost_change_event: number;
  yellow_cards: number;
  red_cards: number;
  starts: number;
  // Official FPL set-piece order fields. null = not on the take list;
  // 1 = first choice, 2 = second choice, etc. Never fabricated — passed
  // straight through from bootstrap-static.
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  penalties_order: number | null;
};

export type FplFixture = {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean | null;
  team_h_score: number | null;
  team_a_score: number | null;
};

export type FplPick = {
  element: number;
  position: number; // 1-15, 1-11 XI, 12-15 bench
  multiplier: number; // 0,1,2,3(TC)
  is_captain: boolean;
  is_vice_captain: boolean;
  // Official picks endpoint fields used for exact transfer cash simulation.
  purchase_price?: number;
  selling_price?: number;
};

export type FplPicksResponse = {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: FplPick[];
};

export type FplEntry = {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string; // team name
  summary_overall_points: number;
  summary_overall_rank: number;
  summary_event_points: number;
  current_event: number;
  last_deadline_bank: number;
  last_deadline_value: number;
  last_deadline_total_transfers: number;
};

export type StandingsRow = {
  id: number; // entry id
  entry: number;
  player_name: string;
  entry_name: string;
  rank: number;
  last_rank: number;
  event_total: number;
  total: number;
  dghGwPoints?: number | null;
  dghTotalPoints?: number | null;
  dghRank?: number | null;
};

export type LiveElementStats = {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  yellow_cards?: number;
  red_cards?: number;
  total_points: number;
  expected_goals?: string;
  expected_assists?: string;
  defensive_contribution?: number;
};

export type LiveResponse = {
  elements: { id: number; stats: LiveElementStats }[];
};

// ---- App-level derived types ----

export type ConfidenceLabel = "CONFIRMED" | "SUPPORTED" | "PROBABLE" | "SPECULATIVE";

export type EnrichedPlayer = {
  id: number;
  webName: string;
  fullName: string;
  teamId: number;
  teamShort: string;
  position: "GKP" | "DEF" | "MID" | "FWD" | string;
  price: number;
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  ownershipPct: number;
  minutes: number;
  status: FplElement["status"];
  availability: {
    chanceThisRound: number | null;
    chanceNextRound: number | null;
    news: string;
    newsAddedAt: string | null;
    confidence: ConfidenceLabel;
  };
  xG: number;
  xA: number;
  xGI: number;
  bonus: number;
  bps: number;
  ictIndex: number;
  epNext: number;
  transfersInEvent: number;
  transfersOutEvent: number;
  priceChangeEvent: number;
  starts: number;
  setPieces: {
    corners: boolean; // true if 1st choice for corners/indirect free kicks
    freeKicks: boolean; // true if 1st choice for direct free kicks
    penalties: boolean; // true if 1st choice penalty taker
  };
};

export type SquadPick = {
  playerId: number;
  player: EnrichedPlayer;
  slot: number; // 1-15
  isXI: boolean;
  isBench: boolean;
  benchOrder: number | null;
  multiplier: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  livePoints: number;
  purchasePrice?: number;
  sellingPrice?: number;
  liveBonus?: number;
  liveMinutes?: number;
  liveYellowCards?: number;
  liveRedCards?: number;
};

export type DataFreshness = {
  bootstrap: number;
  standings: number;
  squad: number;
  live: number | null;
  fixtures: number;
  anyStale: boolean;
};


export type RivalProfile = {
  entryId: number;
  managerName: string;
  teamName: string;
  rank: number;
  lastRank: number;
  movement: number;
  gameweekPoints: number;
  totalPoints: number;
  gapToMe: number; // positive = they're ahead of me
  squad: SquadPick[] | null;
  squadFetchFailed: boolean;
  bank: number | null;
  teamValue: number | null;
  activeChip: string | null;
  transferHits?: number;
  dghGwPoints?: number | null;
  dghTotalPoints?: number | null;
  dghRank?: number | null;
  dghGapToMe?: number | null;
};

// --- DGH Spy / Intel (ported from x402-fpl-api-main's prices.py, news.py,
// rivals.py — see lib/analytics/PORT_NOTES.md for what was and wasn't ported) ---

export type PriceDirection = "RISE" | "FALL";

export type PricePrediction = {
  playerId: number;
  webName: string;
  teamShort: string;
  position: string;
  direction: PriceDirection;
  /** Relative confidence estimate (0-100), NOT a guaranteed prediction — FPL
   * doesn't expose its real threshold. See priceIntel.ts for the caveat. */
  confidencePct: number;
  currentPrice: number;
  netTransfersEvent: number;
  transfersInEvent: number;
  transfersOutEvent: number;
};

export type NewsSeverity = "WATCH" | "CONCERN";

export type NewsAlert = {
  playerId: number;
  webName: string;
  teamShort: string;
  text: string;
  ageLabel: string | null;
  severity: NewsSeverity;
  /** true if this player is in my squad (vs a rival's) */
  isMine: boolean;
  ownerLabel: string; // "My squad" or the rival's team name
};

export type RivalTransferOutCandidate = {
  playerId: number;
  webName: string;
  teamShort: string;
  reason: string;
  urgency: number;
};

export type RivalTransferInCandidate = {
  playerId: number;
  webName: string;
  teamShort: string;
  reason: string;
  score: number;
};

export type RivalTransferHistoryEntry = {
  gw: number;
  inName: string;
  outName: string;
};

export type RivalPrediction = {
  entryId: number;
  managerName: string;
  teamName: string;
  recentTransfers: RivalTransferHistoryEntry[];
  likelyOut: RivalTransferOutCandidate[];
  likelyIn: RivalTransferInCandidate[];
};

export type SpyIntel = {
  computedAt: number;
  priceRisers: PricePrediction[];
  priceFallers: PricePrediction[];
  newsAlerts: NewsAlert[];
  /** Computed for every DGH mini-league rival; unavailable squad/history data
   * yields an empty prediction rather than shrinking the rival pool. */
  rivalPredictions: RivalPrediction[];
};
