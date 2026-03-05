import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type {
  LeagueHistoryData,
  LeagueHistorySeason,
  LeagueHistoryTeam,
  TeamValueSnapshot,
} from "../../shared/types.js";

export async function getLeagueHistory(
  groupId: string
): Promise<LeagueHistoryData> {
  // 1. Get all leagues in this group, ordered by season
  const leagueRows = await db.execute(sql`
    SELECT league_id, name, season
    FROM leagues
    WHERE group_id = ${groupId}
    ORDER BY season ASC
  `);

  type LR = { league_id: string; name: string; season: number };
  const leagues = leagueRows as unknown as LR[];

  if (leagues.length === 0) {
    return { group_id: groupId, group_name: "", seasons: [] };
  }

  const groupName = leagues[leagues.length - 1].name;
  const leagueIds = leagues.map((l) => l.league_id);
  const idFrags = leagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(idFrags, sql`, `);

  // 2. Parallel queries for rosters, names, snapshots, finish data
  const [rosterRows, nameRows, snapshotRows, finishRows] = await Promise.all([
    db.execute(sql`
      SELECT league_id, owner_id, roster_id,
             COALESCE(wins, 0)::int AS wins,
             COALESCE(losses, 0)::int AS losses,
             COALESCE(fpts, 0) AS fpts
      FROM rosters
      WHERE league_id IN (${inClause})
    `),
    db.execute(sql`
      SELECT league_id, user_id, display_name, team_name
      FROM league_users
      WHERE league_id IN (${inClause})
    `),
    db.execute(sql`
      SELECT league_id, roster_id, owner_id, snapshot_date,
             COALESCE(total_edge_score, 0) AS total_edge,
             COALESCE(starter_edge_score, 0) AS starter_edge,
             COALESCE(draft_capital_edge, 0) AS draft_capital_edge,
             COALESCE(archetype, '') AS archetype
      FROM team_value_snapshots
      WHERE league_id IN (${inClause})
      ORDER BY snapshot_date ASC
    `),
    db.execute(sql`
      SELECT league_id, user_id, finish_place
      FROM league_season_summary
      WHERE league_id IN (${inClause})
    `),
  ]);

  // 3. Build lookup maps
  type RosterRow = { league_id: string; owner_id: string; roster_id: number; wins: number; losses: number; fpts: number };
  type NameRow = { league_id: string; user_id: string; display_name: string | null; team_name: string | null };
  type SnapRow = { league_id: string; roster_id: number; owner_id: string; snapshot_date: string; total_edge: number; starter_edge: number; draft_capital_edge: number; archetype: string };
  type FinishRow = { league_id: string; user_id: string; finish_place: number | null };

  const nameMap = new Map<string, string>();
  for (const r of nameRows as unknown as NameRow[]) {
    const name = r.team_name?.trim() || r.display_name?.trim() || r.user_id;
    nameMap.set(`${r.league_id}:${r.user_id}`, name);
  }

  const finishMap = new Map<string, number | null>();
  for (const r of finishRows as unknown as FinishRow[]) {
    finishMap.set(`${r.league_id}:${r.user_id}`, r.finish_place);
  }

  // Group snapshots by league:owner
  const snapshotMap = new Map<string, TeamValueSnapshot[]>();
  for (const s of snapshotRows as unknown as SnapRow[]) {
    const key = `${s.league_id}:${s.owner_id}`;
    const arr = snapshotMap.get(key) ?? [];
    arr.push({
      league_id: s.league_id,
      roster_id: s.roster_id,
      owner_id: s.owner_id,
      snapshot_date: s.snapshot_date,
      total_edge: s.total_edge,
      starter_edge: s.starter_edge,
      draft_capital_edge: s.draft_capital_edge,
      archetype: s.archetype,
    });
    snapshotMap.set(key, arr);
  }

  // 4. Build seasons
  const seasons: LeagueHistorySeason[] = [];

  for (const league of leagues) {
    const leagueRosters = (rosterRows as unknown as RosterRow[]).filter(
      (r) => r.league_id === league.league_id
    );

    const teams: LeagueHistoryTeam[] = leagueRosters.map((r) => ({
      owner_id: r.owner_id,
      display_name: nameMap.get(`${league.league_id}:${r.owner_id}`) ?? r.owner_id,
      wins: r.wins,
      losses: r.losses,
      fpts: Math.round(r.fpts * 100) / 100,
      finish_place: finishMap.get(`${league.league_id}:${r.owner_id}`) ?? null,
      snapshots: snapshotMap.get(`${league.league_id}:${r.owner_id}`) ?? [],
    }));

    teams.sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

    seasons.push({
      season: league.season,
      league_id: league.league_id,
      teams,
    });
  }

  return { group_id: groupId, group_name: groupName, seasons };
}
