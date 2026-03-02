import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface SlotGradeInfo {
  avg_score: number;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
}

export interface RosterHole {
  league_name: string;
  league_id: string;
  slot_label: string;
  player_name: string;
  position: string;
  edge_score: number;
}

export interface SourceMover {
  player_id: string;
  full_name: string;
  position: string;
  current_score: number;
  previous_score: number;
  change: number;
  leagues_owned: number;
}

export interface LeagueHealth {
  league_name: string;
  league_id: string;
  archetype: string;
  qb_grade: SlotGradeInfo;
  rb_grade: SlotGradeInfo;
  wr_grade: SlotGradeInfo;
  te_grade: SlotGradeInfo;
}

export interface ExposureEntry {
  player_id: string;
  full_name: string;
  position: string;
  edge_score: number;
  leagues_owned: number;
  total_leagues: number;
  pct: number;
}

export interface ArchetypeAction {
  archetype: string;
  strategy: string;
  leagues: Array<{ name: string; league_id: string; avg_score: number }>;
}

export interface DashboardData {
  empire: {
    total_leagues: number;
    avg_starter_score: number;
    archetypes: { name: string; count: number }[];
    strongest_league: { name: string; avg_score: number };
    weakest_league: { name: string; avg_score: number };
  };
  roster_holes: RosterHole[];
  source_movers: {
    has_data: boolean;
    risers: SourceMover[];
    fallers: SourceMover[];
  };
  league_health: LeagueHealth[];
  exposure: ExposureEntry[];
  archetype_actions: ArchetypeAction[];
}

export function useDashboard(username: string | undefined) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard", username],
    queryFn: () =>
      apiFetch(`/api/dashboard/${encodeURIComponent(username!)}`),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
  });
}
