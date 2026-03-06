ALTER TABLE fantasycalc_daily ADD COLUMN IF NOT EXISTS sleeper_id text;
CREATE INDEX IF NOT EXISTS idx_fc_sleeper_id ON fantasycalc_daily (sleeper_id);
