import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeagueDrafts, getDraftPicks } from "../sleeper/drafts.js";
import { resolveDraftPickRosterId } from "../services/draft-result-helpers.js";

async function main(): Promise<void> {
  const leagues = (await db.execute(sql`
    SELECT DISTINCT league_id FROM leagues
  `)) as unknown as Array<{ league_id: string }>;

  console.log(`[draft-backfill] Processing ${leagues.length} leagues...`);
  let totalDrafts = 0;
  let totalPicks = 0;
  let skippedPicks = 0;

  for (let i = 0; i < leagues.length; i++) {
    const leagueId = leagues[i].league_id;

    try {
      const drafts = await getLeagueDrafts(leagueId);
      const ownerToRosterId = await loadOwnerRosterIds(leagueId);

      for (const draft of drafts) {
        if (draft.status !== "complete") continue;

        const rounds = Number(
          (draft.settings as Record<string, unknown> | undefined)?.rounds ?? 99
        );
        if (rounds > 8) continue;

        const existing = (await db.execute(sql`
          SELECT COUNT(*)::int as cnt FROM league_draft_results
          WHERE draft_id = ${draft.draft_id}
        `)) as unknown as Array<{ cnt: number }>;
        if ((existing[0]?.cnt ?? 0) > 0) continue;

        const picks = await getDraftPicks(draft.draft_id);
        if (picks.length === 0) continue;

        const values = picks.flatMap((p) => {
          const rosterId = resolveDraftPickRosterId(p, draft, ownerToRosterId);
          if (rosterId == null) {
            skippedPicks += 1;
            return [];
          }
          return [{
            league_id: leagueId,
            draft_id: draft.draft_id,
            season: draft.season,
            pick_number: p.pick_no,
            round: p.round,
            pick_in_round: p.draft_slot,
            roster_id: rosterId,
            player_id: p.player_id,
            player_name:
              `${p.metadata.first_name ?? ""} ${p.metadata.last_name ?? ""}`.trim() || null,
            position: p.metadata.position ?? null,
          }];
        });
        if (values.length === 0) continue;

        const BATCH = 50;
        for (let j = 0; j < values.length; j += BATCH) {
          const chunk = values.slice(j, j + BATCH);
          const frags = chunk.map(
            (v) => sql`(
              ${v.league_id}, ${v.draft_id}, ${v.season},
              ${v.pick_number}, ${v.round}, ${v.pick_in_round},
              ${v.roster_id}, ${v.player_id}, ${v.player_name}, ${v.position}
            )`
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

        // Small delay between draft fetches
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error(`[draft-backfill] Error on league ${leagueId}:`, err);
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `[draft-backfill] Progress: ${i + 1}/${leagues.length} leagues, ${totalDrafts} drafts, ${totalPicks} picks`
      );
    }
  }

  console.log(
    `[draft-backfill] Done. ${totalDrafts} drafts, ${totalPicks} total picks inserted${skippedPicks > 0 ? `, ${skippedPicks} picks skipped without roster mapping` : ""}.`
  );
  process.exit(0);
}

async function loadOwnerRosterIds(leagueId: string): Promise<Map<string, number>> {
  const rows = await db.execute(sql`
    SELECT owner_id, roster_id
    FROM rosters
    WHERE league_id = ${leagueId}
      AND owner_id IS NOT NULL
  `);
  return new Map(
    (rows as unknown as Array<{ owner_id: string; roster_id: number }>)
      .map((row) => [row.owner_id, row.roster_id])
  );
}

main().catch((error) => {
  console.error("[draft-backfill] Fatal error:", error);
  process.exit(1);
});
