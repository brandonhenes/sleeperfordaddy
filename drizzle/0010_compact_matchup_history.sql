CREATE TABLE IF NOT EXISTS "weekly_team_results" (
  "league_id" text NOT NULL,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "roster_id" integer NOT NULL,
  "player_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "starter_ids" text[] DEFAULT '{}'::text[] NOT NULL,
  "opponent_roster_id" integer,
  "opponent_total" real,
  "league_median" real,
  "roster_total" real,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_team_results_pkey" PRIMARY KEY ("league_id", "season", "week", "roster_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league_scoring_profiles" (
  "profile_id" serial PRIMARY KEY,
  "settings_hash" text NOT NULL UNIQUE,
  "scoring_settings" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "league_scoring_profile_assignments" (
  "league_id" text PRIMARY KEY,
  "profile_id" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scoring_profile_assignments_profile"
  ON "league_scoring_profile_assignments" USING btree ("profile_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_scoring_profile_points" (
  "profile_id" integer NOT NULL,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "points" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_scoring_profile_points_pkey" PRIMARY KEY ("profile_id", "season", "week")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_league_point_overrides" (
  "league_id" text NOT NULL,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "points" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_league_point_overrides_pkey" PRIMARY KEY ("league_id", "season", "week")
);
--> statement-breakpoint
ALTER TABLE "weekly_team_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "league_scoring_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "league_scoring_profile_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "weekly_scoring_profile_points" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "weekly_league_point_overrides" ENABLE ROW LEVEL SECURITY;
