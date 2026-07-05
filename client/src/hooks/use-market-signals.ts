import { useQuery } from "@tanstack/react-query";
import type { MarketSignal, SignalSummary } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useMarketSignals(username?: string) {
  const qs = username ? `?username=${encodeURIComponent(username)}` : "";
  return useQuery<MarketSignal[]>({
    queryKey: ["market-signals", username ?? "global"],
    queryFn: () => apiFetch(`/api/market-signals${qs}`),
  });
}

export function useSignalSummary() {
  return useQuery<SignalSummary>({
    queryKey: ["market-signals", "summary"],
    queryFn: () => apiFetch("/api/market-signals/summary"),
  });
}
