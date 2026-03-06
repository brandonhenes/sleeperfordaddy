import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download/player_stats";

interface WeeklyRow {
  player_id: string;
  player_display_name: string;
  position: string;
  recent_team: string;
  season: string;
  week: string;
  season_type: string;
  receptions: string;
  targets: string;
  carries: string;
  passing_tds: string;
  rushing_tds: string;
  receiving_tds: string;
  passing_yards: string;
  rushing_yards: string;
  receiving_yards: string;
  attempts: string;
}

interface SeasonAgg {
  gsis_id: string;
  season: number;
  games: number;
  receptions: number;
  targets: number;
  carries: number;
  passing_tds: number;
  rushing_tds: number;
  receiving_tds: number;
  passing_yds: number;
  rushing_yds: number;
  receiving_yds: number;
  passing_attempts: number;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function num(val: string | undefined): number {
  if (!val || val === "" || val === "NA") return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export async function syncNflverseStats(): Promise<{ season: number; players: number }> {
  const year = new Date().getFullYear();
  const season = new Date().getMonth() < 8 ? year - 1 : year;

  console.log(`[nflverse] Fetching player stats for season ${season}...`);
  const url = `${BASE_URL}/player_stats_${season}.csv`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`[nflverse] Failed to fetch stats: ${resp.status}`);
    throw new Error(`nflverse stats fetch failed: ${resp.status}`);
  }
  const text = await resp.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Empty nflverse CSV");

  const headers = parseCSVLine(lines[0]);
  const idx = (name: string) => headers.indexOf(name);

  const weeklyData: WeeklyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const seasonType = vals[idx("season_type")] ?? "";
    if (seasonType !== "REG") continue;

