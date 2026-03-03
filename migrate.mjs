import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });
await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS league_type integer`;
console.log("Column added");
await sql.end();
