import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface FreeAgentLeague {
  league_id: string;
  league_name: string;
}

export interface ArbitrageGap {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  owned_league_count: number;
  total_league_count: number;
  free_agent_leagues: FreeAgentLeague[];
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
