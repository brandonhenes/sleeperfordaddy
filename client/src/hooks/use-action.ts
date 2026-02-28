import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface SellCandidate {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
}

export interface BuyOpportunity {
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  current_value: number | null;
  rationale: string | null;
  confidence: number | null;
  owned_leagues: number;
  total_leagues: number;
}

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