    weeklyData.push({
      player_id: vals[idx("player_id")] ?? "",
      player_display_name: vals[idx("player_display_name")] ?? "",
      position: vals[idx("position")] ?? "",
      recent_team: vals[idx("recent_team")] ?? "",
      season: vals[idx("season")] ?? "",
      week: vals[idx("week")] ?? "",
      season_type: seasonType,
      receptions: vals[idx("receptions")] ?? "0",
      targets: vals[idx("targets")] ?? "0",
      carries: vals[idx("carries")] ?? "0",
      passing_tds: vals[idx("passing_tds")] ?? "0",
      rushing_tds: vals[idx("rushing_tds")] ?? "0",
      receiving_tds: vals[idx("receiving_tds")] ?? "0",
      passing_yards: vals[idx("passing_yards")] ?? "0",
      rushing_yards: vals[idx("rushing_yards")] ?? "0",
      receiving_yards: vals[idx("receiving_yards")] ?? "0",
      attempts: vals[idx("attempts")] ?? "0",
    });
  }

  console.log(`[nflverse] Parsed ${weeklyData.length} weekly stat lines`);

  const agg = new Map<string, SeasonAgg>();
  for (const row of weeklyData) {
    if (!row.player_id) continue;
    const pos = row.position;
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;

    const key = row.player_id;
    const existing = agg.get(key) ?? {
      gsis_id: row.player_id,
      season,
      games: 0,
      receptions: 0,
      targets: 0,
      carries: 0,
      passing_tds: 0,
      rushing_tds: 0,
      receiving_tds: 0,
      passing_yds: 0,
      rushing_yds: 0,
      receiving_yds: 0,
      passing_attempts: 0,
    };

    const hadStats = num(row.receptions) + num(row.carries) + num(row.attempts) + num(row.targets) > 0;
    if (hadStats) existing.games++;

    existing.receptions += num(row.receptions);
    existing.targets += num(row.targets);
    existing.carries += num(row.carries);
    existing.passing_tds += num(row.passing_tds);
    existing.rushing_tds += num(row.rushing_tds);
    existing.receiving_tds += num(row.receiving_tds);
    existing.passing_yds += num(row.passing_yards);
    existing.rushing_yds += num(row.rushing_yards);
    existing.receiving_yds += num(row.receiving_yards);
    existing.passing_attempts += num(row.attempts);

    agg.set(key, existing);
  }

  console.log(`[nflverse] Aggregated ${agg.size} player seasons`);

  const crosswalkRows = await db.execute(sql`
    SELECT sleeper_id, gsis_id FROM player_id_crosswalk
    WHERE gsis_id IS NOT NULL AND gsis_id != ''
  `);
  type CW = { sleeper_id: string; gsis_id: string };
  const gsisToSleeper = new Map<string, string>();
  for (const r of crosswalkRows as unknown as CW[]) {
    gsisToSleeper.set(r.gsis_id, r.sleeper_id);
  }

  const values: {
    sleeper_id: string;
    season: number;
    games_played: number;
    receptions_pg: number;
    targets_pg: number;
    carries_pg: number;
    passing_tds_pg: number;
    rushing_tds_pg: number;
    receiving_tds_pg: number;
    passing_yds_pg: number;
    rushing_yds_pg: number;
    receiving_yds_pg: number;
    passing_attempts_pg: number;
    total_receptions: number;
    total_carries: number;
    total_passing_tds: number;
    total_rushing_tds: number;
    total_receiving_tds: number;
  }[] = [];

  for (const [, p] of agg) {
    const sleeperId = gsisToSleeper.get(p.gsis_id);
    if (!sleeperId) continue;
    if (p.games === 0) continue;

    const g = p.games;
    values.push({
      sleeper_id: sleeperId,
      season: p.season,
      games_played: g,
      receptions_pg: Math.round((p.receptions / g) * 100) / 100,
      targets_pg: Math.round((p.targets / g) * 100) / 100,
      carries_pg: Math.round((p.carries / g) * 100) / 100,
      passing_tds_pg: Math.round((p.passing_tds / g) * 100) / 100,
      rushing_tds_pg: Math.round((p.rushing_tds / g) * 100) / 100,
      receiving_tds_pg: Math.round((p.receiving_tds / g) * 100) / 100,
      passing_yds_pg: Math.round((p.passing_yds / g) * 100) / 100,
      rushing_yds_pg: Math.round((p.rushing_yds / g) * 100) / 100,
      receiving_yds_pg: Math.round((p.receiving_yds / g) * 100) / 100,
      passing_attempts_pg: Math.round((p.passing_attempts / g) * 100) / 100,
      total_receptions: p.receptions,
      total_carries: p.carries,
      total_passing_tds: p.passing_tds,
      total_rushing_tds: p.rushing_tds,
      total_receiving_tds: p.receiving_tds,
    });
  }

  console.log(`[nflverse] Matched ${values.length} players to Sleeper IDs`);

  const BATCH = 50;
  for (let i = 0; i < values.length; i += BATCH) {
    const chunk = values.slice(i, i + BATCH);
    const frags = chunk.map(
      (v) => sql`(
        ${v.sleeper_id}, ${v.season}, ${v.games_played},
        ${v.receptions_pg}, ${v.targets_pg}, ${v.carries_pg},
        ${v.passing_tds_pg}, ${v.rushing_tds_pg}, ${v.receiving_tds_pg},
        ${v.passing_yds_pg}, ${v.rushing_yds_pg}, ${v.receiving_yds_pg},
        ${v.passing_attempts_pg},
        ${v.total_receptions}, ${v.total_carries},
        ${v.total_passing_tds}, ${v.total_rushing_tds}, ${v.total_receiving_tds}
      )`
    );
    await db.execute(sql`
      INSERT INTO player_seasonal_stats (
        sleeper_id, season, games_played,
        receptions_pg, targets_pg, carries_pg,
        passing_tds_pg, rushing_tds_pg, receiving_tds_pg,
        passing_yds_pg, rushing_yds_pg, receiving_yds_pg,
        passing_attempts_pg,
        total_receptions, total_carries,
        total_passing_tds, total_rushing_tds, total_receiving_tds
      ) VALUES ${sql.join(frags, sql`, `)}
      ON CONFLICT (sleeper_id, season) DO UPDATE SET
        games_played = EXCLUDED.games_played,
        receptions_pg = EXCLUDED.receptions_pg,
        targets_pg = EXCLUDED.targets_pg,
        carries_pg = EXCLUDED.carries_pg,
        passing_tds_pg = EXCLUDED.passing_tds_pg,
        rushing_tds_pg = EXCLUDED.rushing_tds_pg,
        receiving_tds_pg = EXCLUDED.receiving_tds_pg,
        passing_yds_pg = EXCLUDED.passing_yds_pg,
        rushing_yds_pg = EXCLUDED.rushing_yds_pg,
        receiving_yds_pg = EXCLUDED.receiving_yds_pg,
        passing_attempts_pg = EXCLUDED.passing_attempts_pg,
        total_receptions = EXCLUDED.total_receptions,
        total_carries = EXCLUDED.total_carries,
        total_passing_tds = EXCLUDED.total_passing_tds,
        total_rushing_tds = EXCLUDED.total_rushing_tds,
        total_receiving_tds = EXCLUDED.total_receiving_tds
    `);
  }

  console.log(`[nflverse] Upserted ${values.length} player seasonal stats`);
  return { season, players: values.length };
}
