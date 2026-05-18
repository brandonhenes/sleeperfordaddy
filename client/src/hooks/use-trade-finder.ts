import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import type { TradeSuggestion, ShopPlayerResult } from "../../../shared/types";

const SHOP_PLAYER_REQUEST_TIMEOUT_MS = 30_000;

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
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        SHOP_PLAYER_REQUEST_TIMEOUT_MS
      );
      try {
        return await apiFetch(
          `/api/trade/shop/${encodeURIComponent(username)}/${encodeURIComponent(playerId)}?ambition=${ambition}${suffix}${showRedraft ? "&redraft=true" : ""}`,
          { signal: controller.signal }
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error("Shop a Player timed out. Try a lower ambition level or retry in a moment.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    enabled: !!username && !!playerId,
    retry: 1,
  });
}
