import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const KTC_REDRAFT_URL = "https://keeptradecut.com/fantasy-rankings";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface KtcPlayer {
  playerName: string;
  playerID: number;
  position: string;
  team: string;
  age: number;
  mflid: number | string;
  oneQBValues?: { value?: number | string; rank?: number | string };
  superflexValues?: { value?: number | string; rank?: number | string };
}

interface KtcRedraftSyncStats {
  total_scraped: number;
  matched: number;
  unmatched: number;
}

function toInt(value: number | string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncKtcRedraftValues(): Promise<KtcRedraftSyncStats> {
  console.log("[ktc-redraft] Fetching KTC redraft rankings page...");
  const resp = await fetch(KTC_REDRAFT_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch KTC redraft page: ${resp.status} ${resp.statusText}`);
  }
  const html = await resp.text();

  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not find playersArray in KTC redraft page");
  const players: KtcPlayer[] = JSON.parse(match[1]);
  console.log(`[ktc-redraft] Parsed ${players.length} players from KTC`);

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
  for (const row of cwRows as unknown as { sleeper_id: string; mfl_id: string }[]) {
    mflMap.set(row.mfl_id, row.sleeper_id);
  }

  const nameMap = new Map<string, string>();
  for (const row of nameRows as unknown as { player_id: string; full_name: string | null; position: string | null }[]) {
    if (!row.full_name || !row.position) continue;
    nameMap.set(`${row.full_name.toLowerCase()}|${row.position.toLowerCase()}`, row.player_id);
  }

  const existing = new Set(
    (existingRows as unknown as { sleeper_id: string }[]).map((row) => row.sleeper_id)
  );

  const updates: { sleeper_id: string; redraft_1qb: number; redraft_sf: number }[] = [];
  let matched = 0;
  let unmatched = 0;
  const seen = new Set<string>();

  for (const player of players) {
    if (!player.position || player.position === "RDP") continue;

    const mflId = String(player.mflid ?? "");
    let sleeperId = mflMap.get(mflId);
    if (!sleeperId) {
      sleeperId = nameMap.get(`${player.playerName.toLowerCase()}|${player.position.toLowerCase()}`);
    }
    if (!sleeperId || !existing.has(sleeperId) || seen.has(sleeperId)) {
      unmatched++;
      continue;
    }

    seen.add(sleeperId);
    matched++;
    updates.push({
      sleeper_id: sleeperId,
      redraft_1qb: toInt(player.oneQBValues?.value),
      redraft_sf: toInt(player.superflexValues?.value),
    });
  }

  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const values = chunk.map(
      (row) => sql`(${row.sleeper_id}, ${row.redraft_1qb}, ${row.redraft_sf})`
    );
    await db.execute(sql`
      UPDATE ktc_values AS kv
      SET redraft_1qb = updates.redraft_1qb,
          redraft_sf = updates.redraft_sf,
          scraped_at = NOW()
      FROM (
        VALUES ${sql.join(values, sql`, `)}
      ) AS updates(sleeper_id, redraft_1qb, redraft_sf)
      WHERE kv.sleeper_id = updates.sleeper_id
    `);
  }

  const stats: KtcRedraftSyncStats = {
    total_scraped: players.length,
    matched,
    unmatched,
  };
  console.log("[ktc-redraft] Sync complete:", stats);
  return stats;
}
