// ─── Sleeper API response types ───

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  sport: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, unknown>;
  previous_league_id: string | null;
  avatar: string | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
    playoff_rank?: number;
    final_rank?: number;
    rank?: number;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters_points: number[];
  starters: string[];
  players: string[];
  players_points: Record<string, number>;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string; // "trade" | "waiver" | "free_agent" | "commissioner"
  status: string;
  status_updated: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: SleeperTradedPick[];
  waiver_budget: Array<{ sender: number; receiver: number; amount: number }>;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  creator?: string;
  created?: number;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  type: string;
  status: string;
  season: string;
  settings: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  draft_order?: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
}

export interface SleeperDraftPick {
  player_id: string;
  picked_by: string;
  roster_id: number;
  round: number;
  draft_slot: number;
  pick_no: number;
  metadata: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    [key: string]: unknown;
  };
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  position: string | null;
  team: string | null;
  age?: number;
  status?: string;
  fantasy_positions?: string[];
}

export interface SleeperNflState {
  season: string;
  season_type: string;
  week: number;
  leg: number;
  display_week: number;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: Record<string, unknown>;
}

export interface SleeperBracketMatch {
  r: number; // round
  m: number; // match
  t1: number | null; // team 1 roster_id (or null if TBD)
  t2: number | null; // team 2 roster_id (or null if TBD)
  w: number | null; // winner roster_id
  l: number | null; // loser roster_id
  t1_from?: { w?: number; l?: number }; // which match team 1 came from
  t2_from?: { w?: number; l?: number }; // which match team 2 came from
}

// ─── App types ───

export interface LeagueGroup {
  group_id: string;
  name: string;
  leagues: string[]; // league_ids ordered by season
  min_season: number;
  max_season: number;
  is_active: boolean;
}

export interface SyncJob {
  id: number;
  username: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
}

export interface H2HRecord {
  opponent_user_id: string;
  opponent_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  seasons: number[];
}

export interface PlayerExposure {
  player_id: string;
  player_name: string;
  position: string;
  team: string | null;
  league_count: number;
  total_leagues: number;
  exposure_pct: number;
  leagues: string[];
}

export interface TradeAsset {
  transaction_id: string;
  league_id: string;
  league_name: string;
  season: string;
  week: number;
  timestamp: number;
  side: "gave" | "received";
  roster_id: number;
  user_id: string;
  user_name: string;
  player_id?: string;
  player_name?: string;
  pick_season?: string;
  pick_round?: number;
  pick_original_owner?: string;
}

export interface ScoutingReport {
  user_id: string;
  username: string;
  display_name: string;
  strength: number; // avg points per week
  consistency: number; // std deviation of weekly scores
  roster_churn: number; // total transactions
  trading_activity: number; // number of trades
  record: { wins: number; losses: number; ties: number };
}

export interface OverviewData {
  user: SleeperUser;
  seasons: Record<string, LeagueSeason[]>;
  totals: { wins: number; losses: number; ties: number; leagues: number };
}

export interface LeagueSeason {
  league_id: string;
  league_name: string;
  season: string;
  group_id: string | null;
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  finish_place: number | null;
  finish_source: string;
  total_rosters: number;
  avatar: string | null;
}

// ─── Trade Calculator ───

export interface TradeAssetInput {
  type: "player" | "pick";
  player_id?: string;
  pick_season?: string;
  pick_round?: number;
  pick_tier?: "early" | "mid" | "late";
  pick_slot?: number | null;
  pick_label?: string;
  pick_original_owner_id?: number | null;
}

export interface TradeValuationAdjustmentReason {
  stage: "base_market_value" | "league_market_value" | "context_trade_value";
  label: string;
  reason: string;
  amount?: number | null;
}

export interface TradeValuationWarning {
  type:
    | "missing_data"
    | "fallback"
    | "duplicate_asset"
    | "empty_side"
    | "league_settings"
    | "validation";
  severity: "info" | "warning" | "block";
  message: string;
  asset_key?: string | null;
  side?: "sideA" | "sideB" | "both" | null;
}

