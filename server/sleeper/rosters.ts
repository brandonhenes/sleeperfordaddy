import type { SleeperRoster } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /league/{league_id}/rosters — Get all rosters in a league */
export async function getLeagueRosters(
  leagueId: string
): Promise<SleeperRoster[]> {
  const result = await jget<SleeperRoster[]>(`/league/${leagueId}/rosters`);
  return result ?? [];
}
