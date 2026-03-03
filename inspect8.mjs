import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

const stats = await sql`SELECT COUNT(*) as total_rows, COUNT(DISTINCT owner_id) as unique_owners, COUNT(DISTINCT league_id) as unique_leagues FROM roster_players`;
console.log("Final totals:", JSON.stringify(stats[0]));

const perLeague = await sql`SELECT rp.league_id, l.name, COUNT(DISTINCT rp.owner_id) as owners, l.total_rosters FROM roster_players rp JOIN leagues l ON rp.league_id = l.league_id GROUP BY rp.league_id, l.name, l.total_rosters ORDER BY owners DESC LIMIT 10`;
console.log("\nTop leagues by owner count:");
for (const r of perLeague) console.log(`  ${r.name}: ${r.owners}/${r.total_rosters} owners`);

const perLeagueMin = await sql`SELECT rp.league_id, l.name, COUNT(DISTINCT rp.owner_id) as owners, l.total_rosters FROM roster_players rp JOIN leagues l ON rp.league_id = l.league_id GROUP BY rp.league_id, l.name, l.total_rosters ORDER BY owners ASC LIMIT 5`;
console.log("\nLowest leagues by owner count:");
for (const r of perLeagueMin) console.log(`  ${r.name}: ${r.owners}/${r.total_rosters} owners`);

await sql.end();