export interface TradeEvaluation {
  sideA: {
    assets: EvaluatedAsset[];
    total_edge: number;
    total_base_market_value: number;
    total_league_market_value: number;
    total_context_trade_value: number;
    total_adjusted_trade_value: number;
    total_trade_power: number;
    package_penalty_pct: number;
    asset_count: number;
    adjustment_explanation?: string | null;
  };
  sideB: {
    assets: EvaluatedAsset[];
    total_edge: number;
    total_base_market_value: number;
    total_league_market_value: number;
    total_context_trade_value: number;
    total_adjusted_trade_value: number;
    total_trade_power: number;
    package_penalty_pct: number;
    asset_count: number;
    adjustment_explanation?: string | null;
  };
  delta: number; // positive = sideA wins by trade power
  delta_edge: number; // positive = sideA wins by raw edge
  fairness: "fair" | "slight_edge" | "lopsided";
  winner: "sideA" | "sideB" | "even";
  value_adjustment_side: "sideA" | "sideB" | "none";
  value_adjustment: number;
  percent_gap: number;
  best_asset_side: "sideA" | "sideB" | "even";
  best_asset_edge: number;
  best_asset_market_value: number;
  consolidation_warning: string | null;
  needed_to_even: {
    side: "sideA" | "sideB" | "none";
    tradePowerGap: number;
    suggestedEdgeScore: number | null;
    marketValue: number | null;
    edgeEquivalent: number | null;
    label: string;
  };
  scoring_context_label: string | null;
  healthCheck: TradeHealthWarning[];
  valuation_explanations?: string[];
  warnings?: TradeValuationWarning[];
  missing_data_warnings?: TradeValuationWarning[];
  duplicate_asset_warnings?: TradeValuationWarning[];
  empty_side_warnings?: TradeValuationWarning[];
}

export interface TradePickBreakdown {
  season: string;
  round: number;
  pickSlot: number;
  tier: "early" | "mid" | "late";
  baseEdgeValue: number;
  futureYearDiscount: number;
  classStrengthModifier: number;
  finalValue: number;
  projectedProspect: string | null;
  prospectTier: number | null;
  pickLabel: string;
}

export interface PickValue {
  season: string;
  round: number;
  pickSlot: number;
  originalOwnerRosterId: number | null;
  currentOwnerRosterId: number | null;
  tier: "early" | "mid" | "late";
  baseEdgeValue: number;
  futureYearDiscount: number;
  classStrengthModifier: number;
  finalValue: number;
  projectedProspect: string | null;
  prospectTier: number | null;
  pickLabel: string;
}

export interface RookieADP {
  season: string;
  playerName: string;
  position: string;
  college: string | null;
  adpRank: number;
  adpHigh: number | null;
  adpLow: number | null;
  tier: number;
  nflTeam: string | null;
  nflDraftRound: number | null;
  nflDraftPick: number | null;
  nflDraftCapitalGrade: string | null;
  landingSpotGrade: string | null;
  edgeEquivalent: number | null;
  source: string | null;
  updatedAt: string | null;
}

export interface EvaluatedAsset {
  asset_id?: string | null;
  asset_key?: string;
  asset_name?: string;
  asset_type?: "player" | "pick";
  player_id: string | null;
  position: string | null;
  label: string;
  edge_score: number;
  base_market_value?: number;
  league_market_value?: number;
  context_trade_value?: number;
  market_value_source?: "raw_sources" | "edge_fallback";
  source_market_values?: {
    fc: number | null;
    ktc: number | null;
    dp: number | null;
    edge_fallback: number;
  };
  trade_power: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  league_adjusted_score: number | null;
  scoring_delta_ppg: number | null;
  scoring_multiplier?: number | null;
  lineup_scarcity_multiplier?: number | null;
  ppg?: number | null;
  adjustment_reasons?: TradeValuationAdjustmentReason[];
  fallback_warnings?: string[];
  source_agreement: "high" | "medium" | "low";
  pick_breakdown?: TradePickBreakdown | null;
}

export interface TradeHealthWarning {
  type: "block" | "warning";
  rule: string;
  message: string;
}

// ─── Trade Finder ───

export interface TradeSuggestion {
  partner: {
    roster_id: number;
    display_name: string;
    archetype: string;
    compatibility_score: number;
    compatibility_reason: string;
    bias_flags: string[];
    preferred_structure: string;
    total_trades: number;
    recent_trades: number;
  };
  packages: TradePackage[];
}

export type TradeOpportunityType =
  | "buy_target"
  | "sell_player"
  | "consolidate"
  | "deconsolidate"
  | "need_based"
  | "player_plus_pick"
  | "pick_sweetener"
  | "pick_swap";

