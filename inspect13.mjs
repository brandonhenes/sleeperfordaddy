import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Get the league_id for "The 32 Team Grim Reaper (Y3)"
const league = await sql`SELECT league_id FROM leagues WHERE name LIKE '%32 Team Grim Reaper%' AND season = (SELECT MAX(season) FROM leagues)`;
const lid = league[0]?.league_id;
console.log("League ID:", lid);

// Check Sleeper API directly
const resp = await fetch(`https://api.sleeper.app/v1/league/${lid}/rosters`);
const rosters = await resp.json();
let found = false;
for (const r of rosters) {
  if (r.players && r.players.includes("4866")) {
    console.log(`Saquon found on roster ${r.roster_id}, owner: ${r.owner_id}`);
    found = true;
  }
}
if (!found) console.log("Saquon is truly a free agent in this league!");

await sql.end();
