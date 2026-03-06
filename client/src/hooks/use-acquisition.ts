import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { AcquisitionResult } from "../../../shared/types";

export function useAcquisition(username: string, playerName: string | null) {
  return useQuery<AcquisitionResult>({
    queryKey: ["acquisition", username, playerName],
    queryFn: () =>
      apiFetch(
        `/api/trade/acquire/${encodeURIComponent(username)}/${encodeURIComponent(playerName!)}`
      ),
    enabled: !!username && !!playerName,
    staleTime: 10 * 60 * 1000,
  });
}

