import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface ArbitrageGap {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  edge_score: number;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  owned_leagues: { league_id: string; league_name: string }[];
  free_leagues: { league_id: string; league_name: string }[];
  owned_count: number;
  free_count: number;
}

export function useFreeAgentGaps(username: string) {
  return useQuery<ArbitrageGap[]>({
    queryKey: ["arbitrage", "free-agents", username],
    queryFn: () =>
      apiFetch(
        `/api/arbitrage/free-agents?username=${encodeURIComponent(username)}`
      ),
    enabled: !!username,
  });
}
