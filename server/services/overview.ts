import { getUserByUsername } from "../db/queries/users.js";
import { getLeaguesForUser } from "../db/queries/leagues.js";
import { getRosterForUser } from "../db/queries/rosters.js";
import { buildLeagueGroups } from "./league-groups.js";
import type { OverviewData, LeagueSeason, LeagueGroup } from "../../shared/types.js";

/**
 * Build the profile dashboard data for a user.
 * Returns user info, leagues grouped by season, and aggregate records.
 */
export async function getOverview(username: string): Promise<OverviewData | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;

  const allLeagues = await getLeaguesForUser(user.user_id);

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

    const roster = await getRosterForUser(league.league_id, user.user_id);

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
      display_name: user.display_name,
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
 * Get league groups for a user.
 */
export async function getLeagueGroupsForUser(
  username: string
): Promise<LeagueGroup[]> {
  const user = await getUserByUsername(username);
  if (!user) return [];
  return buildLeagueGroups(user.user_id);
}
