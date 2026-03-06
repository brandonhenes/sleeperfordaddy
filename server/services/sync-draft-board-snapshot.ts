import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getProspects } from "./market.js";

export async function captureDraftBoardSnapshot(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = (await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM draft_board_snapshots
    WHERE snapshot_date = ${today}::date
  `)) as unknown as Array<{ cnt: number }>;
  const cnt = existing[0]?.cnt ?? 0;
  if (cnt > 0) {
    console.log(`[draft-snapshot] Already captured for ${today}, skipping`);
    return 0;
  }

  const prospects = await getProspects();
  if (prospects.length === 0) return 0;

  const BATCH = 50;
  let total = 0;
  for (let i = 0; i < prospects.length; i += BATCH) {
    const chunk = prospects.slice(i, i + BATCH);
    const frags = chunk.map(
      (p) => sql`(
        ${today}::date,
        ${p.player_name},
        ${p.position},
        ${p.fp_rank ?? p.fantasypros_rank},
        ${p.tier},
        ${p.school},
        ${p.scouting_notes != null || p.fp_scouting_notes != null || p.notes != null},
        ${p.consensus_comp ?? (p.all_comps && p.all_comps.length > 0 ? p.all_comps[0].comp : null)}
      )`,
    );
    await db.execute(sql`
      INSERT INTO draft_board_snapshots (
        snapshot_date, player_name, position, fp_rank, tier,
        school, has_scouting_notes, consensus_comp
      ) VALUES ${sql.join(frags, sql`, `)}
    `);
    total += chunk.length;
  }

  console.log(`[draft-snapshot] Captured ${total} prospect rankings for ${today}`);
  return total;
}
