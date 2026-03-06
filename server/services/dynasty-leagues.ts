import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";

const DYNASTY_TYPE = 2;
const DYNASTY_IDS_TTL_MS = 5 * 60 * 1000;
const LEAGUE_TYPE_TTL_MS = 6 * 60 * 60 * 1000;

const latestDynastyCache = new Map<string, { ids: string[]; expires: number }>();
const latestDynastyInFlight = new Map<string, Promise<string[]>>();
const allSeasonsDynastyCache = new Map<string, { ids: string[]; expires: number }>();
const allSeasonsDynastyInFlight = new Map<string, Promise<string[]>>();
const leagueTypeCache = new Map<string, { type: number | null; expires: number }>();

export function clearDynastyLeagueCache(userId?: string) {
  if (!userId) {
    latestDynastyCache.clear();
    latestDynastyInFlight.clear();
    allSeasonsDynastyCache.clear();
    allSeasonsDynastyInFlight.clear();
    leagueTypeCache.clear();
    return;
  }

  latestDynastyCache.delete(userId);
  latestDynastyInFlight.delete(userId);
  allSeasonsDynastyCache.delete(userId);
  allSeasonsDynastyInFlight.delete(userId);
}

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
  const now = Date.now();
  const hit = leagueTypeCache.get(leagueId);
  if (hit && hit.expires > now) return hit.type;

  try {
    const league = await getLeague(leagueId);
    if (!league) return null;
    const type = toNumber((league.settings as { type?: unknown } | undefined)?.type ?? null);
    await db.execute(sql`
      UPDATE leagues
      SET raw_json = ${JSON.stringify(league)}, updated_at = ${Date.now()}
      WHERE league_id = ${leagueId}
    `);
    leagueTypeCache.set(leagueId, { type, expires: Date.now() + LEAGUE_TYPE_TTL_MS });
    return type;
  } catch {
    leagueTypeCache.set(leagueId, { type: null, expires: Date.now() + 60_000 });
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
  const now = Date.now();
  const hit = latestDynastyCache.get(userId);
  if (hit && hit.expires > now) return hit.ids;

  const pending = latestDynastyInFlight.get(userId);
  if (pending) return pending;

  const work = (async () => {
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
    const ids = await resolveDynastyLeagueIds(
      rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>
    );
    latestDynastyCache.set(userId, { ids, expires: Date.now() + DYNASTY_IDS_TTL_MS });
    return ids;
  })();

  latestDynastyInFlight.set(userId, work);
  try {
    return await work;
  } finally {
    latestDynastyInFlight.delete(userId);
  }
}

export async function getDynastyLeagueIdsForUserAllSeasons(userId: string): Promise<string[]> {
  const now = Date.now();
  const hit = allSeasonsDynastyCache.get(userId);
  if (hit && hit.expires > now) return hit.ids;

  const pending = allSeasonsDynastyInFlight.get(userId);
  if (pending) return pending;

  const work = (async () => {
    const rows = await db.execute(sql`
      SELECT l.league_id, l.raw_json, l.league_type
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      WHERE ul.user_id = ${userId}
    `);
    const ids = await resolveDynastyLeagueIds(
      rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>
    );
    allSeasonsDynastyCache.set(userId, { ids, expires: Date.now() + DYNASTY_IDS_TTL_MS });
    return ids;
  })();

  allSeasonsDynastyInFlight.set(userId, work);
  try {
    return await work;
  } finally {
    allSeasonsDynastyInFlight.delete(userId);
  }
}

export function isDynastyLeagueFromSleeperSettings(
  settings: Record<string, unknown> | undefined
): boolean {
  const type = toNumber((settings as { type?: unknown } | undefined)?.type ?? null);
  return isDynastyType(type);
}
