import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface AgeCurveStatus {
  age: number | null;
  position: string;
  score: number;
  zone: string;
  color: string;
  label: string;
  dot_pct: number;
  prime_start: number | null;
  prime_end: number | null;
}

export interface CoreAsset {
  player_id: string;
  full_name: string;
  position: string;
  value: number;
  age: number | null;
  age_curve: AgeCurveStatus;
}

export interface RosterRanking {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  starters_value: number;
  power_pct: number;
  draft_value: number;
  draft_pct: number;
  window_core_raw: number;
  window_core_pct: number;
  window_total_raw: number;
  window_total_pct: number;
  window_core_coverage_pct: number;
  window_total_coverage_pct: number;
  archetype: string;
  reasons: string[];
  core_assets: CoreAsset[];
}

export interface LeaguePowerRanking {
  league_id: string;
  league_name: string;
  mode: "sf" | "1qb";
  draft_data_available: boolean;
  rosters: RosterRanking[];
}

export function usePowerRankings(username: string) {
  return useQuery<LeaguePowerRanking[]>({
    queryKey: ["power-rankings", username],
    queryFn: () =>
      apiFetch(`/api/power-rankings/${encodeURIComponent(username)}`),
    enabled: !!username,
  });
}
