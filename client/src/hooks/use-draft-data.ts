import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface HitRateRow {
  position: string;
  round: number;
  pick_range: string;
  total_drafted: number;
  hits: number;
  hit_rate_pct: number;
  avg_games: number;
  avg_career_av: number;
  notable_hits: string[];
  notable_busts: string[];
}

export interface HitRateData {
  by_position_round: HitRateRow[];
  by_slot_range: HitRateRow[];
  overall_by_round: { round: number; hit_rate: number; total: number }[];
}

export function useHitRates() {
  return useQuery<HitRateData>({
    queryKey: ["draft-hit-rates"],
    queryFn: () => apiFetch("/api/rookie-draft/hit-rates"),
    staleTime: 60 * 60 * 1000,
  });
}

export interface LeagueADP {
  player_name: string;
  position: string | null;
  avg_pick: number;
  min_pick: number;
  max_pick: number;
  times_drafted: number;
  leagues_available: number;
}

export function useRookieADP(season: string) {
  return useQuery<LeagueADP[]>({
    queryKey: ["rookie-adp", season],
    queryFn: () => apiFetch(`/api/rookie-draft/adp/${season}`),
    staleTime: 10 * 60 * 1000,
  });
}

export interface BoardMovement {
  snapshot_date: string;
  fp_rank: number | null;
  tier: string | null;
}

export function useBoardMovement(playerName: string | null) {
  return useQuery<BoardMovement[]>({
    queryKey: ["board-movement", playerName],
    queryFn: () => apiFetch(`/api/rookie-draft/board-movement/${encodeURIComponent(playerName!)}`),
    enabled: !!playerName,
    staleTime: 30 * 60 * 1000,
  });
}

export interface ValueSnapshot {
  snapshot_date: string;
  edge_score: number | null;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
}

export function useValueTracker(playerName: string | null) {
  return useQuery<ValueSnapshot[]>({
    queryKey: ["value-tracker", playerName],
    queryFn: () => apiFetch(`/api/rookie-draft/value-tracker/${encodeURIComponent(playerName!)}`),
    enabled: !!playerName,
    staleTime: 30 * 60 * 1000,
  });
}
