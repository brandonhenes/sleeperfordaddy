import { useQuery } from "@tanstack/react-query";
import type { RookieDraftContext } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useRookieDraftContext(username: string) {
  return useQuery<RookieDraftContext>({
    queryKey: ["rookie-draft-context", username],
    queryFn: () => apiFetch(`/api/rookie-draft/context/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 10 * 60 * 1000,
  });
}
