import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { weightQueryParams } from "../lib/weights";
import type { AcquisitionResult } from "@shared/types";

export type AcquisitionDepth = "quick" | "full";

function acquisitionQueryParams(depth: AcquisitionDepth): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}${depth === "quick" ? "&limit=8" : ""}`;
  return params ? `?${params.slice(1)}` : "";
}

export function useAcquisition(username: string, target: { name: string; id: string } | null, depth: AcquisitionDepth = "quick") {
  const suffix = acquisitionQueryParams(depth);
  return useQuery<AcquisitionResult>({
    queryKey: ["acquisition", username, target?.id, depth, suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/acquire/${encodeURIComponent(username)}/${encodeURIComponent(target!.id)}${suffix}`
      ),
    enabled: !!username && !!target,
    staleTime: 10 * 60 * 1000,
  });
}

