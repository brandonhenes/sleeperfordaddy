import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";

export async function snapshotKtcDaily(): Promise<void> {
  await db.execute(sql`
    INSERT INTO ktc_daily (
      snapshot_date,
      sleeper_id,
      player_name,
      position,
      team,
      value_sf,
      value_1qb,
      rank_sf,
      rank_1qb,
      is_pick
    )
    SELECT
      CURRENT_DATE,
      sleeper_id,
      player_name,
      position,
      team,
      value_sf,
      value_1qb,
      rank_sf,
      rank_1qb,
      is_pick
    FROM ktc_values
    ON CONFLICT (snapshot_date, sleeper_id) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      position = EXCLUDED.position,
      team = EXCLUDED.team,
      value_sf = EXCLUDED.value_sf,
      value_1qb = EXCLUDED.value_1qb,
      rank_sf = EXCLUDED.rank_sf,
      rank_1qb = EXCLUDED.rank_1qb,
      is_pick = EXCLUDED.is_pick
  `);
}

export async function snapshotDpDaily(): Promise<void> {
  await db.execute(sql`
    INSERT INTO dp_daily (
      snapshot_date,
      sleeper_id,
      player_name,
      position,
      team,
      value_2qb,
      value_1qb,
      ecr_2qb,
      ecr_1qb,
      is_pick
    )
    SELECT
      CURRENT_DATE,
      sleeper_id,
      player_name,
      position,
      team,
      value_2qb,
      value_1qb,
      ecr_2qb,
      ecr_1qb,
      is_pick
    FROM dynastyprocess_values
    ON CONFLICT (snapshot_date, sleeper_id) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      position = EXCLUDED.position,
      team = EXCLUDED.team,
      value_2qb = EXCLUDED.value_2qb,
      value_1qb = EXCLUDED.value_1qb,
      ecr_2qb = EXCLUDED.ecr_2qb,
      ecr_1qb = EXCLUDED.ecr_1qb,
      is_pick = EXCLUDED.is_pick
  `);
}
