import type { LeagueHistoryData } from "../../shared/types.js";

// ─── Main ───

export async function getLeagueHistory(
  groupId: string
): Promise<LeagueHistoryData> {
  // TODO: chain leagues via previous_league_id, pull rosters and value snapshots
  return {
    group_id: groupId,
    group_name: "",
    seasons: [],
  };
}
