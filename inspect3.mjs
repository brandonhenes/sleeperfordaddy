import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

// Check if age exists and has data
const ages = await sql`SELECT position, COUNT(*) as cnt, AVG(age) as avg_age FROM players_master WHERE age IS NOT NULL AND age > 0 GROUP BY position ORDER BY cnt DESC LIMIT 8`;
console.log("age data:", JSON.stringify(ages));

// Sample roster with values for a league
const sample = await sql`
  SELECT rp.owner_id, pm.full_name, pm.position, fc.dynasty_value::int
  FROM roster_players rp
  JOIN players_master pm ON rp.player_id = pm.player_id
  LEFT JOIN fantasycalc_daily fc ON LOWER(pm.full_name) = LOWER(fc.player_name)
    AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
  WHERE rp.league_id = '1185317993901383680'
    AND pm.position IN ('QB','RB','WR','TE')
  ORDER BY rp.owner_id, pm.position, fc.dynasty_value DESC NULLS LAST
  LIMIT 20
`;
console.log("sample roster:", JSON.stringify(sample));

// How many teams in a typical league
const teams = await sql`SELECT COUNT(DISTINCT owner_id) as teams FROM roster_players WHERE league_id = '1185317993901383680'`;
console.log("teams in league:", teams[0].teams);

await sql.end();
