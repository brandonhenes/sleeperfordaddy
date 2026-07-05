import { useQuery } from "@tanstack/react-query";
import type { Prospect, Recommendation, Signal, ValueMover } from "@shared/types";
import { apiFetch } from "../lib/api";

// ─── Types ───

// ─── Hooks ───

export function useRecommendations() {
  return useQuery<Recommendation[]>({
    queryKey: ["market", "recommendations"],
    queryFn: () => apiFetch("/api/market/recommendations"),
  });
}

export function useProspects() {
  return useQuery<Prospect[]>({
    queryKey: ["market", "prospects"],
    queryFn: () => apiFetch("/api/market/prospects"),
  });
}

export function useMovers() {
  return useQuery<ValueMover[]>({
    queryKey: ["market", "value-movers"],
    queryFn: () => apiFetch("/api/market/value-movers"),
  });
}

export function useSignals() {
  return useQuery<Signal[]>({
    queryKey: ["market", "signals"],
    queryFn: () => apiFetch("/api/market/signals"),
  });
}
