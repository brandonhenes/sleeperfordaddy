import {
  pgTable,
  text,
  serial,
  integer,
  real,
  date,
  timestamp,
  uuid,
  boolean as pgBoolean,
  primaryKey,
  bigint,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Core Tables ───

export const users = pgTable("users", {
  user_id: text("user_id").primaryKey(),
  username: text("username").notNull().unique(),
  display_name: text("display_name").notNull(),
  avatar: text("avatar"),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
});

export const leagues = pgTable(
  "leagues",
  {
    league_id: text("league_id").primaryKey(),
    name: text("name").notNull(),
    season: integer("season").notNull(),
    sport: text("sport").notNull(),
    status: text("status").notNull(),
    total_rosters: integer("total_rosters"),
    previous_league_id: text("previous_league_id"),
    league_type: integer("league_type"),
    group_id: text("group_id"),
    raw_json: text("raw_json"),
    roster_positions: text("roster_positions").array(),
    draft_rounds: integer("draft_rounds").default(4),
    scoring_settings: jsonb("scoring_settings"),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_leagues_season").on(table.season),
    index("idx_leagues_group").on(table.group_id),
  ]
);

export const rosters = pgTable(
  "rosters",
  {
    league_id: text("league_id").notNull(),
    owner_id: text("owner_id").notNull(),
    roster_id: integer("roster_id").notNull(),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    fpts: real("fpts").default(0),
    fpts_against: real("fpts_against").default(0),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.league_id, table.owner_id] }),
    index("idx_rosters_owner").on(table.owner_id),
  ]
);

export const roster_players = pgTable(
  "roster_players",
  {
    league_id: text("league_id").notNull(),
    owner_id: text("owner_id").notNull(),
    player_id: text("player_id").notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.league_id, table.owner_id, table.player_id],
    }),
  ]
);

// ─── Junction Tables ───

export const user_leagues = pgTable(
  "user_leagues",
  {
    user_id: text("user_id").notNull(),
    league_id: text("league_id").notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.league_id] }),
    index("idx_user_leagues_user").on(table.user_id),
  ]
);

export const league_users = pgTable(
  "league_users",
  {
    league_id: text("league_id").notNull(),
    user_id: text("user_id").notNull(),
    display_name: text("display_name"),
    team_name: text("team_name"),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.league_id, table.user_id] }),
    index("idx_league_users_user").on(table.user_id),
  ]
);

export const league_traded_picks = pgTable(
  "league_traded_picks",
  {
    league_id: text("league_id").notNull(),
    season: text("season").notNull(),
    round: integer("round").notNull(),
    roster_id: integer("roster_id").notNull(),
    owner_id: integer("owner_id").notNull(),
    previous_owner_id: integer("previous_owner_id").notNull(),
  },
  (table) => [index("idx_traded_picks_league").on(table.league_id)]
);

export const league_draft_orders = pgTable(
  "league_draft_orders",
  {
    league_id: text("league_id").notNull(),
    season: text("season").notNull(),
    roster_id: integer("roster_id").notNull(),
    draft_position: integer("draft_position").notNull(),
  },
  (table) => [index("idx_draft_orders_league").on(table.league_id, table.season)]
);

// ─── Sync Tracking ───

export const sync_jobs = pgTable(
  "sync_jobs",
  {
    job_id: text("job_id").primaryKey(),
    username: text("username").notNull(),
    status: text("status").notNull(), // "pending" | "running" | "completed" | "failed"
    step: text("step"),
    detail: text("detail"),
    leagues_total: integer("leagues_total").default(0),
    leagues_done: integer("leagues_done").default(0),
    started_at: bigint("started_at", { mode: "number" }).notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
    error: text("error"),
  },
  (table) => [index("idx_sync_jobs_username").on(table.username)]
);

// ─── H2H ───

