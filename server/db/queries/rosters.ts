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
