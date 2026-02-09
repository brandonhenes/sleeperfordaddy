import type { SleeperBracketMatch } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /league/{league_id}/winners_bracket — Playoff bracket */
export async function getWinnersBracket(
  leagueId: string
): Promise<SleeperBracketMatch[]> {
  const result = await jget<SleeperBracketMatch[]>(
    `/league/${leagueId}/winners_bracket`
  );
  return result ?? [];
}

/** GET /league/{league_id}/losers_bracket — Consolation bracket */
export async function getLosersBracket(
  leagueId: string
): Promise<SleeperBracketMatch[]> {
  const result = await jget<SleeperBracketMatch[]>(
    `/league/${leagueId}/losers_bracket`
  );
  return result ?? [];
}
