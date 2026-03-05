import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TradeSuggestion } from "../../../shared/types";

export function useTradeSuggestions(username: string, leagueId: string) {
  return useQuery<TradeSuggestion[]>({
    queryKey: ["trade-finder", username, leagueId],
    queryFn: () =>
      apiFetch(
        `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}`
      ),
    enabled: !!username && !!leagueId,
    staleTime: 10 * 60 * 1000,
  });
}
