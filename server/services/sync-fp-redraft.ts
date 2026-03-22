import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const FP_REDRAFT_1QB_URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php";
const FP_REDRAFT_SF_URL = "https://www.fantasypros.com/nfl/rankings/ppr-superflex-cheatsheets.php";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ecrToValue = (rank: number) => Math.round(10500 * Math.exp(rank * -0.0235));

interface FPPlayer {
  player_id: number;
  player_name: string;
  player_team_id: string;
  player_position_id: string;
  rank_ecr: number | string;
}

interface FpRedraftSyncStats {
  total_scraped: number;
  matched: number;
  unmatched: number;
  source: string;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchEcrData(url: string): Promise<FPPlayer[]> {
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`FP redraft fetch failed: ${resp.status}`);
  const html = await resp.text();
  const match = html.match(/var\s+ecrData\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!match) throw new Error("ecrData not found in redraft page source");
  const data = JSON.parse(match[1]);
  return (data.players ?? []) as FPPlayer[];
}

export async function syncFpRedraftValues(): Promise<FpRedraftSyncStats> {
  console.log("[fp-redraft] Fetching FantasyPros redraft rankings...");

  let players1qb: FPPlayer[] = [];
  let playersSf: FPPlayer[] = [];
  try {
    [players1qb, playersSf] = await Promise.all([
      fetchEcrData(FP_REDRAFT_1QB_URL),
      fetchEcrData(FP_REDRAFT_SF_URL),
    ]);
  } catch (err) {
    console.error("[fp-redraft] Scrape failed:", err);
    return { total_scraped: 0, matched: 0, unmatched: 0, source: "fp_redraft_error" };
  }

  const [cwRows, existingRows] = await Promise.all([
    db.execute(sql`
      SELECT sleeper_id, fantasypros_id, name, position
      FROM player_id_crosswalk
      WHERE fantasypros_id IS NOT NULL AND fantasypros_id != ''
    `),
    db.execute(sql`SELECT sleeper_id FROM dynastyprocess_values`),
  ]);

  type CWRow = { sleeper_id: string; fantasypros_id: string; name: string; position: string };
  const fpMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  for (const row of cwRows as unknown as CWRow[]) {
    fpMap.set(row.fantasypros_id, row.sleeper_id);
    if (row.name && row.position) {
      nameMap.set(`${row.name.toLowerCase()}|${row.position.toLowerCase()}`, row.sleeper_id);
    }
  }

  const existing = new Set(
    (existingRows as unknown as { sleeper_id: string }[]).map((row) => row.sleeper_id)
  );

  const sfRanks = new Map<number, number>();
  for (const player of playersSf) {
    sfRanks.set(player.player_id, toNumber(player.rank_ecr));
  }

  const updates: {
    sleeper_id: string;
    redraft_1qb: number;
    redraft_2qb: number;
    redraft_ecr_1qb: number;
    redraft_ecr_2qb: number;
  }[] = [];
  let matched = 0;
  let unmatched = 0;
  const seen = new Set<string>();

  for (const player of players1qb) {
    const fpId = String(player.player_id);
    let sleeperId = fpMap.get(fpId);
    if (!sleeperId) {
      sleeperId = nameMap.get(
        `${player.player_name.toLowerCase()}|${player.player_position_id.toLowerCase()}`
      );
    }
    if (!sleeperId || !existing.has(sleeperId) || seen.has(sleeperId)) {
      unmatched++;
      continue;
    }

    seen.add(sleeperId);
    matched++;
    const ecr1qb = toNumber(player.rank_ecr);
    const ecr2qb = sfRanks.get(player.player_id) ?? ecr1qb;
    updates.push({
      sleeper_id: sleeperId,
      redraft_1qb: ecrToValue(ecr1qb),
      redraft_2qb: ecrToValue(ecr2qb),
      redraft_ecr_1qb: ecr1qb,
      redraft_ecr_2qb: ecr2qb,
    });
  }

  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const values = chunk.map(
      (row) => sql`(
        ${row.sleeper_id},
        ${row.redraft_1qb},
        ${row.redraft_2qb},
        ${row.redraft_ecr_1qb},
        ${row.redraft_ecr_2qb}
      )`
    );
    await db.execute(sql`
      UPDATE dynastyprocess_values AS dp
      SET redraft_1qb = updates.redraft_1qb,
          redraft_2qb = updates.redraft_2qb,
          redraft_ecr_1qb = updates.redraft_ecr_1qb,
          redraft_ecr_2qb = updates.redraft_ecr_2qb,
          synced_at = NOW()
      FROM (
        VALUES ${sql.join(values, sql`, `)}
      ) AS updates(
        sleeper_id,
        redraft_1qb,
        redraft_2qb,
        redraft_ecr_1qb,
        redraft_ecr_2qb
      )
      WHERE dp.sleeper_id = updates.sleeper_id
    `);
  }

  const stats: FpRedraftSyncStats = {
    total_scraped: players1qb.length + playersSf.length,
    matched,
    unmatched,
    source: "fp_redraft",
  };
  console.log("[fp-redraft] Sync complete:", stats);
  return stats;
}
