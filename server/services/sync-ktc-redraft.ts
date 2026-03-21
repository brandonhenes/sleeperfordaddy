import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const KTC_REDRAFT_URL = "https://keeptradecut.com/fantasy-rankings";

interface KtcPlayer {
  playerName: string;
  playerID: number;
  position: string;
  team: string;
  age: number;
  mflid: number | string;
  oneQBValues: { value: number; rank: number };
  superflexValues: { value: number; rank: number };
}

interface KtcRedraftSyncStats {
  total_scraped: number;
  matched: number;
  unmatched: number;
}

export async function syncKtcRedraftValues(): Promise<KtcRedraftSyncStats> {
  console.log("[ktc-redraft] Fetching KTC redraft rankings page...");
  const resp = await fetch(KTC_REDRAFT_URL, {
    headers: { "User-Agent": "SleeperScout/1.0" },
  });
  if (!resp.ok) throw new Error(`Failed to fetch KTC redraft page: ${resp.status}`);
  const html = await resp.text();

  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not find playersArray in KTC redraft page");
  const players: KtcPlayer[] = JSON.parse(match[1]);

  const [cwRows, nameRows, existingRows] = await Promise.all([
    db.execute(sql`
      SELECT sleeper_id, mfl_id
      FROM player_id_crosswalk
      WHERE mfl_id IS NOT NULL AND mfl_id != ''
    `),
    db.execute(sql`
      SELECT player_id, full_name, position
      FROM players_master
      WHERE position IN ('QB', 'RB', 'WR', 'TE')
    `),
    db.execute(sql`SELECT sleeper_id FROM ktc_values`),
  ]);

  const mflMap = new Map<string, string>();
  for (const r of cwRows as unknown as { sleeper_id: string; mfl_id: string }[]) {
    mflMap.set(r.mfl_id, r.sleeper_id);
  }

  const nameMap = new Map<string, string>();
  for (const r of nameRows as unknown as { player_id: string; full_name: string | null; position: string | null }[]) {
    if (!r.full_name || !r.position) continue;
    nameMap.set(`${r.full_name.toLowerCase()}|${r.position.toLowerCase()}`, r.player_id);
  }

  const existing = new Set(
    (existingRows as unknown as { sleeper_id: string }[]).map((r) => r.sleeper_id)
  );

  const updates: { sleeper_id: string; redraft_1qb: number; redraft_sf: number }[] = [];
  let matched = 0;
  let unmatched = 0;
  const seen = new Set<string>();

  for (const p of players) {
    if (!p.position || p.position === "RDP") continue;

    const mflId = String(p.mflid ?? "");
    let sleeperId = mflMap.get(mflId);
    if (!sleeperId) {
      sleeperId = nameMap.get(`${p.playerName.toLowerCase()}|${p.position.toLowerCase()}`);
    }
    if (!sleeperId || !existing.has(sleeperId) || seen.has(sleeperId)) {
      unmatched++;
      continue;
    }

    seen.add(sleeperId);
    matched++;
    updates.push({
      sleeper_id: sleeperId,
      redraft_1qb: p.oneQBValues?.value ?? 0,
      redraft_sf: p.superflexValues?.value ?? 0,
    });
  }

  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const frags = chunk.map(
      (r) => sql`(${r.sleeper_id}, ${r.redraft_1qb}, ${r.redraft_sf})`
    );
    await db.execute(sql`
      UPDATE ktc_values AS ktc
      SET redraft_1qb = vals.redraft_1qb,
          redraft_sf = vals.redraft_sf,
          scraped_at = NOW()
      FROM (
        VALUES ${sql.join(frags, sql`, `)}
      ) AS vals(sleeper_id, redraft_1qb, redraft_sf)
      WHERE ktc.sleeper_id = vals.sleeper_id
    `);
  }

  return {
    total_scraped: players.length,
    matched,
    unmatched,
  };
}
