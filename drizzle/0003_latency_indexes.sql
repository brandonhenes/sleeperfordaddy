-- Latency-focused indexes for common read paths across all user-facing tabs.

CREATE INDEX IF NOT EXISTS idx_users_username_lower
  ON users ((LOWER(username)));

CREATE INDEX IF NOT EXISTS idx_players_master_full_name_lower
  ON players_master ((LOWER(full_name)));

CREATE INDEX IF NOT EXISTS idx_roster_players_owner_league
  ON roster_players (owner_id, league_id);

CREATE INDEX IF NOT EXISTS idx_roster_players_player
  ON roster_players (player_id);

CREATE INDEX IF NOT EXISTS idx_roster_players_league_player
  ON roster_players (league_id, player_id);

CREATE INDEX IF NOT EXISTS idx_rosters_owner_league
  ON rosters (owner_id, league_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fantasycalc_daily'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fc_daily_snapshot_player_lower
             ON fantasycalc_daily (snapshot_date, (LOWER(player_name)))';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ktc_values'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ktc_values_player_lower
             ON ktc_values ((LOWER(player_name)))';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dynastyprocess_values'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dp_values_player_lower
             ON dynastyprocess_values ((LOWER(player_name)))';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recommendations'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recommendations_date_direction
             ON recommendations (rec_date, direction)';
  END IF;
END
$$;
