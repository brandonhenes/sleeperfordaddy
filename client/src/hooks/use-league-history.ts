import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { LeagueHistoryData } from "../../../shared/types";

export function useLeagueHistory(groupId: string) {
  return useQuery<LeagueHistoryData>({
    queryKey: ["league-history", groupId],
    queryFn: () =>
      apiFetch(`/api/history/${encodeURIComponent(groupId)}`),
    enabled: !!groupId,
  });
}
