import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface PositionNeed {
  position: string;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
  urgency: "A+" | "A" | "B" | "C" | "D";
  starter_count: number;
  avg_score: number;
}

export interface DraftPickContext {
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  scoring_label: string;
  season: string;
  round: number;
  tier: "early" | "mid" | "late";
  label: string;
  pick_slot: number | null;
  edge_score: number;
  ktc_value: number | null;
  dp_value: number | null;
  roster_needs: PositionNeed[];
}

export interface PickValueReference {
  season: number;
  round: number;
  tier: string;
  ktc_sf: number;
  ktc_1qb: number;
}

export interface AggregateNeed {
  position: string;
  leagues_with_hole: number;
  leagues_with_weak: number;
  total_leagues: number;
  overall_urgency: "critical" | "moderate" | "low";
}

export interface RookieDraftContext {
  username: string;
  total_leagues: number;
  picks_2026: DraftPickContext[];
  picks_2027: DraftPickContext[];
  pick_values: PickValueReference[];
  aggregate_needs: AggregateNeed[];
}

export function useRookieDraftContext(username: string) {
  return useQuery<RookieDraftContext>({
    queryKey: ["rookie-draft-context", username],
    queryFn: () => apiFetch(`/api/rookie-draft/context/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}
