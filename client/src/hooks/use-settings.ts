import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryClient } from "../lib/queryClient";

export interface UserSettings {
  fc_weight: number;
  ktc_weight: number;
  dp_weight: number;
}

export function useSettings(username: string) {
  const query = useQuery<UserSettings>({
    queryKey: ["settings", username],
    queryFn: () => apiFetch(`/api/settings/${encodeURIComponent(username)}`),
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation<UserSettings, Error, UserSettings>({
    mutationFn: (weights) =>
      apiFetch(`/api/settings/${encodeURIComponent(username)}`, {
        method: "PUT",
        body: JSON.stringify(weights),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", username], data);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["player"] });
      void queryClient.invalidateQueries({ queryKey: ["comparables"] });
      void queryClient.invalidateQueries({ queryKey: ["waiver-wire"] });
      void queryClient.invalidateQueries({ queryKey: ["power-rankings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["roster-grades"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
  });

  return {
    weights: query.data,
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    saveWeights: mutation.mutate,
  };
}
