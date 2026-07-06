import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeagueIdsForUserLatestSeason, type LeagueScope } from "./dynasty-leagues.js";
import { parseLeagueScoring, scoringLabel } from "./scoring-adjustment.js";
import type { LeagueSummary } from "../../shared/types.js";

const SUMMARY_TTL_MS = 5 * 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 16;

const summaryCache = new Map<string, { data: LeagueSummary[]; expires: number }>();

function detectMode(rosterPositions: string[] | null): "sf" | "1qb" {
  const positions = rosterPositions ?? [];
  if (positions.includes("SUPER_FLEX")) return "sf";
  return positions.filter((position) => position === "QB").length >= 2 ? "sf" : "1qb";
}

function setSummaryCache(key: string, data: LeagueSummary[]) {
  summaryCache.set(key, { data, expires: Date.now() + SUMMARY_TTL_MS });

  const now = Date.now();
  for (const [cacheKey, value] of summaryCache.entries()) {
    if (value.expires <= now) summaryCache.delete(cacheKey);
  }
  while (summaryCache.size > SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = summaryCache.keys().next().value;
    if (!oldestKey) break;
    summaryCache.delete(oldestKey);
  }
}

export function clearLeagueSummaryCache(username?: string) {
  if (!username) {
    summaryCache.clear();
    return;
  }

  const prefix = `${username.toLowerCase()}:`;
  for (const key of summaryCache.keys()) {
    if (key.startsWith(prefix)) summaryCache.delete(key);
  }
}

export async function getLeagueSummaries(
  username: string,
  scope: LeagueScope = "dynasty"
): Promise<LeagueSummary[]> {
  const cacheKey = `${username.toLowerCase()}:${scope}`;
  const now = Date.now();
  const hit = summaryCache.get(cacheKey);
  if (hit && hit.expires > now) {
    summaryCache.delete(cacheKey);
    summaryCache.set(cacheKey, hit);
    return hit.data;
  }

  const userRows = await db.execute(sql`
    SELECT user_id
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const leagueIds = await getLeagueIdsForUserLatestSeason(userId, scope);
  if (leagueIds.length === 0) return [];

  const leagueInClause = sql.join(leagueIds.map((leagueId) => sql`${leagueId}`), sql`, `);
  const rows = await db.execute(sql`
    SELECT
      l.league_id,
      l.name AS league_name,
      l.total_rosters,
      l.roster_positions,
      l.scoring_settings,
      EXISTS (
        SELECT 1
        FROM league_draft_orders ldo
        WHERE ldo.league_id = l.league_id
      ) AS draft_data_available
    FROM leagues l
    WHERE l.league_id IN (${leagueInClause})
    ORDER BY l.name ASC
  `);

  type LeagueSummaryRow = {
    league_id: string;
    league_name: string;
    total_rosters: number | null;
    roster_positions: string[] | null;
    scoring_settings: Record<string, unknown> | null;
    draft_data_available: boolean | null;
  };

  const summaries = (rows as unknown as LeagueSummaryRow[]).map((row) => {
    const scoring = parseLeagueScoring(row.scoring_settings ?? null);
    return {
      league_id: row.league_id,
      league_name: row.league_name,
      mode: detectMode(row.roster_positions),
      draft_data_available: Boolean(row.draft_data_available),
      scoring_label: scoringLabel(scoring),
      total_rosters: row.total_rosters ?? 0,
    } satisfies LeagueSummary;
  });

  setSummaryCache(cacheKey, summaries);
  return summaries;
}
