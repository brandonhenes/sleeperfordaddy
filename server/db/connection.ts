import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
const poolMax = Number(process.env.PG_POOL_MAX ?? 5);

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString, {
  max: Number.isFinite(poolMax) && poolMax > 0 ? Math.floor(poolMax) : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: false },
  prepare: false, // Required for Supabase connection pooler (transaction mode)
});

export const db = drizzle(client, { schema });

export async function verifyConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    console.log("[db] Connected to PostgreSQL");
    return true;
  } catch (err) {
    console.error("[db] Connection failed:", err);
    return false;
  }
}
