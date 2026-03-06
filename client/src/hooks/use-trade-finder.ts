import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TradeSuggestion, ShopPlayerResult } from "../../../shared/types";

export function useTradeSuggestions(username: string, leagueId: string) {
  return useQuery<TradeSuggestion[]>({
    queryKey: ["trade-finder", username, leagueId],
    queryFn: () =>
      apiFetch(
        `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}`
      ),
    enabled: !!username && !!leagueId,
  });
}

export function useShopPlayer(username: string, playerId: string) {
  return useQuery<ShopPlayerResult>({
    queryKey: ["shop-player", username, playerId],
    queryFn: () =>
      apiFetch(
        `/api/trade/shop/${encodeURIComponent(username)}/${encodeURIComponent(playerId)}`
      ),
    enabled: !!username && !!playerId,
  });
}
