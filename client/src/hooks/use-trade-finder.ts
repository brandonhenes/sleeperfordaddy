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

export function useShopPlayer(username: string, playerId: string, ambition: number = 2) {
  return useQuery<ShopPlayerResult>({
    queryKey: ["shop-player", username, playerId, ambition],
    queryFn: () =>
      apiFetch(
        `/api/trade/shop/${encodeURIComponent(username)}/${encodeURIComponent(playerId)}?ambition=${ambition}`
      ),
    enabled: !!username && !!playerId,
  });
}
