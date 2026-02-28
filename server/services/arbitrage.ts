import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface FreeAgentLeague {
  league_id: string;
  league_name: string;
}

export interface ArbitrageGap {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  owned_league_count: number;
  total_league_count: number;
  free_agent_leagues: FreeAgentLeague[];
}

/**
 * Find players the user owns in some leagues but are free agents in others.
 * Uses CTEs to compute the gap efficiently.
 */
export async function getFreeAgentGaps(
  username: string
): Promise<ArbitrageGap[]> {
  // Resolve user_id
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const rows = await db.execute(sql`
    WITH my_leagues AS (
      SELECT DISTINCT league_id
      FROM roster_players
      WHERE owner_id = ${userId}
    ),
    my_players AS (
      SELECT DISTINCT rp.player_id, pm.full_name AS player_name
      FROM roster_players rp
      JOIN players_master pm ON rp.player_id = pm.player_id
      WHERE rp.owner_id = ${userId}
    ),
    owned_counts AS (
      SELECT player_id, COUNT(DISTINCT league_id)::int AS owned_league_count
      FROM roster_players
      WHERE owner_id = ${userId}
      GROUP BY player_id
    ),
    rostered_anywhere AS (
      SELECT DISTINCT rp.league_id, rp.player_id
      FROM roster_players rp
      JOIN my_leagues ml ON rp.league_id = ml.league_id
    ),
    gaps AS (
      SELECT
        mp.player_id,
        mp.player_name,
        ml.league_id AS gap_league_id
      FROM my_players mp
      CROSS JOIN my_leagues ml
      WHERE NOT EXISTS (
        SELECT 1 FROM rostered_anywhere ra
        WHERE ra.league_id = ml.league_id AND ra.player_id = mp.player_id
      )
    ),
    gap_agg AS (
      SELECT
        g.player_id,
        g.player_name,
        json_agg(json_build_object(
          'league_id', g.gap_league_id,
          'league_name', l.name
        )) AS free_agent_leagues
      FROM gaps g
      JOIN leagues l ON g.gap_league_id = l.league_id
      GROUP BY g.player_id, g.player_name
    )
    SELECT
      ga.player_name,
      fc.position,
      fc.team,
      fc.dynasty_value::int AS dynasty_value,
      fc.trend_30day::int AS trend_30day,
      oc.owned_league_count,
      (SELECT COUNT(*)::int FROM my_leagues) AS total_league_count,
      ga.free_agent_leagues
    FROM gap_agg ga
    JOIN owned_counts oc ON ga.player_id = oc.player_id
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(ga.player_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE COALESCE(fc.dynasty_value, 0) >= 500
      AND oc.owned_league_count >= 2
    ORDER BY json_array_length(ga.free_agent_leagues) DESC,
             COALESCE(fc.dynasty_value, 0) DESC
  `);

  return rows as unknown as ArbitrageGap[];
}
