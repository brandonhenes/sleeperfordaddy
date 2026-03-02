import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export type SignalType =
  | "SMART_MONEY_BUY"
  | "HYPE_SELL"
  | "EXPERT_BUY"
  | "EXPERT_FADE"
  | "CONSENSUS_LOCK"
  | "NONE";

export interface MarketSignal {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  fp_score: number | null;
  fc_value: number | null;
  ktc_value: number | null;
  fp_value: number | null;
  signal: SignalType;
  signal_strength: number;
  action: string;
  reason: string;
}

export interface SignalSummary {
  total_players_analyzed: number;
  smart_money_buys: number;
  hype_sells: number;
  expert_buys: number;
  expert_fades: number;
  consensus_locks: number;
  top_buy: MarketSignal | null;
  top_sell: MarketSignal | null;
}

export function useMarketSignals(username?: string) {
  const qs = username ? `?username=${encodeURIComponent(username)}` : "";
  return useQuery<MarketSignal[]>({
    queryKey: ["market-signals", username ?? "global"],
    queryFn: () => apiFetch(`/api/market-signals${qs}`),
  });
}

export function useSignalSummary() {
  return useQuery<SignalSummary>({
    queryKey: ["market-signals", "summary"],
    queryFn: () => apiFetch("/api/market-signals/summary"),
  });
}
