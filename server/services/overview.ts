import { getUserByUsername } from "../db/queries/users.js";
import { getLeaguesForUser } from "../db/queries/leagues.js";
import { buildLeagueGroups } from "./league-groups.js";
import { getDynastyLeagueIdsForUserAllSeasons } from "./dynasty-leagues.js";
import type { OverviewData, LeagueSeason, LeagueGroup } from "../../shared/types.js";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const OVERVIEW_TTL_MS = 30_000;
const overviewCache = new Map<
  string,
  { data: { overview: OverviewData; league_groups: LeagueGroup[] }; expires: number }
>();
const overviewInFlight = new Map<
  string,
  Promise<{ overview: OverviewData; league_groups: LeagueGroup[] } | null>
>();

async function buildOverviewForUser(user: {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
}): Promise<OverviewData> {
  const [allUserLeagues, dynastyLeagueIds] = await Promise.all([
    getLeaguesForUser(user.user_id),
    getDynastyLeagueIdsForUserAllSeasons(user.user_id),
  ]);
  const dynastySet = new Set(dynastyLeagueIds);
  const allLeagues = allUserLeagues.filter((l) => dynastySet.has(l.league_id));

  const rosterMap = new Map<
    string,
    { roster_id: number; wins: number; losses: number; ties: number; fpts: number }
  >();
  if (allLeagues.length > 0) {
    const leagueFrags = allLeagues.map((l) => sql`${l.league_id}`);
    const inClause = sql.join(leagueFrags, sql`, `);
    const rosterRows = await db.execute(sql`
      SELECT league_id, roster_id, wins, losses, ties, fpts
      FROM rosters
      WHERE owner_id = ${user.user_id}
        AND league_id IN (${inClause})
    `);
    for (const row of rosterRows as unknown as Array<{
      league_id: string;
      roster_id: number;
      wins: number | null;
      losses: number | null;
      ties: number | null;
      fpts: number | null;
    }>) {
      rosterMap.set(row.league_id, {
        roster_id: row.roster_id,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        ties: row.ties ?? 0,
        fpts: row.fpts ?? 0,
      });
    }
  }

  // Build league seasons with records
  const seasons: Record<string, LeagueSeason[]> = {};
  let totalWins = 0;
  let totalLosses = 0;
  let totalTies = 0;

  for (const league of allLeagues) {
    const seasonKey = String(league.season);
    if (!seasons[seasonKey]) {
      seasons[seasonKey] = [];
    }

    const roster = rosterMap.get(league.league_id);

    const leagueSeason: LeagueSeason = {
      league_id: league.league_id,
      league_name: league.name,
      season: seasonKey,
      group_id: league.group_id,
      roster_id: roster?.roster_id ?? 0,
      wins: roster?.wins ?? 0,
      losses: roster?.losses ?? 0,
      ties: roster?.ties ?? 0,
      fpts: roster?.fpts ?? 0,
      finish_place: null,
      finish_source: "unknown",
      total_rosters: league.total_rosters ?? 0,
      avatar: null,
    };

    totalWins += leagueSeason.wins;
    totalLosses += leagueSeason.losses;
    totalTies += leagueSeason.ties;

    seasons[seasonKey].push(leagueSeason);
  }

  return {
    user: {
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name ?? user.username,
      avatar: user.avatar,
    },
    seasons,
    totals: {
      wins: totalWins,
      losses: totalLosses,
      ties: totalTies,
      leagues: allLeagues.length,
    },
  };
}

/**
 * Build the profile dashboard data for a user.
 * Returns user info, leagues grouped by season, and aggregate records.
 */
export async function getOverview(username: string): Promise<OverviewData | null> {
  const bundle = await getOverviewWithGroups(username);
  return bundle?.overview ?? null;
}

export async function getOverviewWithGroups(
  username: string
): Promise<{ overview: OverviewData; league_groups: LeagueGroup[] } | null> {
  const cacheKey = username.toLowerCase();
  const now = Date.now();
  const hit = overviewCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.data;

  const pending = overviewInFlight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
  const user = await getUserByUsername(username);
  if (!user) return null;

  const [overview, leagueGroups] = await Promise.all([
    buildOverviewForUser(user),
    buildLeagueGroups(user.user_id),
  ]);

    const data = { overview, league_groups: leagueGroups };
    overviewCache.set(cacheKey, { data, expires: Date.now() + OVERVIEW_TTL_MS });
    return data;
  })();

  overviewInFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    overviewInFlight.delete(cacheKey);
  }
}

/**
 * Get league groups for a user.
 */
export async function getLeagueGroupsForUser(
  username: string
): Promise<LeagueGroup[]> {
  const bundle = await getOverviewWithGroups(username);
  return bundle?.league_groups ?? [];
}
