import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });
const owners = await sql`SELECT DISTINCT owner_id FROM roster_players`;
console.log("owner_ids:", owners.map(r => r.owner_id));
await sql.end();
