import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check Sleeper API directly for "50 Baby Daddys" league
const resp = await fetch("https://api.sleeper.app/v1/league/1313407359871127552/rosters");
const rosters = await resp.json();

// Search all rosters for player_id 4866 (Saquon)
let found = false;
for (const r of rosters) {
  if (r.players && r.players.includes("4866")) {
    console.log(`Saquon (4866) found on roster ${r.roster_id}, owner ${r.owner_id}`);
    found = true;
  }
}
if (!found) {
  console.log("Saquon (4866) NOT on any roster in '50 Baby Daddys' — he's truly a free agent there!");
}

// Also check total players in that league's DB
const dbCount = await sql`SELECT COUNT(*) as cnt, COUNT(DISTINCT owner_id) as owners FROM roster_players WHERE league_id = '1313407359871127552'`;
console.log(`DB for 50 Baby Daddys: ${dbCount[0].cnt} roster entries, ${dbCount[0].owners} owners`);

const apiOwners = rosters.filter(r => r.owner_id).length;
console.log(`Sleeper API: ${rosters.length} rosters, ${apiOwners} with owners`);

await sql.end();