export type TradePackageQualityLabel = "premium" | "solid" | "speculative" | "poor";
export type TradePackageQualityTier = "strong" | "speculative" | "low_confidence";

export interface TradePackageRankingComponents {
  valuation_edge: number;
  roster_fit: number;
  opponent_need: number;
  acceptance_likelihood: number;
  package_quality: number;
  liquidity: number;
  risk: number;
  diversity: number;
  total: number;
}

export interface TradePackage {
  type: "balanced" | "consolidation" | "picks_heavy" | "player_plus_pick";
  trade_type: "1-for-1" | "player-plus-pick" | "2-for-1" | "pick-package";
  label: string;
  opportunity_type?: TradeOpportunityType;
  package_quality_label?: TradePackageQualityLabel;
  quality_tier?: TradePackageQualityTier;
  is_pick_only?: boolean;
  has_anchor_asset?: boolean;
  addresses_my_need?: boolean;
  addresses_their_need?: boolean;
  you_send: TradePackageAsset[];
  you_receive: TradePackageAsset[];
  send_total: number; // trade power
  receive_total: number; // trade power
  delta: number; // trade power delta
  send_edge: number;
  receive_edge: number;
  delta_edge: number;
  package_penalty_pct_send: number;
  package_penalty_pct_receive: number;
  send_base_market_value?: number;
  receive_base_market_value?: number;
  send_league_market_value?: number;
  receive_league_market_value?: number;
  send_context_trade_value?: number;
  receive_context_trade_value?: number;
  valuation_edge?: number;
  valuation_percent_gap?: number;
  valuation_warnings?: TradeValuationWarning[];
  valuation_explanations?: string[];
  fairness: "fair" | "slight_edge" | "lopsided";
  roster_fit_reason?: string;
  opponent_need_reason?: string;
  acceptance_reason?: string;
  risk_reason?: string;
  ranking_components?: TradePackageRankingComponents;
  why_you_do_it: string;
  why_they_accept: string;
  sweetener_hint: string | null;
  acceptance: {
    probability: number;
    label: "Likely" | "Possible" | "Unlikely" | "Hard";
    accept_reasons: string[];
    reject_reasons: string[];
  } | null;
  healthCheck: TradeHealthWarning[];
}

export interface TradePackageAsset {
  asset_id?: string | null;
  asset_key?: string;
  asset_name?: string;
  player_id?: string | null;
  asset_type: "player" | "pick";
  pick_season?: string;
  pick_round?: number;
  pick_tier?: "early" | "mid" | "late";
  pick_slot?: number | null;
  pick_original_owner_id?: number | null;
  label: string;
  position: string | null;
  edge_score: number;
  base_market_value?: number;
  league_market_value?: number;
  context_trade_value?: number;
  market_value_source?: "raw_sources" | "edge_fallback";
  source_market_values?: {
    fc: number | null;
    ktc: number | null;
    dp: number | null;
    edge_fallback: number;
  };
  trade_power: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  league_adjusted_score: number | null;
  scoring_delta_ppg: number | null;
  scoring_multiplier?: number | null;
  lineup_scarcity_multiplier?: number | null;
  ppg?: number | null;
  adjustment_reasons?: TradeValuationAdjustmentReason[];
  fallback_warnings?: string[];
  source_agreement: "high" | "medium" | "low";
  pick_breakdown?: TradePickBreakdown | null;
}

// ─── League History ───

export interface TeamValueSnapshot {
  league_id: string;
  roster_id: number;
  owner_id: string;
  snapshot_date: string;
  total_edge: number;
  starter_edge: number;
  draft_capital_edge: number;
  archetype: string;
}

export interface LeagueHistoryData {
  group_id: string;
  group_name: string;
  seasons: LeagueHistorySeason[];
}

export interface LeagueHistorySeason {
  season: number;
  league_id: string;
  teams: LeagueHistoryTeam[];
}

export interface LeagueHistoryTeam {
  owner_id: string;
  display_name: string;
  wins: number;
  losses: number;
  fpts: number;
  finish_place: number | null;
  snapshots: TeamValueSnapshot[];
}

// ─── Injury Tracker ───

