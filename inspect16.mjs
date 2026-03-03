import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check ALL current leagues for their settings.type via API
const leagues = await sql`SELECT league_id, name FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) ORDER BY name`;

const types = {};
for (const l of leagues) {
  const resp = await fetch(`https://api.sleeper.app/v1/league/${l.league_id}`);
  const data = await resp.json();
  const t = data.settings?.type ?? 'unknown';
  types[t] = (types[t] || 0) + 1;
  if (t !== 2) console.log(`NON-DYNASTY: ${l.name} -> type=${t}`);
}
console.log(`\nType distribution:`, JSON.stringify(types));
// 0=redraft, 1=keeper, 2=dynasty

await sql.end();
