import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const CSV_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

interface CrosswalkStats {
  total_rows: number;
  matched_with_sleeper_id: number;
  skipped: number;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const v = vals[j] ?? "";
      row[headers[j]] = v === "NA" ? "" : v;
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
    gsis_id: string;
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
      gsis_id: row["gsis_id"] ?? "",
    });
  }

  // Deduplicate by sleeper_id (CSV has multiple season rows per player)
  const deduped = [...new Map(batch.map((r) => [r.sleeper_id, r])).values()];
  console.log(`[crosswalk] Deduplicated to ${deduped.length} unique players`);

  // Upsert in batches of 50 (Supabase pooler has parameter limits)
  const BATCH_SIZE = 50;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const chunk = deduped.slice(i, i + BATCH_SIZE);
    const fragments = chunk.map(
      (r) => sql`(
        ${r.sleeper_id}, ${r.name}, ${r.position}, ${r.team},
        ${r.mfl_id}, ${r.ktc_id}, ${r.fantasypros_id}, ${r.espn_id}, ${r.yahoo_id}, ${r.gsis_id}, NOW()
      )`
    );
    await db.execute(sql`
      INSERT INTO player_id_crosswalk
        (sleeper_id, name, position, team, mfl_id, ktc_id, fantasypros_id, espn_id, yahoo_id, gsis_id, updated_at)
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
        gsis_id = EXCLUDED.gsis_id,
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
