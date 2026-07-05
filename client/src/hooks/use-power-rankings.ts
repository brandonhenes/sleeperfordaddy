import { useQuery } from "@tanstack/react-query";
import type { LeaguePowerRanking } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export function usePowerRankings(username: string, showRedraft = false) {
  const weights = weightQueryParams();
  const params = [
    showRedraft ? "redraft=true" : "",
    weights ? weights.slice(1) : "",
  ].filter(Boolean).join("&");
  const suffix = params ? `?${params}` : "";

  return useQuery<LeaguePowerRanking[]>({
    queryKey: ["power-rankings", username, showRedraft, weights],
    queryFn: () =>
      apiFetch(
        `/api/power-rankings/${encodeURIComponent(username)}${suffix}`
      ),
    enabled: !!username,
  });
}
