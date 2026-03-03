import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Get Saquon's player_id
const saquon = await sql`SELECT player_id, full_name FROM players_master WHERE full_name = 'Saquon Barkley'`;
console.log("Saquon in players_master:", JSON.stringify(saquon));

// Get henes35 user_id
const user = await sql`SELECT user_id FROM users WHERE LOWER(username) = 'henes35' LIMIT 1`;
const userId = user[0].user_id;

// Which leagues does henes35 own Saquon in?
const owned = await sql`
  SELECT rp.league_id, l.name, rp.player_id
  FROM roster_players rp
  JOIN leagues l ON rp.league_id = l.league_id
  WHERE rp.owner_id = ${userId}
    AND rp.player_id IN (SELECT player_id FROM players_master WHERE full_name = 'Saquon Barkley')
    AND l.season = (SELECT MAX(season) FROM leagues)
`;
console.log(`\nhenes35 owns Saquon in ${owned.length} leagues:`, owned.map(r => r.name));

// Now check: is Saquon rostered (by anyone) in ALL current leagues?
const rosteredAnywhere = await sql`
  SELECT rp.league_id, l.name, rp.owner_id, rp.player_id
  FROM roster_players rp
  JOIN leagues l ON rp.league_id = l.league_id
  WHERE rp.player_id IN (SELECT player_id FROM players_master WHERE full_name = 'Saquon Barkley')
    AND l.season = (SELECT MAX(season) FROM leagues)
  ORDER BY l.name
`;
console.log(`\nSaquon rostered in ${rosteredAnywhere.length} league-roster entries:`);
for (const r of rosteredAnywhere) console.log(`  ${r.name} (owner: ${r.owner_id}, player_id: ${r.player_id})`);

// Now get what the arbitrage API says
const resp = await fetch("http://localhost:5000/api/arbitrage/free-agents?username=henes35");
const arb = await resp.json();
const saquonArb = arb.find(p => p.player_name === 'Saquon Barkley');
if (saquonArb) {
  console.log(`\nArbitrage says Saquon: owned ${saquonArb.owned_league_count}/${saquonArb.total_league_count}, free in:`);
  for (const l of saquonArb.free_agent_leagues) console.log(`  ${l.league_name} (${l.league_id})`);
  
  // Check if those "free agent" leagues actually have Saquon rostered
  for (const l of saquonArb.free_agent_leagues) {
    const check = await sql`
      SELECT rp.owner_id, rp.player_id
      FROM roster_players rp
      WHERE rp.league_id = ${l.league_id}
        AND rp.player_id IN (SELECT player_id FROM players_master WHERE full_name = 'Saquon Barkley')
    `;
    console.log(`  -> ${l.league_name}: ${check.length} roster entries`, check.length > 0 ? `(owner: ${check[0].owner_id}, pid: ${check[0].player_id})` : '');
  }
}

await sql.end();
