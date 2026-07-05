import { useQuery } from "@tanstack/react-query";
import type { PlayerDetail } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export function usePlayer(playerName: string | undefined, username: string) {
  const weights = weightQueryParams();
  return useQuery<PlayerDetail>({
    queryKey: ["player", playerName, username, weights],
    queryFn: () =>
      apiFetch(
        `/api/player/${encodeURIComponent(playerName!)}?username=${encodeURIComponent(username)}${weights}`
      ),
    enabled: !!playerName,
  });
}
