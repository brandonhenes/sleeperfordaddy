import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check if Saquon is now in "50 Baby Daddys"
const check = await sql`
  SELECT rp.owner_id, rp.player_id
  FROM roster_players rp
  WHERE rp.league_id = '1313407359871127552'
    AND rp.player_id = '4866'
`;
console.log(`Saquon in 50 Baby Daddys: ${check.length} entries`, check.length > 0 ? `(owner: ${check[0].owner_id})` : '');

// Overall orphan count
const orphans = await sql`SELECT COUNT(*) as cnt FROM roster_players WHERE owner_id LIKE 'orphan_%'`;
console.log(`Orphan roster entries: ${orphans[0].cnt}`);

// Total roster data now
const totals = await sql`SELECT COUNT(*) as total, COUNT(DISTINCT owner_id) as owners, COUNT(DISTINCT league_id) as leagues FROM roster_players`;
console.log(`Totals: ${totals[0].total} rows, ${totals[0].owners} owners, ${totals[0].leagues} leagues`);

await sql.end();
