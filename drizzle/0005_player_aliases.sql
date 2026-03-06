CREATE TABLE IF NOT EXISTS player_aliases (
  player_id text NOT NULL,
  alias text NOT NULL,
  source text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_player_aliases_alias_lower
  ON player_aliases (LOWER(alias));
