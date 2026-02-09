import type { SleeperLeague, SleeperLeagueUser } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /user/{user_id}/leagues/nfl/{season} — Get leagues for a user in a season */
export async function getUserLeagues(
  userId: string,
  season: number
): Promise<SleeperLeague[]> {
  const result = await jget<SleeperLeague[]>(
    `/user/${userId}/leagues/nfl/${season}`
  );
  return result ?? [];
}

/** GET /league/{league_id} — Get league details */
export async function getLeague(
  leagueId: string
): Promise<SleeperLeague | null> {
  return jget<SleeperLeague>(`/league/${leagueId}`);
}

/** GET /league/{league_id}/users — Get league members */
export async function getLeagueUsers(
  leagueId: string
): Promise<SleeperLeagueUser[]> {
  const result = await jget<SleeperLeagueUser[]>(`/league/${leagueId}/users`);
  return result ?? [];
}
