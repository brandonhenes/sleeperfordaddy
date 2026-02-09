import type { SleeperMatchup } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /league/{league_id}/matchups/{week} — Get matchups for a specific week */
export async function getLeagueMatchups(
  leagueId: string,
  week: number
): Promise<SleeperMatchup[]> {
  const result = await jget<SleeperMatchup[]>(
    `/league/${leagueId}/matchups/${week}`
  );
  return result ?? [];
}
