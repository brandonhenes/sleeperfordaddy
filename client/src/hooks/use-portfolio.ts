import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface PortfolioPlayer {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
}

export interface PortfolioStats {
  weighted_value: number;
  avg_value_per_league: number;
  high_exposure_count: number;
  total_leagues: number;
}

export interface PortfolioData {
  players: PortfolioPlayer[];
  stats: PortfolioStats;
}

export function usePortfolio(username: string | undefined) {
  return useQuery<PortfolioData>({
    queryKey: ["portfolio", username],
    queryFn: () =>
      apiFetch(`/api/portfolio?username=${encodeURIComponent(username!)}`),
    enabled: !!username,
  });
}
