ALTER TABLE fantasycalc_daily ADD COLUMN IF NOT EXISTS sleeper_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fc_daily_sleeper
  ON fantasycalc_daily (sleeper_id, snapshot_date);
