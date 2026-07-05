import { useQuery } from "@tanstack/react-query";
import type { ProspectHistoryPoint, ProspectRanking } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useLatestProspectRankings() {
  return useQuery<ProspectRanking[]>({
    queryKey: ["latest-prospect-rankings"],
    queryFn: () => apiFetch("/api/rookie-draft/latest-rankings"),
    staleTime: 30 * 60 * 1000,
  });
}

export function useProspectHistory(playerName: string | null) {
  return useQuery<ProspectHistoryPoint[]>({
    queryKey: ["prospect-history", playerName],
    queryFn: () =>
      apiFetch(`/api/rookie-draft/prospect-history/${encodeURIComponent(playerName!)}`),
    enabled: !!playerName,
    staleTime: 30 * 60 * 1000,
  });
}
