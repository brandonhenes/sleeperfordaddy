import { eq, and, inArray } from "drizzle-orm";
import { db } from "../connection.js";
import {
  leagues,
  user_leagues,
  league_users,
  group_overrides,
} from "../schema.js";

export async function upsertLeague(league: {
  league_id: string;
  name: string;
  season: number;
  sport: string;
  status: string;
  total_rosters: number | null;
  previous_league_id: string | null;
  league_type: number | null;
  group_id: string | null;
  raw_json: string | null;
  roster_positions: unknown | null;
  draft_rounds: number | null;
  scoring_settings: Record<string, number> | null;
}) {
  await db
    .insert(leagues)
    .values({ ...league, updated_at: Date.now() })
    .onConflictDoUpdate({
      target: leagues.league_id,
      set: {
        name: league.name,
        season: league.season,
        sport: league.sport,
        status: league.status,
        total_rosters: league.total_rosters,
        previous_league_id: league.previous_league_id,
        league_type: league.league_type,
        group_id: league.group_id,
        raw_json: league.raw_json,
        roster_positions: league.roster_positions,
        draft_rounds: league.draft_rounds,
        scoring_settings: league.scoring_settings,
        updated_at: Date.now(),
      },
    });
}

export async function upsertUserLeague(userId: string, leagueId: string) {
  await db
    .insert(user_leagues)
    .values({ user_id: userId, league_id: leagueId, updated_at: Date.now() })
    .onConflictDoNothing();
}

export async function upsertLeagueUser(entry: {
  league_id: string;
  user_id: string;
  display_name: string | null;
  team_name: string | null;
}) {
  await db
    .insert(league_users)
    .values({ ...entry, updated_at: Date.now() })
    .onConflictDoUpdate({
      target: [league_users.league_id, league_users.user_id],
      set: {
        display_name: entry.display_name,
        team_name: entry.team_name,
        updated_at: Date.now(),
      },
    });
}

export async function getLeaguesForUser(userId: string) {
  const rows = await db
    .select({ league_id: user_leagues.league_id })
    .from(user_leagues)
    .where(eq(user_leagues.user_id, userId));
  if (rows.length === 0) return [];

  const leagueIds = rows.map((r) => r.league_id);
  return db
    .select()
    .from(leagues)
    .where(inArray(leagues.league_id, leagueIds));
}

export async function updateLeagueGroupId(
  leagueId: string,
  groupId: string
) {
  await db
    .update(leagues)
    .set({ group_id: groupId, updated_at: Date.now() })
    .where(eq(leagues.league_id, leagueId));
}

export async function getGroupOverrides() {
  return db.select().from(group_overrides);
}

export async function getLeagueById(leagueId: string) {
  const rows = await db
    .select()
    .from(leagues)
    .where(eq(leagues.league_id, leagueId))
    .limit(1);
  return rows[0] ?? null;
}
