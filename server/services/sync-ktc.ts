import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { backfillKtcSleeperIds } from "./source-coverage-backfill.js";
import { snapshotKtcDaily } from "./source-daily-snapshots.js";

const KTC_URL = "https://keeptradecut.com/dynasty-rankings";

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

interface KtcSyncStats {
  total_scraped: number;
  matched_to_sleeper: number;
  unmatched: number;
  picks_found: number;
  fallback_name_matched: number;
}

const PICK_RE = /^(\d{4})\s+(Early|Mid|Late)?\s*(1st|2nd|3rd|4th)/i;
const ROUND_MAP: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };

function parsePick(name: string) {
  const m = name.match(PICK_RE);
  if (!m) return null;
  return {
    season: parseInt(m[1], 10),
    tier: m[2]?.toLowerCase() ?? null,
    round: ROUND_MAP[m[3]] ?? null,
  };
}

export async function syncKtcValues(): Promise<KtcSyncStats> {
  console.log("[ktc] Fetching KTC dynasty rankings page...");
  const resp = await fetch(KTC_URL, {
    headers: { "User-Agent": "SleeperScout/1.0" },
  });
  if (!resp.ok) throw new Error(`Failed to fetch KTC page: ${resp.status}`);
  const html = await resp.text();

  // Extract playersArray JSON
  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not find playersArray in KTC page");
  const players: KtcPlayer[] = JSON.parse(match[1]);
  console.log(`[ktc] Parsed ${players.length} players from KTC`);

  // Load crosswalk for mfl_id -> sleeper_id mapping
  const cwRows = await db.execute(sql`
    SELECT sleeper_id, mfl_id FROM player_id_crosswalk WHERE mfl_id IS NOT NULL AND mfl_id != ''
  `);
  const mflMap = new Map<string, string>();
  for (const r of cwRows as unknown as { sleeper_id: string; mfl_id: string }[]) {
    mflMap.set(r.mfl_id, r.sleeper_id);
  }

  let matched = 0;
  let unmatched = 0;
  let picksFound = 0;
  const unmatchedNames: string[] = [];

  const batch: {
    sleeper_id: string;
    player_name: string;
    position: string;
    team: string;
    age_decimal: number;
    value_1qb: number;
    value_sf: number;
    rank_1qb: number;
    rank_sf: number;
    is_pick: boolean;
    pick_season: number | null;
    pick_round: number | null;
    pick_tier: string | null;
  }[] = [];

  for (const p of players) {
    const pickInfo = parsePick(p.playerName);
    const isPick = !!pickInfo || p.position === "RDP" || !p.position;

    if (isPick) {
      picksFound++;
      // Store picks with a synthetic sleeper_id
      batch.push({
        sleeper_id: `ktc_pick_${p.playerID}`,
        player_name: p.playerName,
        position: "PICK",
        team: "",
        age_decimal: 0,
        value_1qb: p.oneQBValues?.value ?? 0,
        value_sf: p.superflexValues?.value ?? 0,
        rank_1qb: p.oneQBValues?.rank ?? 0,
        rank_sf: p.superflexValues?.rank ?? 0,
        is_pick: true,
        pick_season: pickInfo?.season ?? null,
        pick_round: pickInfo?.round ?? null,
        pick_tier: pickInfo?.tier ?? null,
      });
      continue;
    }

    const mflId = String(p.mflid ?? "");
    const sleeperId = mflMap.get(mflId);
    if (!sleeperId) {
      unmatched++;
      unmatchedNames.push(`${p.playerName} (mfl:${mflId})`);
      continue;
    }

    matched++;
    batch.push({
      sleeper_id: sleeperId,
      player_name: p.playerName,
      position: p.position,
      team: p.team ?? "",
      age_decimal: p.age ?? 0,
      value_1qb: p.oneQBValues?.value ?? 0,
      value_sf: p.superflexValues?.value ?? 0,
      rank_1qb: p.oneQBValues?.rank ?? 0,
      rank_sf: p.superflexValues?.rank ?? 0,
      is_pick: false,
      pick_season: null,
      pick_round: null,
      pick_tier: null,
    });
  }

  // Upsert in batches
  const BATCH_SIZE = 30;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const fragments = chunk.map(
      (r) => sql`(
        ${r.sleeper_id}, ${r.player_name}, ${r.position}, ${r.team}, ${r.age_decimal},
        ${r.value_1qb}, ${r.value_sf}, ${r.rank_1qb}, ${r.rank_sf},
        ${r.is_pick}, ${r.pick_season}, ${r.pick_round}, ${r.pick_tier}, NOW()
      )`
    );
    await db.execute(sql`
      INSERT INTO ktc_values
        (sleeper_id, player_name, position, team, age_decimal,
         value_1qb, value_sf, rank_1qb, rank_sf,
         is_pick, pick_season, pick_round, pick_tier, scraped_at)
      VALUES ${sql.join(fragments, sql`, `)}
      ON CONFLICT (sleeper_id) DO UPDATE SET
        player_name = EXCLUDED.player_name, position = EXCLUDED.position,
        team = EXCLUDED.team, age_decimal = EXCLUDED.age_decimal,
        value_1qb = EXCLUDED.value_1qb, value_sf = EXCLUDED.value_sf,
        rank_1qb = EXCLUDED.rank_1qb, rank_sf = EXCLUDED.rank_sf,
        is_pick = EXCLUDED.is_pick, pick_season = EXCLUDED.pick_season,
        pick_round = EXCLUDED.pick_round, pick_tier = EXCLUDED.pick_tier,
        scraped_at = NOW()
    `);
  }

  await snapshotKtcDaily();

  const fallbackNameMatched = await backfillKtcSleeperIds();

  if (unmatchedNames.length > 0) {
    console.log(`[ktc] Unmatched players (${unmatchedNames.length}):`,
      unmatchedNames.slice(0, 20).join(", "),
      unmatchedNames.length > 20 ? `... +${unmatchedNames.length - 20} more` : "");
  }

  const stats: KtcSyncStats = {
    total_scraped: players.length,
    matched_to_sleeper: matched,
    unmatched,
    picks_found: picksFound,
    fallback_name_matched: fallbackNameMatched,
  };
  console.log("[ktc] Sync complete:", stats);
  return stats;
}
