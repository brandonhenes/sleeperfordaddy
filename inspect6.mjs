import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Pick a league and check DB roster data
const league = await sql`SELECT league_id, name, total_rosters FROM leagues WHERE league_id = '1185317993901383680'`;
console.log("League:", JSON.stringify(league[0]));

const dbOwners = await sql`SELECT DISTINCT owner_id FROM roster_players WHERE league_id = '1185317993901383680'`;
console.log("DB owners:", dbOwners.map(r => r.owner_id));

const dbCount = await sql`SELECT COUNT(*) as cnt FROM roster_players WHERE league_id = '1185317993901383680'`;
console.log("DB roster_player rows:", dbCount[0].cnt);

// Now call Sleeper API directly to compare
const resp = await fetch("https://api.sleeper.app/v1/league/1185317993901383680/rosters");
const rosters = await resp.json();
console.log(`\nSleeper API: ${rosters.length} rosters`);
for (const r of rosters.slice(0, 5)) {
  console.log(`  roster_id=${r.roster_id} owner_id=${r.owner_id} players=${r.players?.length ?? 0}`);
}

await sql.end();
