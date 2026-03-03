import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });
// Get user_id for henes35
const user = await sql`SELECT user_id FROM users WHERE LOWER(username) = 'henes35' LIMIT 1`;
console.log("user:", JSON.stringify(user));
// Check how roster_players links to users (via owner_id)
const cnt = await sql`SELECT COUNT(DISTINCT league_id) as leagues, COUNT(DISTINCT player_id) as players FROM roster_players WHERE owner_id = ${user[0].user_id}`;
console.log("counts:", JSON.stringify(cnt));
// Check fantasycalc_daily column names
const fc = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'fantasycalc_daily' ORDER BY ordinal_position`;
console.log("fc cols:", fc.map(c => c.column_name).join(", "));
await sql.end();
