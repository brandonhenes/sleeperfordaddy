CREATE TABLE IF NOT EXISTS "player_weekly_stats" (
  "sleeper_id" text NOT NULL,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "stats" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_weekly_stats_pkey" PRIMARY KEY ("sleeper_id", "season", "week")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_player_weekly_stats_season_week" ON "player_weekly_stats" USING btree ("season", "week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_player_weekly_stats_sleeper_season" ON "player_weekly_stats" USING btree ("sleeper_id", "season");
