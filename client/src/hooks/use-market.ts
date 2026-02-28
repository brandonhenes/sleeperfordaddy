import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

// ─── Types ───

export interface Recommendation {
  id: number;
  rec_date: string;
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  current_value: number | null;
  rationale: string | null;
  confidence: number | null;
}

export interface Prospect {
  player_name: string;
  position: string | null;
  school: string | null;
  tier: string | null;
  fantasypros_rank: number | null;
  consensus_comp: string | null;
  key_strengths: string[] | null;
  total_mentions: number | null;
  last_update_summary: string | null;
  age: number | null;
  notes: string | null;
}

export interface Mover {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number;
  delta: number;
}

export interface MoversData {
  risers: Mover[];
  fallers: Mover[];
}

export interface Signal {
  player_name: string;
  position: string | null;
  team: string | null;
  add_count: number;
  drop_count: number;
  rank_adds: number | null;
  rank_drops: number | null;
  signal_date: string;
}

// ─── Hooks ───

export function useRecommendations() {
  return useQuery<Recommendation[]>({
    queryKey: ["market", "recommendations"],
    queryFn: () => apiFetch("/api/market/recommendations"),
  });
}

export function useProspects() {
  return useQuery<Prospect[]>({
    queryKey: ["market", "prospects"],
    queryFn: () => apiFetch("/api/market/prospects"),
  });
}

export function useMovers(days: number = 7) {
  return useQuery<MoversData>({
    queryKey: ["market", "movers", days],
    queryFn: () => apiFetch(`/api/market/movers?days=${days}`),
  });
}

export function useSignals() {
  return useQuery<Signal[]>({
    queryKey: ["market", "signals"],
    queryFn: () => apiFetch("/api/market/signals"),
  });
}