export const h2h_season = pgTable(
  "h2h_season",
  {
    league_id: text("league_id").notNull(),
    my_owner_id: text("my_owner_id").notNull(),
    opp_owner_id: text("opp_owner_id").notNull(),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    pf: real("pf").default(0),
    pa: real("pa").default(0),
    games: integer("games").default(0),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.league_id, table.my_owner_id, table.opp_owner_id],
    }),
  ]
);

// ─── Trades ───

export const trades = pgTable(
  "trades",
  {
    transaction_id: text("transaction_id").primaryKey(),
    league_id: text("league_id").notNull(),
    status: text("status").notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    roster_ids: text("roster_ids"), // JSON stringified array
    adds: text("adds"), // JSON stringified
    drops: text("drops"), // JSON stringified
    draft_picks: text("draft_picks"), // JSON stringified
    waiver_budget: text("waiver_budget"), // JSON stringified
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_trades_league").on(table.league_id)]
);

export const trade_assets = pgTable(
  "trade_assets",
  {
    id: serial("id").primaryKey(),
    trade_id: text("trade_id").notNull(),
    league_id: text("league_id").notNull(),
    season: integer("season").notNull(),
    created_at_ms: bigint("created_at_ms", { mode: "number" }).notNull(),
    roster_id: integer("roster_id").notNull(),
    counterparty_roster_ids: text("counterparty_roster_ids"),
    asset_type: text("asset_type").notNull(), // "player" | "pick" | "waiver_budget"
    asset_key: text("asset_key").notNull(),
    asset_name: text("asset_name"),
    direction: text("direction").notNull(), // "gave" | "received"
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_trade_assets_trade").on(table.trade_id),
    index("idx_trade_assets_league").on(table.league_id),
    index("idx_trade_assets_roster").on(table.roster_id),
    index("idx_trade_assets_asset").on(table.asset_type, table.asset_key),
    uniqueIndex("idx_trade_assets_unique").on(
      table.trade_id,
      table.roster_id,
      table.asset_key,
      table.direction
    ),
  ]
);

// ─── Player Data ───

export const players_master = pgTable("players_master", {
  player_id: text("player_id").primaryKey(),
  full_name: text("full_name"),
  first_name: text("first_name"),
  last_name: text("last_name"),
  position: text("position"),
  team: text("team"),
  status: text("status"),
  age: integer("age"),
  years_exp: integer("years_exp"),
  injury_status: text("injury_status"),
  injury_body_part: text("injury_body_part"),
  injury_start_date: text("injury_start_date"),
  injury_notes: text("injury_notes"),
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
});

export const player_id_crosswalk = pgTable(
  "player_id_crosswalk",
  {
    sleeper_id: text("sleeper_id").primaryKey(),
    name: text("name"),
    position: text("position"),
    team: text("team"),
    mfl_id: text("mfl_id"),
    ktc_id: text("ktc_id"),
    fantasypros_id: text("fantasypros_id"),
    espn_id: text("espn_id"),
    yahoo_id: text("yahoo_id"),
    gsis_id: text("gsis_id"),
    updated_at: text("updated_at"),
  },
  (table) => [
    index("idx_crosswalk_mfl").on(table.mfl_id),
    index("idx_crosswalk_ktc").on(table.ktc_id),
    index("idx_crosswalk_gsis").on(table.gsis_id),
  ]
);

export const player_seasonal_stats = pgTable(
  "player_seasonal_stats",
  {
    sleeper_id: text("sleeper_id").notNull(),
    season: integer("season").notNull(),
    games_played: integer("games_played").default(0),
    receptions_pg: real("receptions_pg").default(0),
    targets_pg: real("targets_pg").default(0),
    carries_pg: real("carries_pg").default(0),
    passing_tds_pg: real("passing_tds_pg").default(0),
    rushing_tds_pg: real("rushing_tds_pg").default(0),
    receiving_tds_pg: real("receiving_tds_pg").default(0),
    passing_yds_pg: real("passing_yds_pg").default(0),
    rushing_yds_pg: real("rushing_yds_pg").default(0),
    receiving_yds_pg: real("receiving_yds_pg").default(0),
    passing_attempts_pg: real("passing_attempts_pg").default(0),
    total_receptions: integer("total_receptions").default(0),
    total_carries: integer("total_carries").default(0),
    total_passing_tds: integer("total_passing_tds").default(0),
    total_rushing_tds: integer("total_rushing_tds").default(0),
    total_receiving_tds: integer("total_receiving_tds").default(0),
  },
  (table) => [
    primaryKey({ columns: [table.sleeper_id, table.season] }),
    index("idx_seasonal_stats_season").on(table.season),
  ]
);

export const fantasycalc_daily = pgTable(
  "fantasycalc_daily",
  {
    id: bigint("id", { mode: "number" }),
    snapshot_date: date("snapshot_date"),
    player_name: text("player_name"),
    position: text("position"),
    team: text("team"),
    dynasty_value: integer("dynasty_value"),
    trend_30day: integer("trend_30day"),
    overall_rank: integer("overall_rank"),
    is_rookie: pgBoolean("is_rookie"),
    is_pick: pgBoolean("is_pick"),
    sleeper_id: text("sleeper_id"),
    redraft_value: integer("redraft_value"),
  },
  (table) => [index("idx_fc_sleeper_id").on(table.sleeper_id)]
);

export const ktc_values = pgTable("ktc_values", {
  sleeper_id: text("sleeper_id").primaryKey(),
  player_name: text("player_name"),
  position: text("position"),
  team: text("team"),
  age_decimal: real("age_decimal"),
  value_1qb: integer("value_1qb"),
  value_sf: integer("value_sf"),
  rank_1qb: integer("rank_1qb"),
  rank_sf: integer("rank_sf"),
  redraft_1qb: integer("redraft_1qb"),
  redraft_sf: integer("redraft_sf"),
  is_pick: pgBoolean("is_pick"),
  pick_season: integer("pick_season"),
  pick_round: integer("pick_round"),
  pick_tier: text("pick_tier"),
  scraped_at: timestamp("scraped_at", { withTimezone: true }),
});

export const dynastyprocess_values = pgTable("dynastyprocess_values", {
  sleeper_id: text("sleeper_id").primaryKey(),
  player_name: text("player_name"),
  position: text("position"),
  team: text("team"),
  age: integer("age"),
  value_1qb: integer("value_1qb"),
  value_2qb: integer("value_2qb"),
  ecr_1qb: real("ecr_1qb"),
  ecr_2qb: real("ecr_2qb"),
  redraft_1qb: integer("redraft_1qb"),
  redraft_2qb: integer("redraft_2qb"),
  redraft_ecr_1qb: real("redraft_ecr_1qb"),
  redraft_ecr_2qb: real("redraft_ecr_2qb"),
  is_pick: pgBoolean("is_pick"),
  scrape_date: text("scrape_date"),
  synced_at: timestamp("synced_at", { withTimezone: true }),
});

export const player_aliases = pgTable(
  "player_aliases",
  {
    player_id: text("player_id").notNull(),
    alias: text("alias").notNull(),
    source: text("source").notNull().default("generated"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.player_id, table.alias] }),
    index("idx_player_aliases_alias_lower").on(table.alias),
  ]
);

