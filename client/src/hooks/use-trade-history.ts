import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TradeHistoryResponse } from "../../../shared/types";

export function useTradeHistory(username: string | undefined) {
  return useQuery<TradeHistoryResponse>({
    queryKey: ["trade-history", username],
    queryFn: () =>
      apiFetch(`/api/trade-history?username=${encodeURIComponent(username!)}`),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
  });
}
