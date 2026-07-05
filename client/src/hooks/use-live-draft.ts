import { useQuery } from "@tanstack/react-query";
import type { ActiveDraftSummary, LiveDraftState } from "@shared/types";
import { apiFetch } from "../lib/api";

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
