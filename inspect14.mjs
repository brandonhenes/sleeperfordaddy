import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check leagues table columns
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leagues' ORDER BY ordinal_position`;
console.log("leagues columns:", cols.map(c => `${c.column_name}:${c.data_type}`).join(", "));

// Check for any type/settings columns
const sample = await sql`SELECT league_id, name, season, status, sport, previous_league_id, is_superflex FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) LIMIT 3`;
console.log("\nSample leagues:", JSON.stringify(sample, null, 2));

// Check if raw_json has dynasty info
const raw = await sql`SELECT league_id, name, raw_json FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) AND raw_json IS NOT NULL LIMIT 1`;
if (raw.length > 0 && raw[0].raw_json) {
  console.log("\nraw_json sample (first 500 chars):", raw[0].raw_json.substring(0, 500));
}

await sql.end();
