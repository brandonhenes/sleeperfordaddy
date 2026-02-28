import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface PlayerSummary {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
}

export interface ValuePoint { date: string; value: number }
export interface OwnershipEntry { league_name: string; league_id: string }
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

export interface PlayerDetail {
  summary: PlayerSummary;
  valueHistory: ValuePoint[];
  ownership: OwnershipEntry[];
  mentions: Mention[];
  prospect: ProspectInfo | null;
  recommendation: RecInfo | null;
}

export function usePlayer(playerName: string | undefined, username: string) {
  return useQuery<PlayerDetail>({
    queryKey: ["player", playerName, username],
    queryFn: () =>
      apiFetch(
        `/api/player/${encodeURIComponent(playerName!)}?username=${encodeURIComponent(username)}`
      ),
    enabled: !!playerName,
  });
}
