import type { EvaluatedAsset } from "@shared/types";

export type Side = "send" | "receive";
export type PickTier = "early" | "mid" | "late";
export type PickSelection = PickTier | `slot:${number}`;

export interface SearchAsset {
  type: "player";
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

export interface AcceptanceAssetView extends EvaluatedAsset {
  age?: number | null;
  age_curve_zone?: string | null;
}

export interface OpponentBehavior {
  total_trades: number;
  recent_trades: number;
  preferred_structure: string;
  is_active: boolean;
  last_trade_days_ago: number | null;
  bias_flags: string[];
  top_acquired_positions: string[];
}

export interface OpponentContext {
  roster_id: number;
  display_name: string;
  team_name: string | null;
  archetype: string;
  needs: string[];
  surplus: string[];
  top_player_ids_by_pos: Record<string, string>;
  behavior: OpponentBehavior | null;
}

export interface OpponentContextResponse {
  league_id: string;
  opponents: OpponentContext[];
}
