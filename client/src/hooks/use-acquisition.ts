import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { weightQueryParams } from "../lib/weights";
import type { AcquisitionResult } from "../../../shared/types";

function acquisitionQueryParams(): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}`;
  return params ? `?${params.slice(1)}` : "";
}

export function useAcquisition(username: string, target: { name: string; id: string } | null) {
  const suffix = acquisitionQueryParams();
  return useQuery<AcquisitionResult>({
    queryKey: ["acquisition", username, target?.id, suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/acquire/${encodeURIComponent(username)}/${encodeURIComponent(target!.id)}${suffix}`
      ),
    enabled: !!username && !!target,
    staleTime: 10 * 60 * 1000,
  });
}

