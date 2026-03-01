import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const CSV_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv";

interface DPSyncStats {
  total_rows: number;
  matched: number;
  unmatched: number;
  picks: number;
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

export async function syncDynastyProcessValues(): Promise<DPSyncStats> {
  console.log("[dp] Fetching DynastyProcess values CSV...");
  const resp = await fetch(CSV_URL);
  if (!resp.ok) throw new Error(`Failed to fetch DP CSV: ${resp.status}`);
  const text = await resp.text();

  const rows = parseCSV(text);
  console.log(`[dp] Parsed ${rows.length} rows from CSV`);

  // Load crosswalk for fp_id -> sleeper_id
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

  let matched = 0;
  let unmatched = 0;
  let picks = 0;

  const batch: {
    sleeper_id: string;
    player_name: string;
    position: string;
    team: string;
    age: number;
    value_1qb: number;
    value_2qb: number;
    ecr_1qb: number;
    ecr_2qb: number;
    is_pick: boolean;
    scrape_date: string;
  }[] = [];

  for (const row of rows) {
    const name = row["player"] ?? "";
    const pos = row["pos"] ?? "";
    const isPick = pos === "PICK" || /^\d{4}\s+(Early|Mid|Late)?\s*(1st|2nd|3rd|4th)/i.test(name);

    if (isPick) {
      picks++;
      batch.push({
        sleeper_id: `dp_pick_${name.replace(/\s+/g, "_")}`,
        player_name: name,
        position: "PICK",
        team: "",
        age: 0,
        value_1qb: parseInt(row["value_1qb"] ?? "0", 10) || 0,
        value_2qb: parseInt(row["value_2qb"] ?? "0", 10) || 0,
        ecr_1qb: parseFloat(row["ecr_1qb"] ?? "0") || 0,
        ecr_2qb: parseFloat(row["ecr_2qb"] ?? "0") || 0,
        is_pick: true,
        scrape_date: row["scrape_date"] ?? "",
      });
      continue;
    }

    // Match by fp_id first, then name+pos fallback
    const fpId = row["fp_id"] ?? "";
    let sleeperId = fpId ? fpMap.get(fpId) : undefined;
    if (!sleeperId) {
      sleeperId = nameMap.get(`${name.toLowerCase()}|${pos.toLowerCase()}`);
    }
    if (!sleeperId) {
      unmatched++;
      continue;
    }

    matched++;
    batch.push({
      sleeper_id: sleeperId,
      player_name: name,
      position: pos,
      team: row["team"] ?? "",
      age: parseFloat(row["age"] ?? "0") || 0,
      value_1qb: parseInt(row["value_1qb"] ?? "0", 10) || 0,
      value_2qb: parseInt(row["value_2qb"] ?? "0", 10) || 0,
      ecr_1qb: parseFloat(row["ecr_1qb"] ?? "0") || 0,
      ecr_2qb: parseFloat(row["ecr_2qb"] ?? "0") || 0,
      is_pick: false,
      scrape_date: row["scrape_date"] ?? "",
    });
  }

  // Deduplicate by sleeper_id (CSV may have multiple rows mapping to same player)
  const deduped = [...new Map(batch.map((r) => [r.sleeper_id, r])).values()];
  console.log(`[dp] Deduplicated to ${deduped.length} unique entries`);

  // Upsert in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const chunk = deduped.slice(i, i + BATCH_SIZE);
    const fragments = chunk.map(
      (r) => sql`(
        ${r.sleeper_id}, ${r.player_name}, ${r.position}, ${r.team}, ${r.age},
        ${r.value_1qb}, ${r.value_2qb}, ${r.ecr_1qb}, ${r.ecr_2qb},
        ${r.is_pick}, ${r.scrape_date}, NOW()
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
        team = EXCLUDED.team, age = EXCLUDED.age,
        value_1qb = EXCLUDED.value_1qb, value_2qb = EXCLUDED.value_2qb,
        ecr_1qb = EXCLUDED.ecr_1qb, ecr_2qb = EXCLUDED.ecr_2qb,
        is_pick = EXCLUDED.is_pick, scrape_date = EXCLUDED.scrape_date,
        synced_at = NOW()
    `);
  }

  const stats: DPSyncStats = { total_rows: rows.length, matched, unmatched, picks };
  console.log("[dp] Sync complete:", stats);
  return stats;
}
