import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  TradeIntelligenceLeagueResponse,
  TradeIntelligenceTradeDetailResponse,
  TradeIntelligenceLeaderboardResponse,
  TradeIntelligenceUserTradesResponse,
} from "../../../shared/types";

export function useTradeIntelligenceLeague(leagueId: string | undefined) {
  return useQuery<TradeIntelligenceLeagueResponse>({
    queryKey: ["trade-intelligence", "league", leagueId],
    queryFn: () =>
      apiFetch(`/api/trade-intelligence/${encodeURIComponent(leagueId!)}`),
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTradeIntelligenceTradeDetail(
  leagueId: string | undefined,
  tradeId: string | undefined,
  enabled = true
) {
  return useQuery<TradeIntelligenceTradeDetailResponse>({
    queryKey: ["trade-intelligence", "trade", leagueId, tradeId],
    queryFn: () =>
      apiFetch(
        `/api/trade-intelligence/${encodeURIComponent(
          leagueId!
        )}/trade/${encodeURIComponent(tradeId!)}`
      ),
    enabled: enabled && !!leagueId && !!tradeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTradeIntelligenceLeaderboard(
  leagueId: string | undefined,
  enabled = true
) {
  return useQuery<TradeIntelligenceLeaderboardResponse>({
    queryKey: ["trade-intelligence", "leaderboard", leagueId],
    queryFn: () =>
      apiFetch(
        `/api/trade-intelligence/${encodeURIComponent(leagueId!)}/leaderboard`
      ),
    enabled: enabled && !!leagueId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTradeIntelligenceUserTrades(
  username: string | undefined,
  enabled = true
) {
  return useQuery<TradeIntelligenceUserTradesResponse>({
    queryKey: ["trade-intelligence", "user", username],
    queryFn: () =>
      apiFetch(
        `/api/trade-intelligence/user/${encodeURIComponent(username!)}`
      ),
    enabled: enabled && !!username,
    staleTime: 5 * 60 * 1000,
  });
}
