ALTER TABLE leagues ADD COLUMN IF NOT EXISTS roster_positions jsonb;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_rounds integer DEFAULT 4;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS scoring_settings jsonb;

CREATE TABLE IF NOT EXISTS league_traded_picks (
  league_id text NOT NULL,
  season text NOT NULL,
  round integer NOT NULL,
  roster_id integer NOT NULL,
  owner_id integer NOT NULL,
  previous_owner_id integer NOT NULL,
  PRIMARY KEY (league_id, season, round, roster_id)
);

CREATE INDEX IF NOT EXISTS idx_traded_picks_league ON league_traded_picks (league_id);

CREATE TABLE IF NOT EXISTS league_draft_orders (
  league_id text NOT NULL,
  season text NOT NULL,
  roster_id integer NOT NULL,
  draft_position integer NOT NULL,
  PRIMARY KEY (league_id, season, roster_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_orders_league ON league_draft_orders (league_id, season);
