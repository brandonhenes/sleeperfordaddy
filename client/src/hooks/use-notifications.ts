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
    enabled: false,
  });
}
