import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface NotificationItem {
  id: string;
  message: string;
  created_at: number;
  read: boolean;
}

export function useNotifications(username: string) {
  return useQuery<NotificationItem[]>({
    queryKey: ["notifications", username],
    queryFn: () => apiFetch(`/api/notifications/${encodeURIComponent(username)}`),
    enabled: false,
  });
}
