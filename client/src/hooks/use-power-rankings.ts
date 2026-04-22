import { useQuery } from "@tanstack/react-query";
import type { TradePickBreakdown } from "../../../shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

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
  edge_score: number;
  age: number | null;
  age_curve: AgeCurveStatus;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  ppg?: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  team: string | null;
  status: string | null;
  availability:
    | "active"
    | "injured_reserve"
    | "pup"
    | "practice_squad"
    | "unsigned_fa"
    | "retired_washed"
    | "unknown";
}

export interface SlottedPlayer extends CoreAsset {
  slot: string;
  slot_label: string;
  is_starter: boolean;
}

export interface SlotGrade {
  slot_label: string;
  avg_score: number;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
  count: number;
}

export interface OptimizedLineup {
  starters: SlottedPlayer[];
  bench: SlottedPlayer[];
  slot_grades: SlotGrade[];
}

export interface ScoredPick {
  season: string;
  round: number;
  roster_id: number;
  original_owner_id: number;
  pick_slot: number | null;
  tier: "early" | "mid" | "late";
  label: string;
  ktc_value: number | null;
  dp_value: number | null;
  edge_score: number;
  ktc_score: number | null;
  dp_score: number | null;
  pick_breakdown?: TradePickBreakdown | null;
}

export interface RosterRanking {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  starters_value: number;
  avg_starter_score: number;
  power_pct: number;
  draft_value: number;
  draft_pct: number;
  draft_picks: ScoredPick[];
  window_core_raw: number;
  window_core_pct: number;
  window_total_raw: number;
  window_total_pct: number;
  window_core_coverage_pct: number;
  window_total_coverage_pct: number;
  archetype: string;
  reasons: string[];
  core_assets: CoreAsset[];
  avg_sources_available: number;
  lineup: OptimizedLineup;
}

export interface LeaguePowerRanking {
  league_id: string;
  league_name: string;
  mode: "sf" | "1qb";
  draft_data_available: boolean;
  scoring_label: string;
  rosters: RosterRanking[];
}

export function usePowerRankings(username: string, showRedraft = false) {
  const weights = weightQueryParams();
  const params = [
    showRedraft ? "redraft=true" : "",
    weights ? weights.slice(1) : "",
  ].filter(Boolean).join("&");
  const suffix = params ? `?${params}` : "";

  return useQuery<LeaguePowerRanking[]>({
    queryKey: ["power-rankings", username, showRedraft, weights],
    queryFn: () =>
      apiFetch(
        `/api/power-rankings/${encodeURIComponent(username)}${suffix}`
      ),
    enabled: !!username,
  });
}
