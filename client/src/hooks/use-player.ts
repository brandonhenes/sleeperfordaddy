import { useQuery } from "@tanstack/react-query";
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

export interface PlayerSummary {
  player_name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  age_curve: AgeCurveStatus;
}

export interface ValuePoint { date: string; value: number }
export interface OwnershipEntry { league_name: string; league_id: string }
export interface ExposureInfo { owned_leagues: number; total_leagues: number; exposure_pct: number }
export interface Mention {
  mention_date: string;
  source: string | null;
  article_title: string | null;
  sentiment: string | null;
  key_quote: string | null;
}
export interface ProspectInfo {
  school: string | null;
  tier: string | null;
  consensus_comp: string | null;
  key_strengths: string[] | null;
  draft_capital: string | null;
  notes: string | null;
}
export interface RecInfo {
  direction: string;
  fc_at_rec: number | null;
  rationale: string | null;
  rec_date: string;
}

export interface TradeComp {
  trade_id: string;
  league_name: string;
  date: string;
  gave: string[];
  received: string[];
}

export interface PlayerDetail {
  summary: PlayerSummary;
  valueHistory: ValuePoint[];
  ownership: OwnershipEntry[];
  exposure: ExposureInfo;
  mentions: Mention[];
  prospect: ProspectInfo | null;
  recommendation: RecInfo | null;
  recent_trades: TradeComp[];
}

export function usePlayer(playerName: string | undefined, username: string) {
  const weights = weightQueryParams();
  return useQuery<PlayerDetail>({
    queryKey: ["player", playerName, username, weights],
    queryFn: () =>
      apiFetch(
        `/api/player/${encodeURIComponent(playerName!)}?username=${encodeURIComponent(username)}${weights}`
      ),
    enabled: !!playerName,
  });
}
