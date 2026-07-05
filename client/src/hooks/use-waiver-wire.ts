import { useQuery } from "@tanstack/react-query";
import type { WaiverWireResult } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export function useWaiverWire(leagueId: string) {
  const weights = weightQueryParams();
  const querySuffix = weights ? `?${weights.slice(1)}` : "";
  return useQuery<WaiverWireResult>({
    queryKey: ["waiver-wire", leagueId, weights],
    queryFn: () => apiFetch(`/api/waiver-wire/${encodeURIComponent(leagueId)}${querySuffix}`),
    enabled: !!leagueId,
  });
}
