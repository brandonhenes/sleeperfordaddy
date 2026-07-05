import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeagueDrafts, getDraftPicks } from "../sleeper/drafts.js";
import { getPowerRankings } from "./power-rankings.js";
import type { LeagueADP } from "../../shared/types.js";

export async function syncLeagueDraftResults(
  username: string,
  leagueIds?: string[],
): Promise<{ drafts: number; picks: number }> {
  if (!(await hasDraftResultsTable())) {
    console.warn("[draft-results] league_draft_results table is unavailable; skipping draft result sync.");
    return { drafts: 0, picks: 0 };
  }

  const allLeagues = leagueIds
    ? leagueIds.map((league_id) => ({ league_id }))
    : await getPowerRankings(username);
  let totalDrafts = 0;
  let totalPicks = 0;

  for (const league of allLeagues) {
    try {
      const drafts = await getLeagueDrafts(league.league_id);
      for (const draft of drafts) {
        const rounds = Number((draft.settings as Record<string, unknown> | undefined)?.rounds ?? 99);
        if (rounds > 8) continue;
        if (draft.status !== "complete") continue;

        const existing = (await db.execute(sql`
          SELECT COUNT(*)::int as cnt FROM league_draft_results
          WHERE draft_id = ${draft.draft_id}
        `)) as unknown as Array<{ cnt: number }>;
        const cnt = existing[0]?.cnt ?? 0;
        if (cnt > 0) continue;

        const picks = await getDraftPicks(draft.draft_id);
        if (picks.length === 0) continue;

        const values = picks.map((p) => ({
          league_id: league.league_id,
          draft_id: draft.draft_id,
          season: draft.season,
          pick_number: p.pick_no,
          round: p.round,
          pick_in_round: p.draft_slot,
          roster_id: p.roster_id,
          player_id: p.player_id,
          player_name: `${p.metadata.first_name ?? ""} ${p.metadata.last_name ?? ""}`.trim() || null,
          position: p.metadata.position ?? null,
        }));

        if (values.length === 0) continue;
        const BATCH = 50;
        for (let i = 0; i < values.length; i += BATCH) {
          const chunk = values.slice(i, i + BATCH);
          const frags = chunk.map(
            (v) => sql`(
              ${v.league_id}, ${v.draft_id}, ${v.season},
              ${v.pick_number}, ${v.round}, ${v.pick_in_round},
              ${v.roster_id}, ${v.player_id}, ${v.player_name}, ${v.position}
            )`,
          );
          await db.execute(sql`
            INSERT INTO league_draft_results (
              league_id, draft_id, season, pick_number, round, pick_in_round,
              roster_id, player_id, player_name, position
            ) VALUES ${sql.join(frags, sql`, `)}
            ON CONFLICT (draft_id, pick_number) DO NOTHING
          `);
        }

        totalDrafts++;
        totalPicks += values.length;
      }
    } catch (err) {
      console.error(`[draft-results] Error syncing drafts for ${league.league_id}:`, err);
    }
  }

  console.log(`[draft-results] Synced ${totalDrafts} drafts with ${totalPicks} picks`);
  return { drafts: totalDrafts, picks: totalPicks };
}

async function hasDraftResultsTable(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      SELECT to_regclass('public.league_draft_results')::text AS table_name
    `);
    return (rows as unknown as Array<{ table_name: string | null }>)[0]?.table_name != null;
  } catch {
    return false;
  }
}

export async function computeRookieADP(season: string): Promise<LeagueADP[]> {
  const rows = await db.execute(sql`
    SELECT
      player_name,
      position,
      ROUND(AVG(pick_number)::numeric, 1) AS avg_pick,
      MIN(pick_number) AS min_pick,
      MAX(pick_number) AS max_pick,
      COUNT(*) AS times_drafted,
      COUNT(DISTINCT league_id) AS leagues_available
    FROM league_draft_results
    WHERE season = ${season}
      AND player_name IS NOT NULL
      AND position IN ('QB', 'RB', 'WR', 'TE')
    GROUP BY player_name, position
    ORDER BY AVG(pick_number) ASC
  `);
  return rows as unknown as LeagueADP[];
}
