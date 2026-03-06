import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export interface ComparablePlayer {
  player_name: string;
  position: string;
  team: string | null;
  age: number | null;
  edge_score: number;
}

export function useComparables(playerName: string | undefined) {
  const weights = weightQueryParams();
  return useQuery<ComparablePlayer[]>({
    queryKey: ["comparables", playerName, weights],
    queryFn: () =>
      apiFetch(`/api/player/${encodeURIComponent(playerName!)}/comparables?limit=5${weights}`),
    enabled: !!playerName,
    staleTime: 10 * 60 * 1000,
  });
}