export interface InjuredPlayerView {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
  injury_type?: string | null;
  injury_date?: string | null;
  expected_return_weeks?: number | null;
  expected_return_date?: string | null;
  estimated_healthy_date?: string | null;
  return_label?: string | null;
  avg_recovery_weeks?: number | null;
  recovery_pace?: string | null;
  notes?: string | null;
  status?: string | null;
  fc_current?: number | null;
  fc_at_injury?: number | null;
  is_buying_window?: boolean | null;
  injury_status: string; // "Out", "Doubtful", "Questionable", "IR", "PUP"
  injury_body_part: string | null;
  injury_start_date: string | null;
  estimated_return_week: number | null;
  estimated_return_date: string | null;
  league_count: number;
  total_leagues: number;
  exposure_pct: number;
  current_edge_score: number;
  pre_injury_edge_score: number | null;
  value_change_pct: number | null;
}

export interface BuyingWindow {
  player: InjuredPlayerView;
  opportunity_score: number; // 0-100, higher = better buy
  buy_reasons: string[];
  risk_factors: string[];
  leagues_to_target: { league_id: string; league_name: string; owner_display_name: string }[];
}

export interface ProspectProfile {
  player_name: string;
  position: string | null;
  school: string | null;
  tier: string | null;
  fp_rank: number | null;
  fantasypros_rank: number | null;
  consensus_comp: string | null;
  all_comps: Array<{ comp: string; date: string; source: string }> | null;
  key_strengths: string[] | null;
  key_concerns: string[] | null;
  scouting_notes: string | null;
  fp_scouting_notes: string | null;
  total_mentions: number | null;
  last_update_summary: string | null;
  age: number | null;
  notes: string | null;
  height: string | null;
  weight: string | null;
  draft_capital: string | null;
  landing_spot: string | null;
  current_adp: string | null;
  combine_40: string | null;
  combine_vertical: string | null;
  combine_shuttle: string | null;
  combine_bench: string | null;
  pffRank?: number | null;
  pffGrade2025?: number | null;
  pffGrade2024?: number | null;
  pffWaa2025?: number | null;
  dolittleScore?: number | null;
  dolittleGames?: number | null;
  dolittleConfidence?: "HIGH" | "MED" | "LOW" | null;
  consensusAdp?: string | null;
  consensusAdpRank?: number | null;
  nflTeam?: string | null;
  nflPick?: number | null;
  status?: string | null;
  last_updated?: string | null;
  zoneRoutePff?: string | null;
  manRoutePff?: string | null;
  slotRate?: string | null;
  outsideRate?: string | null;
  disagreementFlag?: string | null;
}

export interface InjuryRecoveryBaseline {
  injury_type: string;
  position: string;
  avg_weeks_out: number;
  min_weeks: number;
  max_weeks: number;
}

// ─── What Would It Take (Reverse Finder) ───

export interface AcquisitionTarget {
  player_id: string;
  player_name: string;
  position: string;
  team: string | null;
  age: number | null;
  edge_score: number;
}

export interface AcquisitionOpportunity {
  // Which league and who owns the target
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  owner: {
    roster_id: number;
    display_name: string;
    archetype: string;
  };

  // How hard is it to get this player from this owner?
  difficulty: AcquisitionDifficulty;

  // What packages could work?
  packages: AcquisitionOffer[];

  // What has this player previously traded for in this league?
  trade_history: TradeComp[];
}

export interface AcquisitionDifficulty {
  score: number; // 0-100
  label: "easy" | "moderate" | "hard" | "near_impossible";
  reasons: string[];
  // Breakdown of what makes it easy or hard
  positional_importance: string; // "Their WR1 (starter)" or "Their RB4 (bench depth)"
  replacement_gap: number; // edge score gap to their next man up
  archetype_resistance: string; // "Rebuilder - likely willing to sell veterans"
}

export interface AcquisitionOffer {
  type: "balanced" | "consolidation" | "picks_heavy" | "overpay";
  label: string;
  acceptance_likelihood: number; // 0-100
  you_send: TradePackageAsset[];
  you_receive: TradePackageAsset[]; // just the target player
  send_total: number;
  receive_total: number;
  delta: number;
  fairness: "fair" | "slight_edge" | "lopsided";
  sweetener_hint: string | null;

  // Feature #9: Full opponent perspective
  their_perspective: OpponentPerspective;
}

