import { eq, and } from "drizzle-orm";
import { db } from "../connection.js";
import { h2h_season } from "../schema.js";

export async function upsertH2H(record: {
  league_id: string;
  my_owner_id: string;
  opp_owner_id: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  games: number;
}) {
  await db
    .insert(h2h_season)
    .values({ ...record, updated_at: Date.now() })
    .onConflictDoUpdate({
      target: [
        h2h_season.league_id,
        h2h_season.my_owner_id,
        h2h_season.opp_owner_id,
      ],
      set: {
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
        pf: record.pf,
        pa: record.pa,
        games: record.games,
        updated_at: Date.now(),
      },
    });
}

export async function getH2HForLeague(
  leagueId: string,
  myOwnerId: string
) {
  return db
    .select()
    .from(h2h_season)
    .where(
      and(
        eq(h2h_season.league_id, leagueId),
        eq(h2h_season.my_owner_id, myOwnerId)
      )
    );
}
