import { useQuery } from "@tanstack/react-query";
import type { RosterGradesResult } from "@shared/types";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";

export function useRosterGrades(username: string, showRedraft = false) {
  const weights = weightQueryParams();
  return useQuery<RosterGradesResult>({
    queryKey: ["roster-grades", username, showRedraft, weights],
    queryFn: () =>
      apiFetch(
        `/api/roster-grades?username=${encodeURIComponent(username)}${showRedraft ? "&redraft=true" : ""}${weights}`
      ),
    enabled: !!username,
  });
}
