import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

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

export function useWaiverWire(leagueId: string) {
  return useQuery<WaiverPlayer[]>({
    queryKey: ["waiver-wire", leagueId],
    queryFn: () => apiFetch(`/api/waiver-wire/${encodeURIComponent(leagueId)}`),
    enabled: !!leagueId,
  });
}
