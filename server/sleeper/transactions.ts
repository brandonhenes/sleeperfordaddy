import type { SleeperTransaction } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /league/{league_id}/transactions/{round} — Get transactions for a round */
export async function getLeagueTransactions(
  leagueId: string,
  round: number
): Promise<SleeperTransaction[]> {
  const result = await jget<SleeperTransaction[]>(
    `/league/${leagueId}/transactions/${round}`
  );
  return result ?? [];
}
