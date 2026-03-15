import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { ExploitAngle, OpponentProfilesResponse } from "../../../shared/types";

interface RefreshProfilesInput {
  leagueId: string;
  username: string;
}

interface OpponentExploitResponse {
  angles: ExploitAngle[];
  myRosterId: number | null;
}

export function useOpponentProfiles(username: string, leagueId: string) {
  return useQuery<OpponentProfilesResponse>({
    queryKey: ["opponent-profiles", username, leagueId],
    queryFn: () =>
      apiFetch(
        `/api/opponents/${encodeURIComponent(leagueId)}/${encodeURIComponent(username)}`
      ),
    enabled: !!username && !!leagueId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefreshOpponentProfiles() {
  const queryClient = useQueryClient();
  return useMutation<OpponentProfilesResponse, Error, RefreshProfilesInput>({
    mutationFn: ({ leagueId, username }) =>
      apiFetch(`/api/opponents/${encodeURIComponent(leagueId)}/refresh`, {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["opponent-profiles", variables.username, variables.leagueId],
      });
      queryClient.invalidateQueries({
        queryKey: ["opponent-exploits", variables.username, variables.leagueId],
      });
    },
  });
}

export function useOpponentExploits(
  username: string,
  leagueId: string,
  rosterId: number | null
) {
  return useQuery<OpponentExploitResponse>({
    queryKey: ["opponent-exploits", username, leagueId, rosterId],
    queryFn: () =>
      apiFetch(
        `/api/opponents/${encodeURIComponent(leagueId)}/${encodeURIComponent(String(rosterId))}/exploits?username=${encodeURIComponent(username)}`
      ),
    enabled: !!username && !!leagueId && rosterId != null,
    staleTime: 5 * 60 * 1000,
  });
}
