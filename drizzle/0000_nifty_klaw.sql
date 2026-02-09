CREATE TABLE "group_overrides" (
	"league_id" text PRIMARY KEY NOT NULL,
	"forced_group_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "h2h_season" (
	"league_id" text NOT NULL,
	"my_owner_id" text NOT NULL,
	"opp_owner_id" text NOT NULL,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"pf" real DEFAULT 0,
	"pa" real DEFAULT 0,
	"games" integer DEFAULT 0,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "h2h_season_league_id_my_owner_id_opp_owner_id_pk" PRIMARY KEY("league_id","my_owner_id","opp_owner_id")
);
--> statement-breakpoint
CREATE TABLE "league_season_summary" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"season" integer NOT NULL,
	"roster_id" integer,
	"finish_place" integer,
	"regular_rank" integer,
	"playoff_finish" text,
	"source" text,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"pf" real,
	"pa" real,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "league_season_summary_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_users" (
	"league_id" text NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"team_name" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "league_users_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"league_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season" integer NOT NULL,
	"sport" text NOT NULL,
	"status" text NOT NULL,
	"total_rosters" integer,
	"previous_league_id" text,
	"group_id" text,
	"raw_json" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players_master" (
	"player_id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"position" text,
	"team" text,
	"status" text,
	"age" integer,
	"years_exp" integer,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_players" (
	"league_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"player_id" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "roster_players_league_id_owner_id_player_id_pk" PRIMARY KEY("league_id","owner_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rosters" (
	"league_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"roster_id" integer NOT NULL,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"fpts" real DEFAULT 0,
	"fpts_against" real DEFAULT 0,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "rosters_league_id_owner_id_pk" PRIMARY KEY("league_id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"status" text NOT NULL,
	"step" text,
	"detail" text,
	"leagues_total" integer DEFAULT 0,
	"leagues_done" integer DEFAULT 0,
	"started_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "trade_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"trade_id" text NOT NULL,
	"league_id" text NOT NULL,
	"season" integer NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"roster_id" integer NOT NULL,
	"counterparty_roster_ids" text,
	"asset_type" text NOT NULL,
	"asset_key" text NOT NULL,
	"asset_name" text,
	"direction" text NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"roster_ids" text,
	"adds" text,
	"drops" text,
	"draft_picks" text,
	"waiver_budget" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_exposure_summary" (
	"username" text PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"active_league_count" integer NOT NULL,
	"exposure_json" jsonb NOT NULL,
	"last_synced_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_leagues" (
	"user_id" text NOT NULL,
	"league_id" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "user_leagues_user_id_league_id_pk" PRIMARY KEY("user_id","league_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar" text,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "idx_season_summary_user" ON "league_season_summary" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_season_summary_season" ON "league_season_summary" USING btree ("season");--> statement-breakpoint
CREATE INDEX "idx_league_users_user" ON "league_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leagues_season" ON "leagues" USING btree ("season");--> statement-breakpoint
CREATE INDEX "idx_leagues_group" ON "leagues" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_rosters_owner" ON "rosters" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_sync_jobs_username" ON "sync_jobs" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_trade_assets_trade" ON "trade_assets" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "idx_trade_assets_league" ON "trade_assets" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_trade_assets_roster" ON "trade_assets" USING btree ("roster_id");--> statement-breakpoint
CREATE INDEX "idx_trade_assets_asset" ON "trade_assets" USING btree ("asset_type","asset_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trade_assets_unique" ON "trade_assets" USING btree ("trade_id","roster_id","asset_key","direction");--> statement-breakpoint
CREATE INDEX "idx_trades_league" ON "trades" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_exposure_season" ON "user_exposure_summary" USING btree ("season");--> statement-breakpoint
CREATE INDEX "idx_user_leagues_user" ON "user_leagues" USING btree ("user_id");