import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check Sleeper API for league settings
const leagues = await sql`SELECT league_id, name FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) LIMIT 5`;

for (const l of leagues) {
  const resp = await fetch(`https://api.sleeper.app/v1/league/${l.league_id}`);
  const data = await resp.json();
  console.log(`${l.name}: settings.type=${data.settings?.type}, status=${data.status}, previous_league_id=${data.previous_league_id}`);
}

// Also check a known redraft league if we can identify one
// Check which leagues have previous_league_id = null or "0"
const noPrev = await sql`SELECT league_id, name, previous_league_id FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) AND (previous_league_id IS NULL OR previous_league_id = '0' OR previous_league_id = '')`;
console.log(`\nLeagues with no previous_league_id: ${noPrev.length}`);
for (const l of noPrev) console.log(`  ${l.name} (prev: ${l.previous_league_id})`);

await sql.end();
