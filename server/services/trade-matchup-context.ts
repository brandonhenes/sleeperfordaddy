export interface TeamWeekRow {
  league_id: string;
  season: number;
  week: number;
  roster_id: number;
  player_ids: string[] | null;
  starter_ids: string[] | null;
  opponent_roster_id: number | null;
  opponent_total: number | null;
  league_median: number | null;
  roster_total: number | null;
}

export interface ProfileAssignmentRow {
  league_id: string;
  profile_id: number;
}

export interface ProfileWeekPointsRow {
  profile_id: number;
  season: number;
  week: number;
  points: Record<string, number>;
}

export interface LeagueWeekOverridesRow {
  league_id: string;
  season: number;
  week: number;
  points: Record<string, number>;
}

export interface TeamWeekSummary {
  league_id: string;
  season: number;
  week: number;
  roster_id: number;
  roster_total: number;
  opponent_total: number;
  league_median: number;
  playerIds: Set<string>;
  starterIds: Set<string>;
}

export function buildCompactTeamWeekMap(
  rows: TeamWeekRow[]
): Map<string, TeamWeekSummary> {
  const map = new Map<string, TeamWeekSummary>();
  for (const row of rows) {
    map.set(`${row.league_id}:${row.season}:${row.week}:${row.roster_id}`, {
      league_id: row.league_id,
      season: row.season,
      week: row.week,
      roster_id: row.roster_id,
      roster_total: Number(row.roster_total ?? 0),
      opponent_total: Number(row.opponent_total ?? 0),
      league_median: Number(row.league_median ?? 0),
      playerIds: new Set(row.player_ids ?? []),
      starterIds: new Set(row.starter_ids ?? []),
    });
  }
  return map;
}

export function buildCompactPlayerWeekPoints(
  assignments: ProfileAssignmentRow[],
  profileRows: ProfileWeekPointsRow[],
  relevantPlayerIds: string[],
  overrideRows: LeagueWeekOverridesRow[] = []
): Map<string, number> {
  const map = new Map<string, number>();
  const leagueIdsByProfile = new Map<number, string[]>();
  for (const assignment of assignments) {
    const bucket = leagueIdsByProfile.get(assignment.profile_id) ?? [];
    bucket.push(assignment.league_id);
    leagueIdsByProfile.set(assignment.profile_id, bucket);
  }

  for (const row of profileRows) {
    for (const leagueId of leagueIdsByProfile.get(row.profile_id) ?? []) {
      for (const playerId of relevantPlayerIds) {
        const points = Number(row.points?.[playerId]);
        if (!Number.isFinite(points)) continue;
        map.set(`${leagueId}:${row.season}:${row.week}:${playerId}`, points);
      }
    }
  }

  for (const row of overrideRows) {
    for (const playerId of relevantPlayerIds) {
      const points = Number(row.points?.[playerId]);
      if (!Number.isFinite(points)) continue;
      map.set(`${row.league_id}:${row.season}:${row.week}:${playerId}`, points);
    }
  }
  return map;
}
