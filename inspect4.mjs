import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

const totals = await sql`SELECT COUNT(*) as total_rows, COUNT(DISTINCT owner_id) as unique_owners, COUNT(DISTINCT league_id) as unique_leagues FROM roster_players`;
console.log("totals:", JSON.stringify(totals[0]));

const perLeague = await sql`SELECT league_id, COUNT(DISTINCT owner_id) as owners FROM roster_players GROUP BY league_id ORDER BY owners DESC LIMIT 5`;
console.log("owners per league:");
for (const r of perLeague) console.log(`  ${r.league_id}: ${r.owners} owners`);

await sql.end();
