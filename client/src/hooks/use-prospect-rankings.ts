import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface ProspectRanking {
  player_name: string;
  position: string | null;
  dp_value_sf: number | null;
  dp_value_1qb: number | null;
  dp_ecr_sf: number | null;
  fp_ecr_sf: number | null;
  fp_ecr_best: number | null;
  fp_ecr_worst: number | null;
  fp_ecr_sd: number | null;
}

export interface ProspectHistoryPoint {
  snapshot_date: string;
  dp_value_sf: number | null;
  dp_value_1qb: number | null;
  dp_ecr_sf: number | null;
  dp_ecr_1qb: number | null;
  fp_ecr_sf: number | null;
  fp_ecr_best: number | null;
  fp_ecr_worst: number | null;
  fp_ecr_sd: number | null;
}

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