// ─── Exposure ───

export const user_exposure_summary = pgTable(
  "user_exposure_summary",
  {
    username: text("username").primaryKey(),
    season: integer("season").notNull(),
    active_league_count: integer("active_league_count").notNull(),
    exposure_json: jsonb("exposure_json").notNull(), // Map<player_id, {count, pct, pos}>
    last_synced_at: bigint("last_synced_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_exposure_season").on(table.season)]
);

// ─── Season Summary ───

export const league_season_summary = pgTable(
  "league_season_summary",
  {
    league_id: text("league_id").notNull(),
    user_id: text("user_id").notNull(),
    season: integer("season").notNull(),
    roster_id: integer("roster_id"),
    finish_place: integer("finish_place"),
    regular_rank: integer("regular_rank"),
    playoff_finish: text("playoff_finish"),
    source: text("source"), // "bracket" | "roster_settings" | "unknown"
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    pf: real("pf"),
    pa: real("pa"),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.league_id, table.user_id] }),
    index("idx_season_summary_user").on(table.user_id),
    index("idx_season_summary_season").on(table.season),
  ]
);

// ─── Group Overrides ───

export const group_overrides = pgTable("group_overrides", {
  league_id: text("league_id").primaryKey(),
  forced_group_id: text("forced_group_id").notNull(),
});

