import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TradeAgingRow, TradeHistoryResponse } from "@shared/types";

export function useTradeHistory(username: string | undefined) {
  return useQuery<TradeHistoryResponse>({
    queryKey: ["trade-history", username],
    queryFn: () =>
      apiFetch(`/api/trade-history?username=${encodeURIComponent(username!)}&limit=150`),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTradeAging(username: string | undefined) {
  return useQuery<TradeAgingRow[]>({
    queryKey: ["trade-aging", username],
    queryFn: () =>
      apiFetch(`/api/trades/${encodeURIComponent(username!)}/aging?limit=1200`),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}