export interface OpponentPerspective {
  // Roster impact
  lineup_before: { position: string; player: string; edge_score: number }[];
  lineup_after: { position: string; player: string; edge_score: number }[];
  positions_upgraded: string[];
  positions_downgraded: string[];
  net_starter_value_change: number;

  // Strategic fit
  archetype_analysis: string; // "As a Rebuilder, gaining 2 first-round picks accelerates their rebuild timeline by a full year."
  needs_addressed: string[]; // ["Fills QB hole", "Adds RB depth"]
  needs_still_open: string[]; // ["Still weak at TE"]

  // Bottom line
  verdict: "likely_accept" | "might_accept" | "unlikely" | "no_chance";
  verdict_reason: string;
}

export interface TradeComp {
  league_name: string;
  date: string;
  gave: string[];
  received: string[];
}

export interface AcquisitionResult {
  target: AcquisitionTarget;
  opportunities: AcquisitionOpportunity[];
  summary: string; // "Ja'Marr Chase is owned in 8 of your leagues. Easiest to acquire from Team X in League Y (Rebuilder, he's their WR2)."
}

// ─── Shop a Player ───

export interface ShopPlayerResult {
  player_id: string;
  player_name: string;
  position: string;
  edge_score: number;
  leagues_owned: number;
  opportunities: ShopOpportunity[];
}

export interface ShopOpportunity {
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  your_archetype: string;
  opportunity_score: number;
  path: "even_swap" | "they_add_pick" | "you_upgrade" | "sell_for_pieces";
  path_label: string;
  you_send: EvaluatedAsset[];
  you_receive: EvaluatedAsset[];
  from_team: string;
  from_archetype: string;
  buyer_motivation: string;
  motivation_score: number;
  send_total_tp: number;
  receive_total_tp: number;
  delta_tp: number;
  send_base_market_value?: number;
  receive_base_market_value?: number;
  send_league_market_value?: number;
  receive_league_market_value?: number;
  send_context_trade_value?: number;
  receive_context_trade_value?: number;
  valuation_edge?: number;
  valuation_percent_gap?: number;
  valuation_warnings?: TradeValuationWarning[];
  valuation_explanations?: string[];
  fairness: "fair" | "slight_edge" | "lopsided";
  why_you_do_it: string;
  why_they_accept: string;
  acceptance: {
    probability: number;
    label: "Likely" | "Possible" | "Unlikely" | "Hard";
    accept_reasons: string[];
    reject_reasons: string[];
  };
  healthCheck: TradeHealthWarning[];
}

export interface RecentTrade {
  transactionId: string;
  season: string;
  date: string;
  partnerRosterId: number | null;
  partnerDisplayName: string | null;
  acquired: string[];
  sold: string[];
}

export interface OpponentProfile {
  leagueId: string;
  rosterId: number;
  ownerId: string | null;
  displayName: string;
  season: string;
  totalTrades: number;
  totalWaiverMoves: number;
  activityLevel: "hyperactive" | "active" | "moderate" | "passive" | "inactive";
  positionsAcquired: Record<string, number>;
  positionsSold: Record<string, number>;
  waiverTargets: Record<string, number>;
  avgAgeAcquired: number | null;
  avgAgeSold: number | null;
  ageBias: "youth_chaser" | "leans_young" | "neutral" | "leans_vet" | "win_now_buyer";
  picksAcquired: number;
  picksSold: number;
  pickTendency: "hoarder" | "accumulator" | "neutral" | "seller" | "spender";
  recentTrades: RecentTrade[];
  tradePartners: Record<string, number>;
  profiledAt: string;
  seasonsAnalyzed: number;
  isStale: boolean;
}

export interface ExploitAngle {
  strategy: string;
  offer: string;
  reasoning: string;
  tendencyExploited: string;
  confidence: "high" | "medium" | "low";
}

export interface OpponentProfilesResponse {
  profiles: OpponentProfile[];
  myRosterId: number | null;
  leagueName: string;
  lastProfiled: string | null;
  isStale: boolean;
}

// Trade History / Execution Tracker

export interface TradeGrade {
  trade_id: string;
  league_id: string;
  league_name: string;
  trade_date: string;
  trade_timestamp: number;
  gave: TradeGradedAsset[];
  received: TradeGradedAsset[];
  gave_total_then: number;
  gave_total_now: number;
  received_total_then: number;
  received_total_now: number;
  net_value_change: number;
  grade: "win" | "loss" | "push";
  grade_magnitude: number;
  partner_names: string[];
}

