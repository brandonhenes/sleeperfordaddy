import { useQuery } from "@tanstack/react-query";
import type { MockDraftSetup } from "@shared/types";
import { apiFetch } from "../lib/api";

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
