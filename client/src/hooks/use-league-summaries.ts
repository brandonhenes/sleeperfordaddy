import { useQuery } from "@tanstack/react-query";
import type { LeagueSummary } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useLeagueSummaries(username: string, showRedraft = false) {
  const suffix = showRedraft ? "?redraft=true" : "";

  return useQuery<LeagueSummary[]>({
    queryKey: ["league-summaries", username, showRedraft],
    queryFn: () =>
      apiFetch(
        `/api/leagues/${encodeURIComponent(username)}/summary${suffix}`
      ),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
  });
}
