import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface DashboardStats {
  portfolio_value: number;
  league_count: number;
  unique_players: number;
  open_recs: number;
}

export interface DashboardRec {
  id: number;
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  rationale: string | null;
}

export interface ExposureAlert {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
}

export interface LeagueSummary {
  league_id: string;
  name: string;
  total_rosters: number | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
}

export interface DashboardData {
  stats: DashboardStats;
  top_recs: DashboardRec[];
  exposure_alerts: ExposureAlert[];
  leagues: LeagueSummary[];
}

export function useDashboard(username: string | undefined) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard", username],
    queryFn: () =>
      apiFetch(`/api/dashboard?username=${encodeURIComponent(username!)}`),
    enabled: !!username,
  });
}
