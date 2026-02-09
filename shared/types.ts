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
