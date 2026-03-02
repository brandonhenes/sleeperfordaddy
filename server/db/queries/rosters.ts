import { eq, and, inArray } from "drizzle-orm";
import { db } from "../connection.js";
import { rosters, roster_players } from "../schema.js";

export async function upsertRoster(roster: {
  league_id: string;
  owner_id: string;
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_against: number;
}) {
  await db
    .insert(rosters)
    .values({ ...roster, updated_at: Date.now() })
    .onConflictDoUpdate({
      target: [rosters.league_id, rosters.owner_id],
      set: {
        roster_id: roster.roster_id,
        wins: roster.wins,
        losses: roster.losses,
        ties: roster.ties,
        fpts: roster.fpts,
        fpts_against: roster.fpts_against,
        updated_at: Date.now(),
      },
    });
}

export async function upsertRosterPlayers(
  leagueId: string,
  ownerId: string,
  playerIds: string[]
) {
  if (playerIds.length === 0) return;

  // Delete existing players for this roster
  await db
    .delete(roster_players)
    .where(
      and(
        eq(roster_players.league_id, leagueId),
        eq(roster_players.owner_id, ownerId)
      )
    );

  // Insert new players
  const values = playerIds.map((pid) => ({
    league_id: leagueId,
    owner_id: ownerId,
    player_id: pid,
    updated_at: Date.now(),
  }));

  await db.insert(roster_players).values(values).onConflictDoNothing();
}

/**
 * Replace ALL roster players for a league in one shot.
 * Deletes every existing row for the league, then batch-inserts all owners' players.
 * Prevents partial data if one owner's insert fails mid-loop.
 */
export async function replaceAllLeagueRosters(
  leagueId: string,
  allPlayers: { owner_id: string; player_id: string }[]
) {
  // Wipe the entire league's roster_players
  await db
    .delete(roster_players)
    .where(eq(roster_players.league_id, leagueId));

  if (allPlayers.length === 0) return;

  const now = Date.now();
  const values = allPlayers.map((p) => ({
    league_id: leagueId,
    owner_id: p.owner_id,
    player_id: p.player_id,
    updated_at: now,
  }));

  // Batch in chunks of 500 to avoid query size limits
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(roster_players)
      .values(values.slice(i, i + 500))
      .onConflictDoNothing();
  }
}

export async function getRostersForLeague(leagueId: string) {
  return db
    .select()
    .from(rosters)
    .where(eq(rosters.league_id, leagueId));
}

export async function getRosterForUser(leagueId: string, ownerId: string) {
  const rows = await db
    .select()
    .from(rosters)
    .where(
      and(eq(rosters.league_id, leagueId), eq(rosters.owner_id, ownerId))
    )
    .limit(1);
  return rows[0] ?? null;
}
