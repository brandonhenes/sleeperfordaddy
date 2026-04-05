import "dotenv/config";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const SLEEPER_BASE = "https://api.sleeper.app/v1";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const drafts = await db.execute(sql`
    SELECT DISTINCT draft_id, league_id, season
    FROM league_draft_results
  `);

  console.log(`[traded-picks] Processing ${drafts.length} drafts...`);
  let totalInserted = 0;

  for (let i = 0; i < drafts.length; i++) {
    const { draft_id, league_id, season } = drafts[i] as any;

    try {
      const tradedPicks = await fetchJson(`${SLEEPER_BASE}/draft/${draft_id}/traded_picks`);
      if (!tradedPicks || !Array.isArray(tradedPicks) || tradedPicks.length === 0) continue;

      for (const tp of tradedPicks) {
        await db.execute(sql`
          INSERT INTO draft_traded_picks (draft_id, league_id, season, round, original_owner_id, current_owner_id, previous_owner_id)
          VALUES (${draft_id}, ${league_id}, ${season}, ${tp.round}, ${tp.owner_id}, ${tp.roster_id}, ${tp.previous_owner_id})
          ON CONFLICT (draft_id, round, original_owner_id) DO NOTHING
        `);
        totalInserted++;
      }

      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`[traded-picks] Error on draft ${draft_id}:`, err);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[traded-picks] Progress: ${i + 1}/${drafts.length} drafts, ${totalInserted} ownership records`);
    }
  }

  console.log(`[traded-picks] Done. ${totalInserted} records inserted.`);
  process.exit(0);
}

main();
