import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";

const DYNASTY_TYPE = 2;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function typeFromRawJson(rawJson: string | null): number | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as { settings?: { type?: unknown } };
    return toNumber(parsed?.settings?.type ?? null);
  } catch {
    return null;
  }
}

function isDynastyType(type: number | null): boolean {
  return type === DYNASTY_TYPE;
}

async function fetchAndCacheLeagueType(leagueId: string): Promise<number | null> {
  try {
    const league = await getLeague(leagueId);
    if (!league) return null;
    const type = toNumber((league.settings as { type?: unknown } | undefined)?.type ?? null);
    await db.execute(sql`
      UPDATE leagues
      SET raw_json = ${JSON.stringify(league)}, updated_at = ${Date.now()}
      WHERE league_id = ${leagueId}
    `);
    return type;
  } catch {
    return null;
  }
}

async function resolveDynastyLeagueIds(
  rows: Array<{ league_id: string; raw_json: string | null; league_type: number | null }>
): Promise<string[]> {
  const dynasty: string[] = [];
  const unknown: string[] = [];

  for (const r of rows) {
    const type = r.league_type ?? typeFromRawJson(r.raw_json);
    if (type == null) unknown.push(r.league_id);
    else if (isDynastyType(type)) dynasty.push(r.league_id);
  }

  if (unknown.length === 0) return dynasty;

  const resolved = await Promise.all(
    unknown.map(async (leagueId) => ({ leagueId, type: await fetchAndCacheLeagueType(leagueId) }))
  );
  for (const r of resolved) {
    if (isDynastyType(r.type)) dynasty.push(r.leagueId);
  }

  return dynasty;
}

export async function getDynastyLeagueIdsForUserLatestSeason(userId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT l.league_id, l.raw_json, l.league_type
    FROM user_leagues ul
    JOIN leagues l ON ul.league_id = l.league_id
    WHERE ul.user_id = ${userId}
      AND l.season = (
        SELECT MAX(l2.season)
        FROM user_leagues ul2
        JOIN leagues l2 ON ul2.league_id = l2.league_id
        WHERE ul2.user_id = ${userId}
      )
  `);
  return resolveDynastyLeagueIds(rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>);
}

export async function getDynastyLeagueIdsForUserAllSeasons(userId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT l.league_id, l.raw_json, l.league_type
    FROM user_leagues ul
    JOIN leagues l ON ul.league_id = l.league_id
    WHERE ul.user_id = ${userId}
  `);
  return resolveDynastyLeagueIds(rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>);
}

export function isDynastyLeagueFromSleeperSettings(
  settings: Record<string, unknown> | undefined
): boolean {
  const type = toNumber((settings as { type?: unknown } | undefined)?.type ?? null);
  return isDynastyType(type);
}
