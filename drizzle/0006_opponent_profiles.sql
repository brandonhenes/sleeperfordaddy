CREATE TABLE "opponent_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "league_id" text NOT NULL,
  "roster_id" integer NOT NULL,
  "owner_id" text,
  "display_name" text,
  "season" text NOT NULL,
  "total_trades" integer DEFAULT 0,
  "total_waiver_moves" integer DEFAULT 0,
  "activity_level" text,
  "positions_acquired" jsonb DEFAULT '{}'::jsonb,
  "positions_sold" jsonb DEFAULT '{}'::jsonb,
  "waiver_targets" jsonb DEFAULT '{}'::jsonb,
  "avg_age_acquired" real,
  "avg_age_sold" real,
  "age_bias" text,
  "picks_acquired" integer DEFAULT 0,
  "picks_sold" integer DEFAULT 0,
  "pick_tendency" text,
  "recent_trades" jsonb DEFAULT '[]'::jsonb,
  "trade_partners" jsonb DEFAULT '{}'::jsonb,
  "profiled_at" timestamp with time zone DEFAULT now(),
  "seasons_analyzed" integer DEFAULT 1,
  CONSTRAINT "idx_opp_profile_unique" UNIQUE("league_id","roster_id","season")
);
--> statement-breakpoint
CREATE INDEX "idx_opp_profile_league" ON "opponent_profiles" USING btree ("league_id");
--> statement-breakpoint
CREATE INDEX "idx_opp_profile_activity" ON "opponent_profiles" USING btree ("activity_level");
