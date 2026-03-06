import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const DRAFT_CSV_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv";
const MIN_SEASON = 2015;

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
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
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function syncNflDraftHistory(): Promise<{ synced: number }> {
  console.log("[nfl-draft] Fetching NFL draft history from nflverse...");
  const resp = await fetch(DRAFT_CSV_URL);
  if (!resp.ok) throw new Error(`nflverse draft fetch failed: ${resp.status}`);
  const text = await resp.text();

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Empty nflverse draft CSV");

  const headers = parseCSVLine(lines[0]);
  const idx = (name: string) => headers.indexOf(name);

  interface DraftRow {
    season: number;
    round: number;
    pick: number;
    team: string;
    gsis_id: string;
    player_name: string;
    position: string;
    college: string;
    age: number;
    games: number;
    seasons_started: number;
    all_pro: number;
    pro_bowls: number;
    pass_yards: number;
    pass_tds: number;
    rush_yards: number;
    rush_tds: number;
    receptions: number;
    rec_yards: number;
    rec_tds: number;
    career_av: number;
  }

  const rows: DraftRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const season = num(vals[idx("season")]);
    if (season < MIN_SEASON) continue;
    const position = vals[idx("position")] ?? "";
    if (!["QB", "RB", "WR", "TE"].includes(position)) continue;

    rows.push({
      season,
      round: num(vals[idx("round")]),
      pick: num(vals[idx("pick")]),
      team: vals[idx("team")] ?? "",
      gsis_id: vals[idx("gsis_id")] ?? "",
      player_name: vals[idx("pfr_player_name")] ?? "",
      position,
      college: vals[idx("college")] ?? "",
      age: num(vals[idx("age")]),
      games: num(vals[idx("games")]),
      seasons_started: num(vals[idx("seasons_started")]),
      all_pro: num(vals[idx("allpro")]),
      pro_bowls: num(vals[idx("probowls")]),
      pass_yards: num(vals[idx("pass_yards")]),
      pass_tds: num(vals[idx("pass_tds")]),
      rush_yards: num(vals[idx("rush_yards")]),
      rush_tds: num(vals[idx("rush_tds")]),
      receptions: num(vals[idx("receptions")]),
      rec_yards: num(vals[idx("rec_yards")]),
      rec_tds: num(vals[idx("rec_tds")]),
      career_av: num(vals[idx("car_av")]),
    });
  }

  console.log(`[nfl-draft] Parsed ${rows.length} offensive draft picks since ${MIN_SEASON}`);

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const frags = chunk.map(
      (r) => sql`(
        ${r.season}, ${r.round}, ${r.pick}, ${r.team}, ${r.gsis_id},
        ${r.player_name}, ${r.position}, ${r.college}, ${r.age},
        ${r.games}, ${r.seasons_started}, ${r.all_pro}, ${r.pro_bowls},
        ${r.pass_yards}, ${r.pass_tds}, ${r.rush_yards}, ${r.rush_tds},
        ${r.receptions}, ${r.rec_yards}, ${r.rec_tds}, ${r.career_av}
      )`,
    );
    await db.execute(sql`
      INSERT INTO nfl_draft_picks (
        season, round, pick, team, gsis_id, player_name, position, college, age,
        games_played, seasons_started, all_pro, pro_bowls,
        pass_yards, pass_tds, rush_yards, rush_tds,
        receptions, rec_yards, rec_tds, career_av
      ) VALUES ${sql.join(frags, sql`, `)}
      ON CONFLICT (season, pick) DO UPDATE SET
        games_played = EXCLUDED.games_played,
        seasons_started = EXCLUDED.seasons_started,
        all_pro = EXCLUDED.all_pro,
        pro_bowls = EXCLUDED.pro_bowls,
        pass_yards = EXCLUDED.pass_yards,
        pass_tds = EXCLUDED.pass_tds,
        rush_yards = EXCLUDED.rush_yards,
        rush_tds = EXCLUDED.rush_tds,
        receptions = EXCLUDED.receptions,
        rec_yards = EXCLUDED.rec_yards,
        rec_tds = EXCLUDED.rec_tds,
        career_av = EXCLUDED.career_av
    `);
  }

  await db.execute(sql`
    UPDATE prospect_profiles pp
    SET landing_spot = ndp.team || ' (Rd ' || ndp.round || ', Pick ' || ndp.pick || ')'
    FROM nfl_draft_picks ndp
    WHERE ndp.season = 2026
      AND LOWER(ndp.player_name) = LOWER(pp.player_name)
      AND ndp.position = pp.position
      AND pp.landing_spot IS NULL
  `);

  console.log(`[nfl-draft] Synced ${rows.length} draft picks`);
  return { synced: rows.length };
}
