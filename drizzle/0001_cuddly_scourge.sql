CREATE TABLE "injury_recovery_baselines" (
	"injury_type" text NOT NULL,
	"position" text NOT NULL,
	"avg_weeks_out" integer NOT NULL,
	"min_weeks" integer NOT NULL,
	"max_weeks" integer NOT NULL,
	CONSTRAINT "injury_recovery_baselines_injury_type_position_pk" PRIMARY KEY("injury_type","position")
);
--> statement-breakpoint
CREATE TABLE "player_value_snapshots" (
	"player_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"edge_score" real,
	"fc_value" real,
	"ktc_value" real,
	"dp_value" real,
	CONSTRAINT "player_value_snapshots_player_id_snapshot_date_pk" PRIMARY KEY("player_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "team_value_snapshots" (
	"league_id" text NOT NULL,
	"roster_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"total_edge_score" real DEFAULT 0,
	"starter_edge_score" real DEFAULT 0,
	"draft_capital_edge" real DEFAULT 0,
	"archetype" text,
	CONSTRAINT "team_value_snapshots_league_id_roster_id_snapshot_date_pk" PRIMARY KEY("league_id","roster_id","snapshot_date")
);
--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "league_type" integer;--> statement-breakpoint
ALTER TABLE "players_master" ADD COLUMN "injury_status" text;--> statement-breakpoint
ALTER TABLE "players_master" ADD COLUMN "injury_body_part" text;--> statement-breakpoint
ALTER TABLE "players_master" ADD COLUMN "injury_start_date" text;--> statement-breakpoint
ALTER TABLE "players_master" ADD COLUMN "injury_notes" text;--> statement-breakpoint
CREATE INDEX "idx_player_value_snapshots_date" ON "player_value_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_team_snapshots_owner" ON "team_value_snapshots" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_team_snapshots_date" ON "team_value_snapshots" USING btree ("snapshot_date");