import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";

// ─── Types ───

export interface ArbitrageGap {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  edge_score: number;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  owned_leagues: { league_id: string; league_name: string }[];
  free_leagues: { league_id: string; league_name: string }[];
  owned_count: number;
  free_count: number;
}

// ─── Main ───

export async function getFreeAgentGaps(username: string): Promise<ArbitrageGap[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const rows = await db.execute(sql`
    WITH user_latest_season AS (
      SELECT MAX(l.season) AS season
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      WHERE ul.user_id = ${userId}
    ),
    current_leagues AS (
      SELECT l.league_id
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      JOIN user_latest_season uls ON l.season = uls.season
      WHERE ul.user_id = ${userId}
    ),
    league_sync AS (
      SELECT rp.league_id, COUNT(DISTINCT rp.owner_id) AS synced_owners
      FROM roster_players rp
      JOIN current_leagues cl ON rp.league_id = cl.league_id
      GROUP BY rp.league_id
    ),
    my_leagues AS (
      SELECT DISTINCT rp.league_id
      FROM roster_players rp
      JOIN current_leagues cl ON rp.league_id = cl.league_id
      JOIN leagues l ON rp.league_id = l.league_id
      JOIN league_sync ls ON rp.league_id = ls.league_id
      WHERE rp.owner_id = ${userId}
        AND ls.synced_owners >= l.total_rosters
    ),
    my_players AS (
      SELECT DISTINCT rp.player_id
      FROM roster_players rp
      JOIN current_leagues cl ON rp.league_id = cl.league_id
      WHERE rp.owner_id = ${userId}
    ),
    rostered_anywhere AS (
      SELECT DISTINCT rp.league_id, rp.player_id
      FROM roster_players rp
      JOIN my_leagues ml ON rp.league_id = ml.league_id
    ),
    gaps AS (
      SELECT mp.player_id, ml.league_id AS gap_league_id
      FROM my_players mp
      CROSS JOIN my_leagues ml
      WHERE NOT EXISTS (
        SELECT 1 FROM rostered_anywhere ra
        WHERE ra.league_id = ml.league_id AND ra.player_id = mp.player_id
      )
    ),
    owned_in AS (
      SELECT rp.player_id, rp.league_id, l.name AS league_name
      FROM roster_players rp
      JOIN my_leagues ml ON rp.league_id = ml.league_id
      JOIN leagues l ON rp.league_id = l.league_id
      WHERE rp.owner_id = ${userId}
    ),
    free_agg AS (
      SELECT g.player_id,
        json_agg(json_build_object('league_id', g.gap_league_id, 'league_name', l.name)) AS free_leagues
      FROM gaps g
      JOIN leagues l ON g.gap_league_id = l.league_id
      GROUP BY g.player_id
    ),
    owned_agg AS (
      SELECT oi.player_id,
        json_agg(json_build_object('league_id', oi.league_id, 'league_name', oi.league_name)) AS owned_leagues,
        COUNT(*)::int AS owned_count
      FROM owned_in oi
      GROUP BY oi.player_id
    )
    SELECT
      pm.player_id,
      pm.full_name,
      pm.position,
      pm.team,
      COALESCE(fa.free_leagues, '[]'::json) AS free_leagues,
      COALESCE(oa.owned_leagues, '[]'::json) AS owned_leagues,
      COALESCE(oa.owned_count, 0) AS owned_count
    FROM free_agg fa
    JOIN players_master pm ON fa.player_id = pm.player_id
    LEFT JOIN owned_agg oa ON fa.player_id = oa.player_id
    WHERE COALESCE(oa.owned_count, 0) >= 2
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);

  type Row = {
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    free_leagues: { league_id: string; league_name: string }[];
    owned_leagues: { league_id: string; league_name: string }[];
    owned_count: number;
  };
  const rawRows = rows as unknown as Row[];
  if (rawRows.length === 0) return [];

  // Edge Scores via composite values (SF default for cross-league)
  const playerIds = rawRows.map((r) => r.player_id);
  const compMap = await getCompositeValues(playerIds, "sf");

  return rawRows
    .map((r) => {
      const comp = compMap.get(r.player_id);
      const free = r.free_leagues ?? [];
      const owned = r.owned_leagues ?? [];
      return {
        player_id: r.player_id,
        full_name: r.full_name,
        position: r.position,
        team: r.team,
        edge_score: comp?.edge_score ?? 0,
        fc_value: comp?.fc_value ?? null,
        ktc_value: comp?.ktc_value ?? null,
        dp_value: comp?.dp_value ?? null,
        owned_leagues: owned,
        free_leagues: free,
        owned_count: owned.length,
        free_count: free.length,
      };
    })
    .filter((r) => r.edge_score > 0)
    .sort((a, b) => b.edge_score - a.edge_score);
}
