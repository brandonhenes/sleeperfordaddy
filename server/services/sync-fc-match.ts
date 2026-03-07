import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface FcMatchStats {
  total_fc_rows: number;
  matched_via_crosswalk: number;
  matched_via_name: number;
  still_unmatched: number;
  unmatched_names: string[];
}

async function countUpdated(statement: ReturnType<typeof sql>) {
  const rows = await db.execute(sql`
    WITH updated AS (${statement} RETURNING 1)
    SELECT COUNT(*)::int AS cnt FROM updated
  `);
  return (rows as unknown as { cnt: number }[])[0]?.cnt ?? 0;
}

export async function matchFcSleeperIds(): Promise<FcMatchStats> {
  console.log("[fc-match] Starting FC sleeper_id backfill...");

  const countRows = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM fantasycalc_daily
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      AND is_pick = false
      AND (sleeper_id IS NULL OR sleeper_id = '')
  `);
  const totalMissing = (countRows as unknown as { cnt: number }[])[0]?.cnt ?? 0;
  console.log(`[fc-match] ${totalMissing} FC rows missing sleeper_id`);

  const matched1 = await countUpdated(sql`
    UPDATE fantasycalc_daily fc
    SET sleeper_id = cw.sleeper_id
    FROM player_id_crosswalk cw
    WHERE LOWER(fc.player_name) = LOWER(cw.name)
      AND fc.is_pick = false
      AND (fc.sleeper_id IS NULL OR fc.sleeper_id = '')
  `);
  console.log(`[fc-match] Strategy 1 (crosswalk name): matched ${matched1}`);

  const matched2 = await countUpdated(sql`
    UPDATE fantasycalc_daily fc
    SET sleeper_id = pm.player_id
    FROM players_master pm
    WHERE LOWER(fc.player_name) = LOWER(pm.full_name)
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND fc.is_pick = false
      AND (fc.sleeper_id IS NULL OR fc.sleeper_id = '')
  `);
  console.log(`[fc-match] Strategy 2 (players_master name): matched ${matched2}`);

  const matched3 = await countUpdated(sql`
    UPDATE fantasycalc_daily fc
    SET sleeper_id = pm.player_id
    FROM players_master pm
    WHERE LOWER(REGEXP_REPLACE(fc.player_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
        = LOWER(REGEXP_REPLACE(pm.full_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND fc.is_pick = false
      AND (fc.sleeper_id IS NULL OR fc.sleeper_id = '')
  `);
  console.log(`[fc-match] Strategy 3 (strip suffixes): matched ${matched3}`);

  const unmatchedRows = await db.execute(sql`
    SELECT DISTINCT player_name
    FROM fantasycalc_daily
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      AND is_pick = false
      AND (sleeper_id IS NULL OR sleeper_id = '')
    ORDER BY player_name
    LIMIT 50
  `);
  const unmatchedNames = (unmatchedRows as unknown as { player_name: string }[]).map(
    (row) => row.player_name
  );

  await db.execute(sql`
    UPDATE fantasycalc_daily fc
    SET sleeper_id = matched.sleeper_id
    FROM (
      SELECT DISTINCT player_name, sleeper_id
      FROM fantasycalc_daily
      WHERE sleeper_id IS NOT NULL AND sleeper_id != ''
    ) matched
    WHERE LOWER(fc.player_name) = LOWER(matched.player_name)
      AND (fc.sleeper_id IS NULL OR fc.sleeper_id = '')
  `);

  const finalCount = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM fantasycalc_daily
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      AND is_pick = false
      AND (sleeper_id IS NULL OR sleeper_id = '')
  `);
  const stillUnmatched = (finalCount as unknown as { cnt: number }[])[0]?.cnt ?? 0;

  const stats: FcMatchStats = {
    total_fc_rows: totalMissing,
    matched_via_crosswalk: matched1,
    matched_via_name: matched2 + matched3,
    still_unmatched: stillUnmatched,
    unmatched_names: unmatchedNames,
  };
  console.log("[fc-match] Complete:", stats);
  return stats;
}
