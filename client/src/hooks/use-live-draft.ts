import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface LiveDraftPickMade {
  pick_number: number;
  round: number;
  pick_in_round: number;
  player_name: string;
  player_id: string;
  position: string | null;
  roster_id: number;
  display_name: string;
  is_user_pick: boolean;
}

export interface BestAvailableProspect {
  player_name: string;
  position: string;
  tier: string;
  positional_rank: number;
  school: string | null;
  consensus_comp: string | null;
  fit_for_user: string | null;
}

export interface ActiveDraftSummary {
  draft_id: string;
  league_id: string;
  league_name: string;
  status: string;
  season: string;
  picks_made: number;
  total_picks: number;
}

export interface LiveDraftState {
  draft_id: string;
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  status: string;
  total_rounds: number;
  total_rosters: number;
  picks_made: LiveDraftPickMade[];
  current_pick: number;
  on_the_clock: {
    roster_id: number;
    display_name: string;
    is_user: boolean;
    needs: { position: string; grade: string }[];
  } | null;
  best_available: BestAvailableProspect[];
  user_recommendation: string | null;
}

export function useActiveDrafts(username: string) {
  return useQuery<ActiveDraftSummary[]>({
    queryKey: ["active-drafts", username],
    queryFn: () => apiFetch(`/api/rookie-draft/active-drafts/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 60 * 1000,
  });
}

export function useLiveDraft(
  username: string,
  draftId: string | null,
  leagueId: string | null,
) {
  return useQuery<LiveDraftState>({
    queryKey: ["live-draft", username, draftId, leagueId],
    queryFn: () =>
      apiFetch(
        `/api/rookie-draft/live/${encodeURIComponent(username)}/${encodeURIComponent(draftId!)}/${encodeURIComponent(leagueId!)}`,
      ),
    enabled: !!username && !!draftId && !!leagueId,
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  });
}