export interface TradeGradedAsset {
  asset_type: "player" | "pick";
  asset_key: string;
  label: string;
  position: string | null;
  value_at_trade: number | null;
  value_now: number | null;
  value_change: number;
}

export interface TradeHistoryStats {
  total_trades: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  total_value_gained: number;
  avg_value_per_trade: number;
  best_trade: TradeGrade | null;
  worst_trade: TradeGrade | null;
  by_position: { position: string; trades: number; net_value: number }[];
  by_league: { league_id: string; league_name: string; trades: number; win_rate: number; net_value: number }[];
  by_month: { month: string; trades: number; win_rate: number; net_value: number }[];
}

export interface TradeHistoryResponse {
  trades: TradeGrade[];
  stats: TradeHistoryStats;
}

export interface TradeAgingRow {
  trade_id: string;
  trade_date: string;
  days_since_trade: number;
  direction: "gave" | "received";
  asset_type: "player" | "pick";
  asset_key: string;
  asset_name: string | null;
  position: string | null;
  fc_value_at_trade: number | null;
  fc_value_now: number | null;
  fc_value_change: number | null;
  league_id: string;
  league_name: string;
}

// Trade Intelligence

export interface TradeOutcome {
  id: number;
  trade_id: string;
  league_id: string;
  league_name?: string | null;
  roster_id: number;
  counterparty_roster_id: number;
  value_gave_at_trade: number;
  value_received_at_trade: number;
  value_gave_current: number;
  value_received_current: number;
  value_delta_pct: number;
  value_verdict: "won" | "lost" | "push" | null;
  wins_with_trade: number;
  wins_without_trade: number;
  win_impact: number;
  median_weeks_with: number;
  median_weeks_without: number;
  median_impact: number;
  points_received_assets: number;
  points_gave_assets: number;
  starter_rate_pct: number;
  trade_date: string;
  seasons_graded: number;
  is_final: boolean;
  graded_through_date?: string | null;
  value_source: string;
  scoring_adjusted: boolean;
}

export interface TradeOutcomeSeason {
  trade_outcome_id: number;
  season_number: number;
  season_year: number;
  wins_with: number;
  wins_without: number;
  win_impact: number;
  median_with: number;
  median_without: number;
  points_received: number;
  points_gave: number;
  value_delta_pct: number;
  key_assets_received: string[];
  key_assets_gave: string[];
}

export interface TradeAssetWithPlayer {
  trade_id: string;
  league_id: string;
  roster_id: number;
  direction: "received" | "gave";
  asset_type: "player" | "pick";
  asset_key: string;
  asset_name: string | null;
  player_name: string | null;
  position: string | null;
  team: string | null;
  drafted_player_name: string | null;
  drafted_position: string | null;
}

export interface TradeIntelligenceRoster {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  display_name: string;
}

export interface TradeIntelligenceChainSeason {
  league_id: string;
  season: number;
}

export interface TradeIntelligenceChain {
  root_id: string;
  name: string;
  seasons: TradeIntelligenceChainSeason[];
}

export interface OwnerProfile {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  total_trades: number;
  trade_win_rate_value: number;
  trade_win_rate_impact: number;
  cumulative_win_impact: number;
  cumulative_value_delta: number;
  avg_acquired_age: number | null;
  youth_vet_bias: "youth" | "balanced" | "veteran";
  top_positions_acquired: string[];
  trades_per_season: number;
  most_common_partner_roster_id?: number | null;
  soft_target_score: number;
  best_trade_id: string | null;
  best_trade_summary: string | null;
  worst_trade_id: string | null;
  worst_trade_summary: string | null;
}

export interface TradeIntelligenceLeagueResponse {
  outcomes: TradeOutcome[];
  assets: TradeAssetWithPlayer[];
  rosters: TradeIntelligenceRoster[];
}

export interface TradeIntelligenceTradeDetailResponse {
  outcomes: TradeOutcome[];
  seasons: TradeOutcomeSeason[];
  assets: TradeAssetWithPlayer[];
}

export interface TradeIntelligenceLeaderboardResponse {
  profiles: OwnerProfile[];
}

export interface TradeIntelligenceUserTradesResponse {
  outcomes: TradeOutcome[];
  assets: TradeAssetWithPlayer[];
  rosters: TradeIntelligenceRoster[];
}

