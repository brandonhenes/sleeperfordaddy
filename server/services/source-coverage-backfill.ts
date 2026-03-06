import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface FantasyCalcBackfillStats {
  crosswalkMatched: number;
  suffixMatched: number;
  totalMatched: number;
}

export async function backfillFantasyCalcSleeperIds(): Promise<FantasyCalcBackfillStats> {
  const r1 = await db.execute(sql`
    WITH updated AS (
      UPDATE fantasycalc_daily fc
      SET sleeper_id = cw.sleeper_id
      FROM player_id_crosswalk cw
      WHERE fc.sleeper_id IS NULL
        AND LOWER(fc.player_name) = LOWER(cw.name)
        AND cw.sleeper_id IS NOT NULL
        AND cw.sleeper_id != ''
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  const crosswalkMatched = (r1 as unknown as { count: number }[])[0]?.count ?? 0;

  const r2 = await db.execute(sql`
    WITH updated AS (
      UPDATE fantasycalc_daily fc
      SET sleeper_id = pm.player_id
      FROM players_master pm
      WHERE fc.sleeper_id IS NULL
        AND fc.is_pick = false
        AND fc.position IN ('QB','RB','WR','TE')
        AND (
          LOWER(pm.full_name) = LOWER(REGEXP_REPLACE(fc.player_name, '\s+(Jr|Sr|II|III|IV|V)\.?$', '', 'i'))
          OR LOWER(fc.player_name) = LOWER(REGEXP_REPLACE(pm.full_name, '\s+(Jr|Sr|II|III|IV|V)\.?$', '', 'i'))
        )
        AND pm.position = fc.position
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  const suffixMatched = (r2 as unknown as { count: number }[])[0]?.count ?? 0;

  return {
    crosswalkMatched,
    suffixMatched,
    totalMatched: crosswalkMatched + suffixMatched,
  };
}

export async function backfillKtcSleeperIds(): Promise<number> {
  const rows = await db.execute(sql`
    WITH updated AS (
      UPDATE ktc_values ktc
      SET sleeper_id = pm.player_id
      FROM players_master pm
      WHERE (ktc.sleeper_id IS NULL OR ktc.sleeper_id = '')
        AND ktc.is_pick = false
        AND LOWER(ktc.player_name) = LOWER(pm.full_name)
        AND ktc.position = pm.position
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  return (rows as unknown as { count: number }[])[0]?.count ?? 0;
}
