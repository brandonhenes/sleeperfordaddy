import {
  pgTable,
  text,
  serial,
  integer,
  real,
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
    group_id: text("group_id"),
    raw_json: text("raw_json"),
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
  updated_at: bigint("updated_at", { mode: "number" }).notNull(),
});

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
