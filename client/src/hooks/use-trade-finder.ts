import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import type { TradeSuggestion, ShopPlayerResult } from "../../../shared/types";

export function useTradeSuggestions(username: string, leagueId: string) {
  const classStrengths = classStrengthQueryParams();
  const suffix = classStrengths ? `?${classStrengths.slice(1)}` : "";
  return useQuery<TradeSuggestion[]>({
    queryKey: ["trade-finder", username, leagueId, suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}${suffix}`
      ),
    enabled: !!username && !!leagueId,
  });
}

export function useShopPlayer(
  username: string,
  playerId: string,
  ambition: number = 2,
  showRedraft = false
) {
  const classStrengths = classStrengthQueryParams();
  const suffix = classStrengths
    ? `&${classStrengths.slice(1)}`
    : "";
  return useQuery<ShopPlayerResult>({
    queryKey: ["shop-player", username, playerId, ambition, suffix, showRedraft],
    queryFn: () =>
      apiFetch(
        `/api/trade/shop/${encodeURIComponent(username)}/${encodeURIComponent(playerId)}?ambition=${ambition}${suffix}${showRedraft ? "&redraft=true" : ""}`
      ),
    enabled: !!username && !!playerId,
  });
}
