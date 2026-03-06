import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface MockDraftNeed {
  position: string;
  urgency: number;
  grade: string;
}

export interface MockDraftTeam {
  roster_id: number;
  display_name: string;
  is_user: boolean;
  archetype: string;
  draft_position: number;
  needs: MockDraftNeed[];
}

export interface MockDraftProspect {
  player_name: string;
  position: string;
  school: string | null;
  tier: string;
  positional_rank: number;
  overall_rank: number;
  consensus_comp: string | null;
  age: number | null;
}

export interface MockDraftSetup {
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  total_rosters: number;
  draft_rounds: number;
  scoring_label: string;
  teams: MockDraftTeam[];
  prospects: MockDraftProspect[];
}

export interface MockDraftPick {
  pick_number: number;
  round: number;
  pick_in_round: number;
  roster_id: number;
  display_name: string;
  is_user: boolean;
  selected_player: string | null;
  selected_position: string | null;
  is_auto: boolean;
  reasoning: string | null;
}

export function useMockDraftSetup(username: string, leagueId: string) {
  return useQuery<MockDraftSetup>({
    queryKey: ["mock-draft-setup", username, leagueId],
    queryFn: () =>
      apiFetch(
        `/api/rookie-draft/mock-setup/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}`,
      ),
    enabled: !!username && !!leagueId,
    staleTime: 10 * 60 * 1000,
  });
}
