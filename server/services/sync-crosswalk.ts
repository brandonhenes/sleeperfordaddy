import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const CSV_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

interface CrosswalkStats {
  total_rows: number;
  matched_with_sleeper_id: number;
  skipped: number;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

export async function syncPlayerIdCrosswalk(): Promise<CrosswalkStats> {
  console.log("[crosswalk] Fetching DynastyProcess player IDs CSV...");
  const resp = await fetch(CSV_URL);
  if (!resp.ok) throw new Error(`Failed to fetch crosswalk CSV: ${resp.status}`);
  const text = await resp.text();

  const rows = parseCSV(text);
  console.log(`[crosswalk] Parsed ${rows.length} rows from CSV`);

  let matched = 0;
  let skipped = 0;
  const batch: {
    sleeper_id: string;
    name: string;
    position: string;
    team: string;
    mfl_id: string;
    ktc_id: string;
    fantasypros_id: string;
    espn_id: string;
    yahoo_id: string;
  }[] = [];

  for (const row of rows) {
    const sleeperId = row["sleeper_id"] ?? "";
    if (!sleeperId) {
      skipped++;
      continue;
    }
    matched++;
    batch.push({
      sleeper_id: sleeperId,
      name: row["name"] ?? row["merge_name"] ?? "",
      position: row["position"] ?? "",
      team: row["team"] ?? "",
      mfl_id: row["mfl_id"] ?? "",
      ktc_id: row["ktc_id"] ?? "",
      fantasypros_id: row["fantasypros_id"] ?? "",
      espn_id: row["espn_id"] ?? "",
      yahoo_id: row["yahoo_id"] ?? "",
    });
  }

  // Upsert in batches of 200
  const BATCH_SIZE = 200;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const fragments = chunk.map(
      (r) => sql`(
        ${r.sleeper_id}, ${r.name}, ${r.position}, ${r.team},
        ${r.mfl_id}, ${r.ktc_id}, ${r.fantasypros_id}, ${r.espn_id}, ${r.yahoo_id}, NOW()
      )`
    );
    await db.execute(sql`
      INSERT INTO player_id_crosswalk
        (sleeper_id, name, position, team, mfl_id, ktc_id, fantasypros_id, espn_id, yahoo_id, updated_at)
      VALUES ${sql.join(fragments, sql`, `)}
      ON CONFLICT (sleeper_id) DO UPDATE SET
        name = EXCLUDED.name,
        position = EXCLUDED.position,
        team = EXCLUDED.team,
        mfl_id = EXCLUDED.mfl_id,
        ktc_id = EXCLUDED.ktc_id,
        fantasypros_id = EXCLUDED.fantasypros_id,
        espn_id = EXCLUDED.espn_id,
        yahoo_id = EXCLUDED.yahoo_id,
        updated_at = NOW()
    `);
  }

  const stats: CrosswalkStats = {
    total_rows: rows.length,
    matched_with_sleeper_id: matched,
    skipped,
  };
  console.log("[crosswalk] Sync complete:", stats);
  return stats;
}
