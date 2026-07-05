import { useQuery } from "@tanstack/react-query";
import type { ComparablePlayer } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

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
