import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const FC_API_URL = "https://api.fantasycalc.com/values/current";
const USER_AGENT = "SleeperScout/1.0";

interface FantasyCalcValue {
  player?: {
    sleeperId?: string | number | null;
    name?: string | null;
  };
  value?: number | string | null;
  redraftValue?: number | string | null;
}

interface FcRedraftSyncStats {
  total_scraped: number;
  matched: number;
  unmatched: number;
}

function toInt(value: number | string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncFcRedraftValues(): Promise<FcRedraftSyncStats> {
  console.log("[fc-redraft] Fetching FantasyCalc redraft values...");

  const url = new URL(FC_API_URL);
  url.searchParams.set("isDynasty", "false");
  url.searchParams.set("numQbs", "1");
  url.searchParams.set("numTeams", "12");
  url.searchParams.set("ppr", "1");

  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) throw new Error(`Failed to fetch FantasyCalc redraft values: ${resp.status}`);

  const players = (await resp.json()) as FantasyCalcValue[];
  console.log(`[fc-redraft] Parsed ${players.length} values from FantasyCalc`);

  const snapshotRows = await db.execute(sql`
    SELECT MAX(snapshot_date)::text AS snapshot_date FROM fantasycalc_daily
  `);
  const latestSnapshot = (snapshotRows as unknown as { snapshot_date: string | null }[])[0]?.snapshot_date;
  if (!latestSnapshot) {
    throw new Error("fantasycalc_daily has no snapshot_date to update");
  }

  let matched = 0;
  let unmatched = 0;
  const updates: { sleeper_id: string; redraft_value: number }[] = [];

  for (const player of players) {
    const sleeperId = String(player.player?.sleeperId ?? "").trim();
    if (!sleeperId) {
      unmatched++;
      continue;
    }

    matched++;
    updates.push({
      sleeper_id: sleeperId,
      redraft_value: toInt(player.redraftValue ?? player.value),
    });
  }

  const BATCH_SIZE = 200;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const values = chunk.map((row) => sql`(${row.sleeper_id}, ${row.redraft_value})`);

    await db.execute(sql`
      UPDATE fantasycalc_daily AS fc
      SET redraft_value = updates.redraft_value::integer
      FROM (
        VALUES ${sql.join(values, sql`, `)}
      ) AS updates(sleeper_id, redraft_value)
      WHERE fc.snapshot_date = ${latestSnapshot}::date
        AND fc.sleeper_id = updates.sleeper_id
    `);
  }

  const stats: FcRedraftSyncStats = {
    total_scraped: players.length,
    matched,
    unmatched,
  };
  console.log("[fc-redraft] Sync complete:", stats);
  return stats;
}
