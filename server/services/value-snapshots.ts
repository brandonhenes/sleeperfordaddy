import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { player_value_snapshots } from "../db/schema.js";
import { getCompositeValues } from "./composite-values.js";

/**
 * Capture current composite scores for all rostered players of a user.
 * One row per player per day (deduped by primary key).
 */
export async function capturePlayerValueSnapshots(userId: string) {
  // Get all distinct player IDs on the user's current rosters
  const rows = await db.execute(sql`
    SELECT DISTINCT rp.player_id
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.owner_id = ${userId}
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND pm.team IS NOT NULL
  `);

  const playerIds = (rows as unknown as { player_id: string }[]).map((r) => r.player_id);
  if (playerIds.length === 0) return;

  const compMap = await getCompositeValues(playerIds, "sf");
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const values = [];
  for (const [pid, comp] of compMap) {
    if (comp.edge_score <= 0) continue;
    values.push({
      player_id: pid,
      snapshot_date: today,
      edge_score: comp.edge_score,
      fc_value: comp.fc_value,
      ktc_value: comp.ktc_value,
      dp_value: comp.dp_value,
    });
  }

  if (values.length === 0) return;

  // Batch upsert
  const BATCH_SIZE = 500;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    await db
      .insert(player_value_snapshots)
      .values(batch)
      .onConflictDoUpdate({
        target: [player_value_snapshots.player_id, player_value_snapshots.snapshot_date],
        set: {
          edge_score: player_value_snapshots.edge_score,
          fc_value: player_value_snapshots.fc_value,
          ktc_value: player_value_snapshots.ktc_value,
          dp_value: player_value_snapshots.dp_value,
        },
      });
  }

  console.log(`[sync] Captured value snapshots for ${values.length} players`);
}
