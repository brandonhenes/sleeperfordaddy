import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export interface PortfolioPlayer {
  player_id: string;
  full_name: string;
  position: string;
  age: number | null;
  edge_score: number;
  fc_value: number | null;
  ktc_value: number | null;
  fp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  fp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  leagues_owned: number;
  total_leagues: number;
  pct: number;
  age_zone: string | null;
  ktc_vs_experts: number | null;
  disagreement_direction: "sell_signal" | "buy_signal" | "neutral" | null;
  action_needed: { type: "risk" | "dead_weight"; reason: string } | null;
  portfolio_value: number;
  availability:
    | "active"
    | "injured_reserve"
    | "pup"
    | "practice_squad"
    | "unsigned_fa"
    | "retired_washed"
    | "unknown";
  team: string | null;
  status: string | null;
}

export interface PortfolioStats {
  total_players: number;
  total_leagues: number;
  avg_edge_score: number;
  high_exposure_count: number;
  position_counts: { position: string; count: number; avg_score: number }[];
  portfolio_value_total: number;
  weighted_avg_age: number;
  source_coverage_pct: number;
}

export interface PortfolioData {
  players: PortfolioPlayer[];
  stats: PortfolioStats;
}

export function usePortfolio(username: string | undefined) {
  const weights = weightQueryParams();
  return useQuery<PortfolioData>({
    queryKey: ["portfolio", username, weights],
    queryFn: () =>
      apiFetch(`/api/portfolio?username=${encodeURIComponent(username!)}${weights}`),
    enabled: !!username,
  });
}
