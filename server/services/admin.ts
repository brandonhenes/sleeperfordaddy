import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

/**
 * Recompute composite_tag for all player_exposure rows for a given username.
 * Uses a priority-ordered CASE expression joining fantasycalc_daily for value data.
 */
export async function recomputeTags(
  username: string
): Promise<{ updated: number }> {
  const result = await db.execute(sql`
    UPDATE player_exposure pe
    SET composite_tag = sub.new_tag
    FROM (
      SELECT
        pe2.player_name,
        pe2.username,
        CASE
          WHEN COALESCE(fc.trend_30day, 0) < -200
            THEN 'TRENDING_DOWN'
          WHEN COALESCE(fc.trend_30day, 0) > 150
               AND COALESCE(fc.dynasty_value, 0) >= 1000
            THEN 'TRENDING_UP'
          WHEN (pe2.league_count::float / NULLIF(pe2.total_leagues, 0)) > 0.33
               AND COALESCE(fc.dynasty_value, 0) >= 2000
            THEN 'HIGH_EXPOSURE_RISK'
          WHEN (pe2.league_count::float / NULLIF(pe2.total_leagues, 0)) < 0.15
               AND COALESCE(fc.dynasty_value, 0) >= 5000
            THEN 'LOW_EXPOSURE_UPSIDE'
          WHEN COALESCE(fc.dynasty_value, 0) >= 5000
            THEN 'ACTIVE_STARTER'
          WHEN COALESCE(fc.dynasty_value, 0) < 1000
               AND pe2.league_count >= 3
            THEN 'ROSTER_CLOG'
          WHEN COALESCE(fc.dynasty_value, 0) BETWEEN 1000 AND 4999
               AND ABS(COALESCE(fc.trend_30day, 0)) < 150
            THEN 'BENCH_STASH'
          ELSE 'BENCH_STASH'
        END AS new_tag
      FROM player_exposure pe2
      LEFT JOIN fantasycalc_daily fc
        ON LOWER(pe2.player_name) = LOWER(fc.player_name)
        AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      WHERE LOWER(pe2.username) = LOWER(${username})
    ) sub
    WHERE LOWER(pe.username) = LOWER(${username})
      AND LOWER(pe.player_name) = LOWER(sub.player_name)
      AND pe.username = sub.username
  `);

  const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;

  return { updated };
}
