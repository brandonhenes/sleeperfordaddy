import { useQuery } from "@tanstack/react-query";
import type { Notification } from "@shared/types";
import { apiFetch } from "../lib/api";

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
