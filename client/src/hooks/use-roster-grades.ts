import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface PositionGrade {
  grade: string;
  starter_value: number;
  depth: number;
  flags: string[];
}

export interface LeagueGrades {
  league_id: string;
  league_name: string;
  total_rosters: number;
  grades: Record<string, PositionGrade>;
  overall_grade: string;
}

export interface RosterGradesResult {
  leagues: LeagueGrades[];
}

export function useRosterGrades(username: string, showRedraft = false) {
  return useQuery<RosterGradesResult>({
    queryKey: ["roster-grades", username, showRedraft],
    queryFn: () =>
      apiFetch(
        `/api/roster-grades?username=${encodeURIComponent(username)}${showRedraft ? "&redraft=true" : ""}`
      ),
    enabled: !!username,
  });
}
