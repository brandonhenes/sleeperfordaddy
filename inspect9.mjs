import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

const bySeasonStatus = await sql`SELECT season, status, COUNT(*) as cnt FROM leagues GROUP BY season, status ORDER BY season DESC, status`;
console.log("leagues by season/status:");
for (const r of bySeasonStatus) console.log(`  ${r.season} ${r.status}: ${r.cnt}`);

// Check what henes35 has per season
const userId = (await sql`SELECT user_id FROM users WHERE LOWER(username) = 'henes35' LIMIT 1`)[0].user_id;
const bySeasonUser = await sql`
  SELECT l.season, l.status, COUNT(DISTINCT rp.league_id) as cnt
  FROM roster_players rp
  JOIN leagues l ON rp.league_id = l.league_id
  WHERE rp.owner_id = ${userId}
  GROUP BY l.season, l.status
  ORDER BY l.season DESC, l.status
`;
console.log("\nhenes35 leagues by season/status:");
for (const r of bySeasonUser) console.log(`  ${r.season} ${r.status}: ${r.cnt}`);

await sql.end();
