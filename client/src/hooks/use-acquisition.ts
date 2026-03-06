import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { AcquisitionResult } from "../../../shared/types";

export function useAcquisition(username: string, target: { name: string; id: string } | null) {
  return useQuery<AcquisitionResult>({
    queryKey: ["acquisition", username, target?.id],
    queryFn: () =>
      apiFetch(
        `/api/trade/acquire/${encodeURIComponent(username)}/${encodeURIComponent(target!.id)}`
      ),
    enabled: !!username && !!target,
    staleTime: 10 * 60 * 1000,
  });
}