// ─── League History ───

export const team_value_snapshots = pgTable(
  "team_value_snapshots",
  {
    league_id: text("league_id").notNull(),
    roster_id: integer("roster_id").notNull(),
    owner_id: text("owner_id").notNull(),
    snapshot_date: text("snapshot_date").notNull(),
    total_edge_score: real("total_edge_score").default(0),
    starter_edge_score: real("starter_edge_score").default(0),
    draft_capital_edge: real("draft_capital_edge").default(0),
    archetype: text("archetype"),
  },
  (table) => [
    primaryKey({ columns: [table.league_id, table.roster_id, table.snapshot_date] }),
    index("idx_team_snapshots_owner").on(table.owner_id),
    index("idx_team_snapshots_date").on(table.snapshot_date),
  ]
);

// ─── Injury Tracker ───

export const injury_recovery_baselines = pgTable(
  "injury_recovery_baselines",
  {
    injury_type: text("injury_type").notNull(),
    position: text("position").notNull(),
    avg_weeks_out: integer("avg_weeks_out").notNull(),
    min_weeks: integer("min_weeks").notNull(),
    max_weeks: integer("max_weeks").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.injury_type, table.position] }),
  ]
);

export const player_value_snapshots = pgTable(
  "player_value_snapshots",
  {
    player_id: text("player_id").notNull(),
    snapshot_date: text("snapshot_date").notNull(),
    edge_score: real("edge_score"),
    fc_value: real("fc_value"),
    ktc_value: real("ktc_value"),
    dp_value: real("dp_value"),
  },
  (table) => [
    primaryKey({ columns: [table.player_id, table.snapshot_date] }),
    index("idx_player_value_snapshots_date").on(table.snapshot_date),
  ]
);

export const opponent_profiles = pgTable(
  "opponent_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    league_id: text("league_id").notNull(),
    roster_id: integer("roster_id").notNull(),
    owner_id: text("owner_id"),
    display_name: text("display_name"),
    season: text("season").notNull(),
    total_trades: integer("total_trades").default(0),
    total_waiver_moves: integer("total_waiver_moves").default(0),
    activity_level: text("activity_level"),
    positions_acquired: jsonb("positions_acquired").default({}),
    positions_sold: jsonb("positions_sold").default({}),
    waiver_targets: jsonb("waiver_targets").default({}),
    avg_age_acquired: real("avg_age_acquired"),
    avg_age_sold: real("avg_age_sold"),
    age_bias: text("age_bias"),
    picks_acquired: integer("picks_acquired").default(0),
    picks_sold: integer("picks_sold").default(0),
    pick_tendency: text("pick_tendency"),
    recent_trades: jsonb("recent_trades").default([]),
    trade_partners: jsonb("trade_partners").default({}),
    profiled_at: timestamp("profiled_at", { withTimezone: true }).defaultNow(),
    seasons_analyzed: integer("seasons_analyzed").default(1),
  },
  (table) => [
    index("idx_opp_profile_league").on(table.league_id),
    index("idx_opp_profile_activity").on(table.activity_level),
    uniqueIndex("idx_opp_profile_unique").on(
      table.league_id,
      table.roster_id,
      table.season
    ),
  ]
);

