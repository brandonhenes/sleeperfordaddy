import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";

const DYNASTY_TYPE = 2;
const DYNASTY_IDS_TTL_MS = 5 * 60 * 1000;
const LEAGUE_TYPE_TTL_MS = 6 * 60 * 60 * 1000;

export type LeagueScope = "dynasty" | "redraft";

const latestLeagueCache = new Map<string, { ids: string[]; expires: number }>();
const latestLeagueInFlight = new Map<string, Promise<string[]>>();
const allSeasonsLeagueCache = new Map<string, { ids: string[]; expires: number }>();
const allSeasonsLeagueInFlight = new Map<string, Promise<string[]>>();
const leagueTypeCache = new Map<string, { type: number | null; expires: number }>();

export function clearDynastyLeagueCache(userId?: string) {
  if (!userId) {
    latestLeagueCache.clear();
    latestLeagueInFlight.clear();
    allSeasonsLeagueCache.clear();
    allSeasonsLeagueInFlight.clear();
    leagueTypeCache.clear();
    return;
  }

  const prefix = `${userId}:`;
  for (const key of latestLeagueCache.keys()) {
    if (key.startsWith(prefix)) latestLeagueCache.delete(key);
  }
  for (const key of latestLeagueInFlight.keys()) {
    if (key.startsWith(prefix)) latestLeagueInFlight.delete(key);
  }
  for (const key of allSeasonsLeagueCache.keys()) {
    if (key.startsWith(prefix)) allSeasonsLeagueCache.delete(key);
  }
  for (const key of allSeasonsLeagueInFlight.keys()) {
    if (key.startsWith(prefix)) allSeasonsLeagueInFlight.delete(key);
  }
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

function cacheKey(userId: string, scope: LeagueScope): string {
  return `${userId}:${scope}`;
}

function isLeagueInScope(type: number | null, scope: LeagueScope): boolean {
  if (type == null) return false;
  if (scope === "dynasty") return isDynastyType(type);
  return type !== DYNASTY_TYPE;
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

async function resolveLeagueIdsForScope(
  rows: Array<{ league_id: string; raw_json: string | null; league_type: number | null }>,
  scope: LeagueScope
): Promise<string[]> {
  const matches: string[] = [];
  const unknown: string[] = [];

  for (const r of rows) {
    const type = r.league_type ?? typeFromRawJson(r.raw_json);
    if (type == null) unknown.push(r.league_id);
    else if (isLeagueInScope(type, scope)) matches.push(r.league_id);
  }

  if (unknown.length === 0) return matches;

  const resolved = await Promise.all(
    unknown.map(async (leagueId) => ({ leagueId, type: await fetchAndCacheLeagueType(leagueId) }))
  );
  for (const r of resolved) {
    if (isLeagueInScope(r.type, scope)) matches.push(r.leagueId);
  }

  return matches;
}

export async function getLeagueIdsForUserLatestSeason(
  userId: string,
  scope: LeagueScope = "dynasty"
): Promise<string[]> {
  const now = Date.now();
  const key = cacheKey(userId, scope);
  const hit = latestLeagueCache.get(key);
  if (hit && hit.expires > now) return hit.ids;

  const pending = latestLeagueInFlight.get(key);
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
    const ids = await resolveLeagueIdsForScope(
      rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>,
      scope
    );
    latestLeagueCache.set(key, { ids, expires: Date.now() + DYNASTY_IDS_TTL_MS });
    return ids;
  })();

  latestLeagueInFlight.set(key, work);
  try {
    return await work;
  } finally {
    latestLeagueInFlight.delete(key);
  }
}

export async function getLeagueIdsForUserAllSeasons(
  userId: string,
  scope: LeagueScope = "dynasty"
): Promise<string[]> {
  const now = Date.now();
  const key = cacheKey(userId, scope);
  const hit = allSeasonsLeagueCache.get(key);
  if (hit && hit.expires > now) return hit.ids;

  const pending = allSeasonsLeagueInFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const rows = await db.execute(sql`
      SELECT l.league_id, l.raw_json, l.league_type
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      WHERE ul.user_id = ${userId}
    `);
    const ids = await resolveLeagueIdsForScope(
      rows as unknown as Array<{ league_id: string; raw_json: string | null; league_type: number | null }>,
      scope
    );
    allSeasonsLeagueCache.set(key, { ids, expires: Date.now() + DYNASTY_IDS_TTL_MS });
    return ids;
  })();

  allSeasonsLeagueInFlight.set(key, work);
  try {
    return await work;
  } finally {
    allSeasonsLeagueInFlight.delete(key);
  }
}

export async function getDynastyLeagueIdsForUserLatestSeason(userId: string): Promise<string[]> {
  return getLeagueIdsForUserLatestSeason(userId, "dynasty");
}

export async function getDynastyLeagueIdsForUserAllSeasons(userId: string): Promise<string[]> {
  return getLeagueIdsForUserAllSeasons(userId, "dynasty");
}

export function isDynastyLeagueFromSleeperSettings(
  settings: Record<string, unknown> | undefined
): boolean {
  const type = toNumber((settings as { type?: unknown } | undefined)?.type ?? null);
  return isDynastyType(type);
}
