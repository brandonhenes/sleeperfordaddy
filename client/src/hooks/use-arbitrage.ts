import { useQuery } from "@tanstack/react-query";
import type { ArbitrageGap } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useFreeAgentGaps(username: string) {
  return useQuery<ArbitrageGap[]>({
    queryKey: ["arbitrage", "free-agents", username],
    queryFn: () =>
      apiFetch(
        `/api/arbitrage/free-agents?username=${encodeURIComponent(username)}`
      ),
    enabled: !!username,
  });
}
