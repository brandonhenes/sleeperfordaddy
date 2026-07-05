import { useQuery } from "@tanstack/react-query";
import type { BuyOpportunity, SellCandidate } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useSellCandidates(username: string | undefined) {
  return useQuery<SellCandidate[]>({
    queryKey: ["action", "sell-candidates", username],
    queryFn: () =>
      apiFetch(
        `/api/action/sell-candidates?username=${encodeURIComponent(username!)}`
      ),
    enabled: !!username,
  });
}

export function useBuyOpportunities(username: string | undefined) {
  return useQuery<BuyOpportunity[]>({
    queryKey: ["action", "buy-opportunities", username],
    queryFn: () =>
      apiFetch(
        `/api/action/buy-opportunities?username=${encodeURIComponent(username!)}`
      ),
    enabled: !!username,
  });
}
