import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  TradeIntelligenceChain,
  TradeIntelligenceLeagueResponse,
  TradeIntelligenceTradeDetailResponse,
  TradeIntelligenceLeaderboardResponse,
  TradeIntelligenceUserTradesResponse,
} from "@shared/types";

export function useTradeIntelligenceChains(
  username: string | undefined,
  enabled = true
) {
  return useQuery<TradeIntelligenceChain[]>({
    queryKey: ["trade-intelligence", "chains", username],
    queryFn: () =>
      apiFetch(
        `/api/trade-intelligence/chains/${encodeURIComponent(username!)}`
      ),
    enabled: enabled && !!username,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTradeIntelligenceLeague(
  leagueId: string | undefined,
  username?: string
) {
  const suffix = username ? `?username=${encodeURIComponent(username)}` : "";

  return useQuery<TradeIntelligenceLeagueResponse>({
    queryKey: ["trade-intelligence", "league", leagueId, username ?? ""],
    queryFn: () =>
      apiFetch(`/api/trade-intelligence/${encodeURIComponent(leagueId!)}${suffix}`),
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
