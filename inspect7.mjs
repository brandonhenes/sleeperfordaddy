import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

const stats = await sql`SELECT COUNT(*) as total_rows, COUNT(DISTINCT owner_id) as unique_owners, COUNT(DISTINCT league_id) as unique_leagues FROM roster_players`;
console.log("Current totals:", JSON.stringify(stats[0]));

const perLeague = await sql`SELECT rp.league_id, l.name, COUNT(DISTINCT rp.owner_id) as owners FROM roster_players rp JOIN leagues l ON rp.league_id = l.league_id GROUP BY rp.league_id, l.name ORDER BY owners DESC LIMIT 5`;
console.log("\nTop leagues by owner count:");
for (const r of perLeague) console.log(`  ${r.name}: ${r.owners} owners`);

await sql.end();
