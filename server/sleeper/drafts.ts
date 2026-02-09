import type { SleeperDraft, SleeperDraftPick } from "../../shared/types.js";
import { jget } from "./client.js";

/** GET /league/{league_id}/drafts — Get drafts for a league */
export async function getLeagueDrafts(
  leagueId: string
): Promise<SleeperDraft[]> {
  const result = await jget<SleeperDraft[]>(`/league/${leagueId}/drafts`);
  return result ?? [];
}

/** GET /draft/{draft_id}/picks — Get picks for a draft */
export async function getDraftPicks(
  draftId: string
): Promise<SleeperDraftPick[]> {
  const result = await jget<SleeperDraftPick[]>(`/draft/${draftId}/picks`);
  return result ?? [];
}

/** GET /league/{league_id}/traded_picks — Get traded draft picks */
export async function getTradedPicks(
  leagueId: string
): Promise<import("../../shared/types.js").SleeperTradedPick[]> {
  const result = await jget<import("../../shared/types.js").SleeperTradedPick[]>(
    `/league/${leagueId}/traded_picks`
  );
  return result ?? [];
}