export const rookie_adp = pgTable(
  "rookie_adp",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    season: text("season").notNull(),
    player_name: text("player_name").notNull(),
    position: text("position").notNull(),
    college: text("college"),
    adp_rank: real("adp_rank").notNull(),
    adp_high: integer("adp_high"),
    adp_low: integer("adp_low"),
    tier: integer("tier").notNull(),
    nfl_team: text("nfl_team"),
    nfl_draft_round: integer("nfl_draft_round"),
    nfl_draft_pick: integer("nfl_draft_pick"),
    nfl_draft_capital_grade: text("nfl_draft_capital_grade"),
    landing_spot_grade: text("landing_spot_grade"),
    edge_equivalent: real("edge_equivalent"),
    source: text("source"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_rookie_adp_season").on(table.season),
    index("idx_rookie_adp_tier").on(table.tier),
    uniqueIndex("idx_rookie_adp_unique").on(table.season, table.player_name),
  ]
);

export const pick_values = pgTable(
  "pick_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    season: text("season").notNull(),
    round: integer("round").notNull(),
    pick_tier: text("pick_tier").notNull(),
    league_size: integer("league_size").notNull(),
    format: text("format").notNull(),
    edge_equivalent: real("edge_equivalent").notNull(),
    fc_equivalent: real("fc_equivalent"),
    class_strength_modifier: real("class_strength_modifier").default(1.0),
    notes: text("notes"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_pick_values_season").on(table.season),
    uniqueIndex("idx_pick_values_unique").on(
      table.season,
      table.round,
      table.pick_tier,
      table.league_size,
      table.format
    ),
  ]
);

export const prospectProfiles = pgTable("prospect_profiles", {
  playerName: text("player_name").primaryKey(),
  position: text("position"),
  school: text("school"),
  tier: text("tier"),
  fantasyprosRank: integer("fantasypros_rank"),
  age: real("age"),
  notes: text("notes"),
  consensusComp: text("consensus_comp"),
  allComps: jsonb("all_comps"),
  keyStrengths: jsonb("key_strengths"),
  keyConcerns: jsonb("key_concerns"),
  scoutingNotes: text("scouting_notes"),
  fpScoutingNotes: text("fp_scouting_notes"),
  totalMentions: integer("total_mentions"),
  lastUpdateSummary: text("last_update_summary"),
  height: text("height"),
  weight: text("weight"),
  draftCapital: text("draft_capital"),
  landingSpot: text("landing_spot"),
  currentAdp: text("current_adp"),
  combine40: text("combine_40"),
  combineVertical: text("combine_vertical"),
  combineShuttle: text("combine_shuttle"),
  combineBench: text("combine_bench"),
  pffRank: integer("pff_rank"),
  pffGrade2025: real("pff_grade_2025"),
  pffGrade2024: real("pff_grade_2024"),
  pffGrade2023: real("pff_grade_2023"),
  pffWaa2025: real("pff_waa_2025"),
  pffWaa2024: real("pff_waa_2024"),
  pffSnaps2025: integer("pff_snaps_2025"),
  dolittleScore: real("dolittle_score"),
  dolittleGames: integer("dolittle_games"),
  dolittleConfidence: text("dolittle_confidence"),
  dolittleYards: integer("dolittle_yards"),
  dolittleTds: integer("dolittle_tds"),
  dolittleRecPg: real("dolittle_rec_pg"),
  nflTeam: text("nfl_team"),
  nflPick: integer("nfl_pick"),
  schemeFitScore: real("scheme_fit_score"),
  targetCompetitionScore: real("target_competition_score"),
  qbQualityScore: real("qb_quality_score"),
  projectedOffensePassAtt: integer("projected_offense_pass_att"),
  consensusAdp: text("consensus_adp"),
  consensusAdpRank: integer("consensus_adp_rank"),
  status: text("status"),
  lastUpdated: text("last_updated"),
});

