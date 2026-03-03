import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface LeagueInfo {
  league_id: string;
  name: string;
  season: number;
  total_rosters: number | null;
  status: string;
}

export interface StandingsEntry {
  owner_id: string;
  display_name: string | null;
  team_name: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_against: number;
}

export interface RosterPlayer {
  player_name: string | null;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
}

export interface TradeSide {
  roster_id: number;
  display_name: string | null;
  gave: string[];
  received: string[];
}

export interface TradeEntry {
  transaction_id: string;
  created_at: number;
  sides: TradeSide[];
}

export interface LeagueDetailData {
  league: LeagueInfo;
  standings: StandingsEntry[];
  roster: RosterPlayer[];
  recent_trades: TradeEntry[];
}

export function useLeagueDetail(
  leagueId: string | undefined,
  username: string | undefined
) {
  return useQuery<LeagueDetailData>({
    queryKey: ["league-detail", leagueId, username],
    queryFn: () =>
      apiFetch(
        `/api/league/${encodeURIComponent(leagueId!)}?username=${encodeURIComponent(username!)}`
      ),
    enabled: !!leagueId && !!username,
  });
}
