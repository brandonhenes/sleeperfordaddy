import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface ResolvedPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  age: number | null;
}

const SKILL_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type SkillPosition = (typeof SKILL_POSITIONS)[number];

const NICKNAME_MAP: Record<string, string[]> = {
  gabe: ["gabriel"],
  mike: ["michael"],
  dj: ["d.j.", "d j"],
  will: ["william"],
  josh: ["joshua"],
  tony: ["anthony"],
};

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.'`,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSuffix(input: string): string {
  return input.replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, "").trim();
}

function buildNameVariants(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  const base = stripSuffix(trimmed);
  variants.add(trimmed);
  variants.add(base);
  variants.add(normalizeName(trimmed));
  variants.add(normalizeName(base));

  const parts = normalizeName(base).split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const rest = parts.slice(1).join(" ");
    const expansions = NICKNAME_MAP[first] ?? [];
    for (const e of expansions) {
      variants.add(`${e} ${rest}`);
    }
  }

  return [...variants].filter(Boolean);
}

function positionFilterSql(positions?: SkillPosition[]) {
  const use = positions && positions.length > 0 ? positions : [...SKILL_POSITIONS];
  const frags = use.map((p) => sql`${p}`);
  return sql`AND pm.position IN (${sql.join(frags, sql`, `)})`;
}

export async function resolvePlayer(input: string, positions?: SkillPosition[]): Promise<ResolvedPlayer | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const posSql = positionFilterSql(positions);

  const exactById = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM players_master pm
    WHERE pm.player_id = ${trimmed}
      ${posSql}
    LIMIT 1
  `);
  const byId = (exactById as unknown as ResolvedPlayer[])[0];
  if (byId) return byId;

  const exactByName = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM players_master pm
    WHERE LOWER(pm.full_name) = LOWER(${trimmed})
      ${posSql}
    LIMIT 1
  `);
  const byName = (exactByName as unknown as ResolvedPlayer[])[0];
  if (byName) return byName;

  const aliasMatch = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM player_aliases pa
    JOIN players_master pm ON pm.player_id = pa.player_id
    WHERE LOWER(pa.alias) = LOWER(${trimmed})
      ${posSql}
    LIMIT 1
  `);
  const byAlias = (aliasMatch as unknown as ResolvedPlayer[])[0];
  if (byAlias) return byAlias;

  const variants = buildNameVariants(trimmed);
  if (variants.length > 0) {
    const vf = variants.map((v) => sql`${v}`);
    const variantByName = await db.execute(sql`
      SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
      FROM players_master pm
      WHERE LOWER(pm.full_name) IN (${sql.join(vf, sql`, `)})
        ${posSql}
      LIMIT 1
    `);
    const byVariantName = (variantByName as unknown as ResolvedPlayer[])[0];
    if (byVariantName) return byVariantName;

    const variantByAlias = await db.execute(sql`
      SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
      FROM player_aliases pa
      JOIN players_master pm ON pm.player_id = pa.player_id
      WHERE LOWER(pa.alias) IN (${sql.join(vf, sql`, `)})
        ${posSql}
      LIMIT 1
    `);
    const byVariantAlias = (variantByAlias as unknown as ResolvedPlayer[])[0];
    if (byVariantAlias) return byVariantAlias;
  }

  const fuzzyRows = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM players_master pm
    WHERE pm.full_name ILIKE ${`%${trimmed}%`}
      ${posSql}
    ORDER BY
      CASE
        WHEN LOWER(pm.full_name) = LOWER(${trimmed}) THEN 0
        WHEN LOWER(pm.full_name) LIKE LOWER(${`${trimmed}%`}) THEN 1
        ELSE 2
      END,
      pm.full_name ASC
    LIMIT 1
  `);
  return (fuzzyRows as unknown as ResolvedPlayer[])[0] ?? null;
}

export interface AliasBackfillStats {
  aliasesInserted: number;
}

export async function backfillPlayerAliases(): Promise<AliasBackfillStats> {
  const rows = await db.execute(sql`
    SELECT player_id, full_name
    FROM players_master
    WHERE full_name IS NOT NULL
      AND position IN ('QB', 'RB', 'WR', 'TE')
  `);

  type PMRow = { player_id: string; full_name: string };
  const players = rows as unknown as PMRow[];
  const tuples: Array<{ player_id: string; alias: string; source: string }> = [];

  for (const p of players) {
    const variants = buildNameVariants(p.full_name);
    for (const alias of variants) {
      tuples.push({
        player_id: p.player_id,
        alias,
        source: "generated",
      });
    }
  }

  if (tuples.length === 0) return { aliasesInserted: 0 };

  let inserted = 0;
  const BATCH = 250;
  for (let i = 0; i < tuples.length; i += BATCH) {
    const chunk = tuples.slice(i, i + BATCH);
    const vals = chunk.map((r) => sql`(${r.player_id}, ${r.alias}, ${r.source})`);
    const res = await db.execute(sql`
      WITH ins AS (
        INSERT INTO player_aliases (player_id, alias, source)
        VALUES ${sql.join(vals, sql`, `)}
        ON CONFLICT (player_id, alias) DO NOTHING
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM ins
    `);
    inserted += (res as unknown as { count: number }[])[0]?.count ?? 0;
  }

  return { aliasesInserted: inserted };
}
