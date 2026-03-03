import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });
const userId = '334382177695313920';

// Check rosters for current season leagues
const current = await sql`
  SELECT l.name, l.league_id, l.season, r.wins, r.losses, r.fpts
  FROM leagues l
  LEFT JOIN rosters r ON l.league_id = r.league_id AND r.owner_id = ${userId}
  WHERE l.season = (SELECT MAX(season) FROM leagues) AND l.league_type = 2
  ORDER BY l.name LIMIT 5
`;
console.log("Current season (2026) rosters:");
for (const r of current) console.log(`  ${r.name}: ${r.wins}-${r.losses} fpts=${r.fpts}`);

// Check rosters for previous season
const prev = await sql`
  SELECT l.name, l.league_id, l.season, r.wins, r.losses, r.fpts
  FROM leagues l
  JOIN rosters r ON l.league_id = r.league_id AND r.owner_id = ${userId}
  WHERE l.season = 2025 AND l.league_type = 2
  ORDER BY r.fpts DESC NULLS LAST LIMIT 5
`;
console.log("\n2025 season rosters:");
for (const r of prev) console.log(`  ${r.name}: ${r.wins}-${r.losses} fpts=${r.fpts}`);

// Check if current leagues have previous_league_id pointing to 2025 leagues with records
const chain = await sql`
  SELECT c.name, c.league_id AS current_id, c.previous_league_id,
         r.wins, r.losses, r.fpts
  FROM leagues c
  LEFT JOIN rosters r ON c.previous_league_id = r.league_id AND r.owner_id = ${userId}
  WHERE c.season = (SELECT MAX(season) FROM leagues) AND c.league_type = 2
  ORDER BY r.fpts DESC NULLS LAST LIMIT 5
`;
console.log("\nCurrent leagues -> previous season records:");
for (const r of chain) console.log(`  ${r.name}: prev=${r.previous_league_id} -> ${r.wins}-${r.losses} fpts=${r.fpts}`);

await sql.end();
