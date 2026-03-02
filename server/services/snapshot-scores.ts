import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";

/**
 * Snapshot all player Edge Scores to edge_score_history.
 * Designed to run once per day (manually or via cron).
 */
export async function snapshotEdgeScores(): Promise<{ players_saved: number }> {
  // Get all QB/RB/WR/TE player IDs from players_master
  const rows = await db.execute(sql`
    SELECT player_id FROM players_master
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
  `);
  const playerIds = (rows as unknown as { player_id: string }[]).map((r) => r.player_id);
  if (playerIds.length === 0) return { players_saved: 0 };

  // Get composite values (use SF mode for universal scoring)
  const compMap = await getCompositeValues(playerIds, "sf");

  // Build upsert values
  const entries = [...compMap.values()].filter((c) => c.edge_score > 0);
  if (entries.length === 0) return { players_saved: 0 };

  // Batch insert in chunks of 500
  const BATCH = 500;
  let saved = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const values = chunk.map(
      (c) =>
        sql`(${c.sleeper_id}, ${c.edge_score}, ${c.fc_score}, ${c.ktc_score}, ${c.dp_score}, CURRENT_DATE)`
    );
    await db.execute(sql`
      INSERT INTO edge_score_history (player_id, edge_score, fc_score, ktc_score, fp_score, snapshot_date)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (player_id, snapshot_date)
      DO UPDATE SET
        edge_score = EXCLUDED.edge_score,
        fc_score = EXCLUDED.fc_score,
        ktc_score = EXCLUDED.ktc_score,
        fp_score = EXCLUDED.fp_score
    `);
    saved += chunk.length;
  }

  return { players_saved: saved };
}

/**
 * Get movers: players with biggest Edge Score changes between the two most recent snapshots.
 * Returns null if fewer than 2 snapshots exist.
 */
export async function getScoreMovers(playerIds?: string[]): Promise<{
  risers: Mover[];
  fallers: Mover[];
} | null> {
  // Check that at least 2 snapshot dates exist
  const dateRows = await db.execute(sql`
    SELECT DISTINCT snapshot_date FROM edge_score_history
    ORDER BY snapshot_date DESC LIMIT 2
  `);
  const dates = (dateRows as unknown as { snapshot_date: string }[]).map((r) => r.snapshot_date);
  if (dates.length < 2) return null;

  const [current, previous] = dates;

  const filterClause = playerIds && playerIds.length > 0
    ? sql`AND h1.player_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      h1.player_id,
      pm.full_name,
      pm.position,
      h1.edge_score AS current_score,
      h2.edge_score AS previous_score,
      h1.edge_score - h2.edge_score AS change
    FROM edge_score_history h1
    JOIN edge_score_history h2
      ON h1.player_id = h2.player_id AND h2.snapshot_date = ${previous}
    JOIN players_master pm ON h1.player_id = pm.player_id
    WHERE h1.snapshot_date = ${current}
      ${filterClause}
    ORDER BY ABS(h1.edge_score - h2.edge_score) DESC
  `);

  const all = rows as unknown as Mover[];
  const risers = all.filter((m) => m.change > 0).slice(0, 5);
  const fallers = all.filter((m) => m.change < 0).slice(0, 5);

  return { risers, fallers };
}

export interface Mover {
  player_id: string;
  full_name: string;
  position: string;
  current_score: number;
  previous_score: number;
  change: number;
}
