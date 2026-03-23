import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { snapshotDpDaily } from "./source-daily-snapshots.js";

const FP_1QB_URL = "https://www.fantasypros.com/nfl/rankings/dynasty-overall.php";
const FP_SF_URL = "https://www.fantasypros.com/nfl/rankings/dynasty-superflex.php";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// DP-compatible value formula: top player ~10500, exponential decay by ECR rank
const ecrToValue = (rank: number) => Math.round(10500 * Math.exp(rank * -0.0235));

interface FPPlayer {
  player_id: number;
  player_name: string;
  player_team_id: string;
  player_position_id: string;
  rank_ecr: number;
}

interface FPSyncStats {
  total_scraped: number;
  matched: number;
  unmatched: number;
  picks: number;
  source: string;
}

// ─── Scrape ───

async function fetchEcrData(url: string): Promise<FPPlayer[]> {
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`FP fetch failed: ${resp.status}`);
  const html = await resp.text();

  const match = html.match(/var\s+ecrData\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!match) throw new Error("ecrData not found in page source");

  const data = JSON.parse(match[1]);
  return (data.players ?? []) as FPPlayer[];
}

// ─── Main ───

export async function syncFpEliteValues(): Promise<FPSyncStats> {
  console.log("[fp-elite] Fetching FantasyPros dynasty rankings...");

  let players1qb: FPPlayer[] = [];
  let playersSf: FPPlayer[] = [];
  try {
    [players1qb, playersSf] = await Promise.all([
      fetchEcrData(FP_1QB_URL),
      fetchEcrData(FP_SF_URL),
    ]);
  } catch (err) {
    console.error("[fp-elite] Scrape failed:", err);
    return { total_scraped: 0, matched: 0, unmatched: 0, picks: 0, source: "fp_elite_error" };
  }

  console.log(`[fp-elite] Scraped ${players1qb.length} 1QB + ${playersSf.length} SF players`);

  // Load crosswalk: fantasypros_id → sleeper_id AND name+pos → sleeper_id
  const cwRows = await db.execute(sql`
    SELECT sleeper_id, fantasypros_id, name, position
    FROM player_id_crosswalk
    WHERE fantasypros_id IS NOT NULL AND fantasypros_id != ''
  `);
  type CWRow = { sleeper_id: string; fantasypros_id: string; name: string; position: string };
  const fpMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  for (const r of cwRows as unknown as CWRow[]) {
    fpMap.set(r.fantasypros_id, r.sleeper_id);
    if (r.name && r.position) {
      nameMap.set(`${r.name.toLowerCase()}|${r.position.toLowerCase()}`, r.sleeper_id);
    }
  }

  // Build SF lookup by fp player_id
  const sfRanks = new Map<number, number>();
  for (const p of playersSf) sfRanks.set(p.player_id, p.rank_ecr);

  // Match and build upsert batch
  let matched = 0;
  let unmatched = 0;
  const seen = new Set<string>();

  const batch: {
    sleeper_id: string; player_name: string; position: string; team: string;
    value_1qb: number; value_2qb: number; ecr_1qb: number; ecr_2qb: number;
  }[] = [];

  for (const p of players1qb) {
    const fpId = String(p.player_id);
    let sleeperId = fpMap.get(fpId);
    if (!sleeperId) {
      sleeperId = nameMap.get(
        `${p.player_name.toLowerCase()}|${p.player_position_id.toLowerCase()}`
      );
    }
    if (!sleeperId || seen.has(sleeperId)) {
      if (!sleeperId) unmatched++;
      continue;
    }
    seen.add(sleeperId);
    matched++;

    const ecr1qb = p.rank_ecr;
    const ecrSf = sfRanks.get(p.player_id) ?? ecr1qb;

    batch.push({
      sleeper_id: sleeperId,
      player_name: p.player_name,
      position: p.player_position_id,
      team: p.player_team_id ?? "",
      value_1qb: ecrToValue(ecr1qb),
      value_2qb: ecrToValue(ecrSf),
      ecr_1qb: ecr1qb,
      ecr_2qb: ecrSf,
    });
  }

  // Also process SF-only players not in 1QB list
  for (const p of playersSf) {
    const fpId = String(p.player_id);
    let sleeperId = fpMap.get(fpId);
    if (!sleeperId) {
      sleeperId = nameMap.get(
        `${p.player_name.toLowerCase()}|${p.player_position_id.toLowerCase()}`
      );
    }
    if (!sleeperId || seen.has(sleeperId)) continue;
    seen.add(sleeperId);
    matched++;

    batch.push({
      sleeper_id: sleeperId,
      player_name: p.player_name,
      position: p.player_position_id,
      team: p.player_team_id ?? "",
      value_1qb: ecrToValue(p.rank_ecr),
      value_2qb: ecrToValue(p.rank_ecr),
      ecr_1qb: p.rank_ecr,
      ecr_2qb: p.rank_ecr,
    });
  }

  console.log(`[fp-elite] Matched ${matched}, unmatched ${unmatched}`);

  // Preserve existing pick rows — only update player rows
  const BATCH_SIZE = 50;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const fragments = chunk.map(
      (r) => sql`(
        ${r.sleeper_id}, ${r.player_name}, ${r.position}, ${r.team}, 0,
        ${r.value_1qb}, ${r.value_2qb}, ${r.ecr_1qb}, ${r.ecr_2qb},
        false, '', NOW()
      )`
    );
    await db.execute(sql`
      INSERT INTO dynastyprocess_values
        (sleeper_id, player_name, position, team, age,
         value_1qb, value_2qb, ecr_1qb, ecr_2qb,
         is_pick, scrape_date, synced_at)
      VALUES ${sql.join(fragments, sql`, `)}
      ON CONFLICT (sleeper_id) DO UPDATE SET
        player_name = EXCLUDED.player_name, position = EXCLUDED.position,
        team = EXCLUDED.team,
        value_1qb = EXCLUDED.value_1qb, value_2qb = EXCLUDED.value_2qb,
        ecr_1qb = EXCLUDED.ecr_1qb, ecr_2qb = EXCLUDED.ecr_2qb,
        synced_at = NOW()
    `);
  }

  await snapshotDpDaily();

  const stats: FPSyncStats = {
    total_scraped: players1qb.length + playersSf.length,
    matched,
    unmatched,
    picks: 0,
    source: "fp_elite",
  };
  console.log("[fp-elite] Sync complete:", stats);
  return stats;
}
