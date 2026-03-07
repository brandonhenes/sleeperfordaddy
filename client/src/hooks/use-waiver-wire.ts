import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export interface WaiverPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
  age: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  source_agreement: "high" | "medium" | "low";
  age_curve: { zone: string; score: number };
  hidden_gem: boolean;
}

export interface WaiverWireResult {
  players: WaiverPlayer[];
  warning: string | null;
}

export function useWaiverWire(leagueId: string) {
  const weights = weightQueryParams();
  const querySuffix = weights ? `?${weights.slice(1)}` : "";
  return useQuery<WaiverWireResult>({
    queryKey: ["waiver-wire", leagueId, weights],
    queryFn: () => apiFetch(`/api/waiver-wire/${encodeURIComponent(leagueId)}${querySuffix}`),
    enabled: !!leagueId,
  });
}
