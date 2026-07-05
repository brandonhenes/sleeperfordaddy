import { useQuery } from "@tanstack/react-query";
import type { BoardMovement, HitRateData, LeagueADP, ValueSnapshot } from "@shared/types";
import { apiFetch } from "../lib/api";

export function useHitRates() {
  return useQuery<HitRateData>({
    queryKey: ["draft-hit-rates"],
    queryFn: () => apiFetch("/api/rookie-draft/hit-rates"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useRookieADP(season: string) {
  return useQuery<LeagueADP[]>({
    queryKey: ["rookie-adp", season],
    queryFn: () => apiFetch(`/api/rookie-draft/adp/${season}`),
    staleTime: 10 * 60 * 1000,
  });
}

export function useBoardMovement(playerName: string | null) {
  return useQuery<BoardMovement[]>({
    queryKey: ["board-movement", playerName],
    queryFn: () => apiFetch(`/api/rookie-draft/board-movement/${encodeURIComponent(playerName!)}`),
    enabled: !!playerName,
    staleTime: 30 * 60 * 1000,
  });
}

export function useValueTracker(playerName: string | null) {
  return useQuery<ValueSnapshot[]>({
    queryKey: ["value-tracker", playerName],
    queryFn: () => apiFetch(`/api/rookie-draft/value-tracker/${encodeURIComponent(playerName!)}`),
    enabled: !!playerName,
    staleTime: 30 * 60 * 1000,
  });
}
