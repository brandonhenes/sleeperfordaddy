import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface Notification {
  id: string;
  type: "arbitrage" | "disagreement" | "injury" | "buying_window";
  title: string;
  message: string;
  player_name: string;
  position: string;
  severity: "high" | "medium" | "low";
}

export function useNotifications(username: string) {
  return useQuery<Notification[]>({
    queryKey: ["notifications", username],
    queryFn: () => apiFetch(`/api/notifications/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    refetchIntervalInBackground: false,
  });
}
