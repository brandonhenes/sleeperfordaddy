import {
  getLeaguesForUser,
  getGroupOverrides,
  updateLeagueGroupId,
} from "../db/queries/leagues.js";
import type { LeagueGroup } from "../../shared/types.js";
import { getDynastyLeagueIdsForUserAllSeasons } from "./dynasty-leagues.js";

interface LeagueRow {
  league_id: string;
  name: string;
  season: number;
  status: string;
  previous_league_id: string | null;
  group_id: string | null;
  total_rosters: number | null;
}

/**
 * Group leagues across seasons using previous_league_id chains.
 * Dynasty leagues get new league_ids each season but link via previous_league_id.
 * group_id = the oldest league_id in the chain (or overridden).
 */
export async function buildLeagueGroups(
  userId: string
): Promise<LeagueGroup[]> {
  const [allUserLeagues, dynastyLeagueIds] = await Promise.all([
    getLeaguesForUser(userId),
    getDynastyLeagueIdsForUserAllSeasons(userId),
  ]);
  const dynastySet = new Set(dynastyLeagueIds);
  const allLeagues = allUserLeagues.filter((l) => dynastySet.has(l.league_id));
  if (allLeagues.length === 0) return [];

  // Load group overrides
  const overrides = await getGroupOverrides();
  const overrideMap = new Map(
    overrides.map((o) => [o.league_id, o.forced_group_id])
  );

  // Build a map of league_id -> league for quick lookup
  const leagueMap = new Map<string, LeagueRow>();
  for (const league of allLeagues) {
    leagueMap.set(league.league_id, league);
  }

  // Build chains: follow previous_league_id to find the oldest (root)
  const leagueToGroup = new Map<string, string>(); // league_id -> group_id

  for (const league of allLeagues) {
    if (leagueToGroup.has(league.league_id)) continue;

    // Check for override first
    if (overrideMap.has(league.league_id)) {
      leagueToGroup.set(league.league_id, overrideMap.get(league.league_id)!);
      continue;
    }

    // Follow the chain backwards to find root
    const chain: string[] = [];
    let current: LeagueRow | undefined = league;

    while (current) {
      chain.push(current.league_id);

      if (current.previous_league_id && leagueMap.has(current.previous_league_id)) {
        current = leagueMap.get(current.previous_league_id);
      } else if (current.previous_league_id) {
        // The previous league exists but isn't in our data set
        // Use it as the group root
        chain.push(current.previous_league_id);
        current = undefined;
      } else {
        current = undefined;
      }
    }

    // The root (oldest) is the last in the chain
    const rootId = chain[chain.length - 1];

    // Apply override if the root has one
    const groupId = overrideMap.get(rootId) ?? rootId;

    for (const leagueId of chain) {
      if (leagueMap.has(leagueId)) {
        leagueToGroup.set(leagueId, groupId);
      }
    }
  }

  // Build group objects
  const groups = new Map<string, LeagueGroup>();

  for (const league of allLeagues) {
    const groupId = leagueToGroup.get(league.league_id) ?? league.league_id;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        group_id: groupId,
        name: league.name,
        leagues: [],
        min_season: league.season,
        max_season: league.season,
        is_active: false,
      });
    }

    const group = groups.get(groupId)!;
    group.leagues.push(league.league_id);
    group.min_season = Math.min(group.min_season, league.season);
    group.max_season = Math.max(group.max_season, league.season);

    // Use the most recent season's name
    if (league.season === group.max_season) {
      group.name = league.name;
    }

    // Active if the latest season has an active/drafting status
    if (
      league.season === group.max_season &&
      (league.status === "in_season" ||
        league.status === "pre_draft" ||
        league.status === "drafting" ||
        league.status === "complete")
    ) {
      group.is_active = true;
    }
  }

  // Sort leagues within each group by season
  for (const group of groups.values()) {
    group.leagues.sort((a, b) => {
      const la = leagueMap.get(a);
      const lb = leagueMap.get(b);
      return (la?.season ?? 0) - (lb?.season ?? 0);
    });
  }

  // Update only rows that actually changed to avoid write-on-read overhead.
  const updates: Array<{ leagueId: string; groupId: string }> = [];
  for (const [leagueId, groupId] of leagueToGroup) {
    const current = leagueMap.get(leagueId);
    if (!current) continue;
    if ((current.group_id ?? null) === groupId) continue;
    updates.push({ leagueId, groupId });
  }
  if (updates.length > 0) {
    await Promise.all(updates.map((u) => updateLeagueGroupId(u.leagueId, u.groupId)));
  }

  // Sort groups: active first, then by max_season desc, then name
  return Array.from(groups.values()).sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.max_season !== b.max_season) return b.max_season - a.max_season;
    return a.name.localeCompare(b.name);
  });
}
