import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { OverviewData, LeagueGroup } from "@shared/types";

interface OverviewResponse extends OverviewData {
  league_groups: LeagueGroup[];
}

interface SyncResponse {
  job_id: string;
  status: string;
  message?: string;
}

interface SyncStatus {
  job_id?: string;
  status: string;
  step?: string;
  detail?: string;
  leagues_total?: number;
  leagues_done?: number;
  error?: string;
}

/** Fetch overview data for a user */
export function useOverview(username: string | undefined) {
  return useQuery<OverviewResponse>({
    queryKey: ["overview", username],
    queryFn: () => apiFetch(`/api/overview?username=${encodeURIComponent(username!)}`),
    enabled: !!username,
  });
}

/** Start a sync job */
export function useStartSync() {
  const queryClient = useQueryClient();

  return useMutation<SyncResponse, Error, string>({
    mutationFn: (username: string) =>
      apiFetch("/api/sync", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    onSuccess: (_data, username) => {
      // Invalidate overview when sync starts so it refreshes
      queryClient.invalidateQueries({ queryKey: ["overview", username] });
    },
  });
}

/** Poll sync status */
export function useSyncStatus(username: string | undefined, enabled: boolean) {
  return useQuery<SyncStatus>({
    queryKey: ["syncStatus", username],
    queryFn: () =>
      apiFetch(`/api/sync/status?username=${encodeURIComponent(username!)}`),
    enabled: !!username && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "running") return 2000;
      return false;
    },
  });
}
