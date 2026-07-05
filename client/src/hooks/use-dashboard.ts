import { useQuery } from "@tanstack/react-query";
import type { DashboardData, DashboardLeagueScope } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export function useDashboard(
  username: string | undefined,
  leagueScope: DashboardLeagueScope = "dynasty"
) {
  const weights = weightQueryParams();
  return useQuery<DashboardData>({
    queryKey: ["dashboard", username, leagueScope, weights],
    queryFn: () =>
      apiFetch(
        `/api/dashboard/${encodeURIComponent(username!)}?leagueScope=${encodeURIComponent(leagueScope)}${weights}`
      ),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}
