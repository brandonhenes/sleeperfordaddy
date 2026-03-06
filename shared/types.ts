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
}

export interface TradeEvaluation {
  sideA: { assets: EvaluatedAsset[]; total_edge: number };
  sideB: { assets: EvaluatedAsset[]; total_edge: number };
  delta: number; // positive = sideA wins
  fairness: "fair" | "slight_edge" | "lopsided";
}

export interface EvaluatedAsset {
  label: string;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  source_agreement: "high" | "medium" | "low";
}

// ─── Trade Finder ───

export interface TradeSuggestion {
  partner: {
    roster_id: number;
    display_name: string;
    archetype: string;
    compatibility_score: number;
    compatibility_reason: string;
  };
  packages: TradePackage[];
}

export interface TradePackage {
  type: "balanced" | "consolidation" | "picks_heavy";
  label: string;
  you_send: TradePackageAsset[];
  you_receive: TradePackageAsset[];
  send_total: number;
  receive_total: number;
  delta: number;
  fairness: "fair" | "slight_edge" | "lopsided";
  why_you_do_it: string;
  why_they_accept: string;
  sweetener_hint: string | null;
}

export interface TradePackageAsset {
  asset_type: "player" | "pick";
  label: string;
  position: string | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  source_agreement: "high" | "medium" | "low";
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

