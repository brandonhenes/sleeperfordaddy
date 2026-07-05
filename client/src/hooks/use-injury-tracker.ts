import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { InjuredPlayerView, BuyingWindow } from "@shared/types";

export function useInjuredPlayers(username: string) {
  return useQuery<InjuredPlayerView[]>({
    queryKey: ["injuries", username],
    queryFn: () =>
      apiFetch(`/api/injuries/${encodeURIComponent(username)}`),
    enabled: !!username,
  });
}

export function useBuyingWindows(username: string) {
  return useQuery<BuyingWindow[]>({
    queryKey: ["injuries", "buying-windows", username],
    queryFn: () =>
      apiFetch(`/api/injuries/${encodeURIComponent(username)}/buying-windows`),
    enabled: !!username,
  });
}
