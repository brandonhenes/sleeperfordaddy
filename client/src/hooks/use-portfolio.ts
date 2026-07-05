import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";
import type { PortfolioData } from "@shared/types";

export function usePortfolio(username: string | undefined) {
  const weights = weightQueryParams();
  return useQuery<PortfolioData>({
    queryKey: ["portfolio", username, weights],
    queryFn: () =>
      apiFetch(`/api/portfolio?username=${encodeURIComponent(username!)}${weights}`),
    enabled: !!username,
  });
}
