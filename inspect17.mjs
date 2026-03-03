import postgres from "postgres";
import dotenv from "dotenv";
dotenv.config();
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, prepare: false, idle_timeout: 5 });

const types = await sql`SELECT league_type, COUNT(*) as cnt FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) GROUP BY league_type ORDER BY league_type`;
console.log("Current season league types:");
for (const r of types) console.log(`  type ${r.league_type}: ${r.cnt} leagues`);

// Check the redraft league
const redraft = await sql`SELECT league_id, name, league_type FROM leagues WHERE season = (SELECT MAX(season) FROM leagues) AND league_type != 2`;
console.log("\nNon-dynasty leagues:", redraft.map(r => `${r.name} (type=${r.league_type})`));

await sql.end();
