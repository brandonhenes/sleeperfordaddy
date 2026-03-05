import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface TradeFinderResult {
  trades: unknown[];
}

export function useTradeFinder(username: string) {
  return useQuery<TradeFinderResult>({
    queryKey: ["trade-finder", username],
    queryFn: () => apiFetch(`/api/trade-finder/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}
