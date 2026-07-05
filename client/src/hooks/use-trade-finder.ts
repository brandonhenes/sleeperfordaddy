import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { weightQueryParams } from "../lib/weights";
import type { TradeBoardLine, TradeSuggestion, ShopPlayerResult } from "@shared/types";

const SHOP_PLAYER_REQUEST_TIMEOUT_MS = 30_000;
const TRADE_FINDER_REQUEST_TIMEOUT_MS = 60_000;
const TRADE_FINDER_STALE_MS = 15 * 60_000;
const TRADE_BOARD_STALE_MS = 15 * 60_000;
const SHOP_PLAYER_STALE_MS = 10 * 60_000;
const TRADE_FINDER_TIMEOUT_MESSAGE =
  "Trade Finder timed out while building package ideas. Retry after this league finishes loading.";

function tradeToolQueryParams(): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}`;
  return params ? `?${params.slice(1)}` : "";
}

function tradeToolQuerySuffix(): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}`;
  return params ? `&${params.slice(1)}` : "";
}

export function useTradeSuggestions(username: string, leagueId: string) {
  const suffix = tradeToolQueryParams();
  return useQuery<TradeSuggestion[]>({
    queryKey: ["trade-finder", username, leagueId, suffix],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        TRADE_FINDER_REQUEST_TIMEOUT_MS
      );
      try {
        return await apiFetch(
          `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}${suffix}`,
          { signal: controller.signal }
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error(TRADE_FINDER_TIMEOUT_MESSAGE);
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    enabled: !!username && !!leagueId,
    staleTime: TRADE_FINDER_STALE_MS,
    gcTime: TRADE_FINDER_STALE_MS * 3,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      !String((error as Error).message ?? "").includes("timed out") &&
      failureCount < 1,
  });
}

export function useTradeBoardLines(username: string, leagueIds: string[]) {
  const suffix = tradeToolQueryParams();
  const normalizedLeagueIds = leagueIds.filter(Boolean).slice(0, 4);
  const leagueParam = normalizedLeagueIds.join(",");
  const query = [
    `leagueIds=${encodeURIComponent(leagueParam)}`,
    suffix ? suffix.slice(1) : "",
  ].filter(Boolean).join("&");

  return useQuery<TradeBoardLine[]>({
    queryKey: ["trade-board-lines", username, normalizedLeagueIds, suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/board/${encodeURIComponent(username)}?${query}`
      ),
    enabled: !!username && normalizedLeagueIds.length > 0,
    staleTime: TRADE_BOARD_STALE_MS,
    gcTime: TRADE_BOARD_STALE_MS * 3,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useShopPlayer(
  username: string,
  playerId: string,
  ambition: number = 2,
  showRedraft = false
) {
  const suffix = tradeToolQuerySuffix();
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
    staleTime: SHOP_PLAYER_STALE_MS,
    gcTime: SHOP_PLAYER_STALE_MS * 3,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
