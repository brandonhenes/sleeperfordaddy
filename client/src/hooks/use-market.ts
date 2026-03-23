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
  ktc_value: number | null;
  fp_value: number | null;
  rationale: string | null;
  confidence: number | null;
}

export interface ProspectComp {
  comp: string;
  date: string;
  source: string;
}

export interface Prospect {
  player_name: string;
  position: string | null;
  school: string | null;
  tier: string | null;
  fp_rank: number | null;
  fantasypros_rank: number | null;
  consensus_comp: string | null;
  all_comps: ProspectComp[] | null;
  key_strengths: string[] | null;
  key_concerns: string[] | null;
  scouting_notes: string | null;
  fp_scouting_notes: string | null;
  total_mentions: number | null;
  last_update_summary: string | null;
  age: number | null;
  notes: string | null;
  height: string | null;
  weight: string | null;
  draft_capital: string | null;
  landing_spot: string | null;
  current_adp: string | null;
  combine_40: string | null;
  combine_vertical: string | null;
  combine_shuttle: string | null;
  combine_bench: string | null;
  pff_rank: number | null;
  pff_grade_2025: number | null;
  pff_grade_2024: number | null;
  pff_waa_2025: number | null;
  dolittle_score: number | null;
  dolittle_games: number | null;
  dolittle_confidence: "HIGH" | "MED" | "LOW" | null;
  consensus_adp: string | null;
  consensus_adp_rank: number | null;
  nfl_team: string | null;
  nfl_pick: number | null;
  disagreement_flag: "SLEEPER" | "FADING" | null;
  status: string | null;
  last_updated: string | null;
}

export interface ValueMover {
  player_id: string;
  player_name: string;
  position: string | null;
  team: string | null;
  fc_value_now: number | null;
  fc_delta_7d: number | null;
  fc_delta_14d: number | null;
  fc_delta_21d: number | null;
  fc_delta_28d: number | null;
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

export function useMovers() {
  return useQuery<ValueMover[]>({
    queryKey: ["market", "value-movers"],
    queryFn: () => apiFetch("/api/market/value-movers"),
  });
}

export function useSignals() {
  return useQuery<Signal[]>({
    queryKey: ["market", "signals"],
    queryFn: () => apiFetch("/api/market/signals"),
  });
}
