import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";
import type { InjuredPlayerView, BuyingWindow } from "../../shared/types.js";

// ─── Helpers ───

function estimateReturnDate(startDate: string | null, avgWeeks: number): string | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;
  const ret = new Date(start.getTime() + avgWeeks * 7 * 24 * 60 * 60 * 1000);
  return ret.toISOString().slice(0, 10);
}

function estimateReturnWeek(startDate: string | null, avgWeeks: number): number | null {
  const retDate = estimateReturnDate(startDate, avgWeeks);
  if (!retDate) return null;
  // NFL season starts ~first week of September
  const seasonStart = new Date(`${new Date().getFullYear()}-09-05`);
  const ret = new Date(retDate);
  const diffMs = ret.getTime() - seasonStart.getTime();
  const week = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  if (week < 1 || week > 18) return null;
  return week;
}

function severityOrder(status: string): number {
  const s = status.toLowerCase();
  if (s === "ir" || s === "pup" || s === "out") return 0;
  if (s === "doubtful") return 1;
  if (s === "questionable") return 2;
  return 3;
}

// ─── Main ───

export async function getInjuredPlayers(
  username: string
): Promise<InjuredPlayerView[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const dynastyLeagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (dynastyLeagueIds.length === 0) return [];

  const leagueIdFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const leagueInClause = sql.join(leagueIdFrags, sql`, `);

  // Find injured players the user owns across their dynasty leagues
  const rows = await db.execute(sql`
    SELECT
      pm.player_id,
      pm.full_name,
      pm.position,
      pm.team,
      pm.injury_status,
      pm.injury_body_part,
      pm.injury_start_date,
      COUNT(DISTINCT rp.league_id)::int AS league_count,
      irb.avg_weeks_out,
      irb.min_weeks,
      irb.max_weeks
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    LEFT JOIN injury_recovery_baselines irb
      ON LOWER(irb.injury_type) = LOWER(pm.injury_body_part)
      AND irb.position = 'ALL'
    WHERE rp.owner_id = ${userId}
      AND rp.league_id IN (${leagueInClause})
      AND pm.injury_status IS NOT NULL
      AND pm.injury_status != ''
      AND pm.team IS NOT NULL
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
    GROUP BY pm.player_id, pm.full_name, pm.position, pm.team,
             pm.injury_status, pm.injury_body_part, pm.injury_start_date,
             irb.avg_weeks_out, irb.min_weeks, irb.max_weeks
  `);

  type Row = {
    player_id: string;
    full_name: string;
    position: string;
    team: string;
    injury_status: string;
    injury_body_part: string | null;
    injury_start_date: string | null;
    league_count: number;
    avg_weeks_out: number | null;
    min_weeks: number | null;
    max_weeks: number | null;
  };
  const rawRows = rows as unknown as Row[];
  if (rawRows.length === 0) return [];

  const totalLeagues = dynastyLeagueIds.length;
  const playerIds = rawRows.map((r) => r.player_id);
  const compMap = await getCompositeValues(playerIds, "sf");

  // Get pre-injury snapshots (most recent snapshot before injury started)
  const snapshotRows = await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id, edge_score
    FROM player_value_snapshots
    WHERE player_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY player_id, snapshot_date DESC
  `);
  const preInjuryMap = new Map<string, number>();
  for (const r of snapshotRows as unknown as { player_id: string; edge_score: number | null }[]) {
    if (r.edge_score != null) preInjuryMap.set(r.player_id, r.edge_score);
  }

  const result: InjuredPlayerView[] = rawRows.map((r) => {
    const comp = compMap.get(r.player_id);
    const currentEdge = comp?.edge_score ?? 0;
    const preInjury = preInjuryMap.get(r.player_id) ?? null;
    const avgWeeks = r.avg_weeks_out ?? 4;
    const valueChangePct = preInjury && preInjury > 0
      ? Math.round(((currentEdge - preInjury) / preInjury) * 1000) / 10
      : null;

    return {
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.team,
      injury_status: r.injury_status,
      injury_body_part: r.injury_body_part,
      injury_start_date: r.injury_start_date,
      estimated_return_week: estimateReturnWeek(r.injury_start_date, avgWeeks),
      estimated_return_date: estimateReturnDate(r.injury_start_date, avgWeeks),
      league_count: r.league_count,
      total_leagues: totalLeagues,
      exposure_pct: Math.round((r.league_count / totalLeagues) * 1000) / 10,
      current_edge_score: currentEdge,
      pre_injury_edge_score: preInjury,
      value_change_pct: valueChangePct,
    };
  });

  result.sort((a, b) => severityOrder(a.injury_status) - severityOrder(b.injury_status)
    || b.league_count - a.league_count);

  return result;
}

export async function getBuyingWindows(
  username: string
): Promise<BuyingWindow[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const dynastyLeagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (dynastyLeagueIds.length === 0) return [];

  const leagueIdFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const leagueInClause = sql.join(leagueIdFrags, sql`, `);

  // Find injured players on OTHER teams in the user's leagues that the user does NOT own
  const rows = await db.execute(sql`
    SELECT
      pm.player_id,
      pm.full_name,
      pm.position,
      pm.team,
      pm.injury_status,
      pm.injury_body_part,
      pm.injury_start_date,
      irb.avg_weeks_out,
      irb.min_weeks,
      irb.max_weeks
    FROM players_master pm
    JOIN roster_players rp ON rp.player_id = pm.player_id
    LEFT JOIN injury_recovery_baselines irb
      ON LOWER(irb.injury_type) = LOWER(pm.injury_body_part)
      AND irb.position = 'ALL'
    WHERE rp.league_id IN (${leagueInClause})
      AND rp.owner_id != ${userId}
      AND pm.injury_status IS NOT NULL
      AND pm.injury_status != ''
      AND pm.team IS NOT NULL
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND NOT EXISTS (
        SELECT 1 FROM roster_players rp2
        WHERE rp2.player_id = pm.player_id
          AND rp2.owner_id = ${userId}
          AND rp2.league_id IN (${leagueInClause})
      )
    GROUP BY pm.player_id, pm.full_name, pm.position, pm.team,
             pm.injury_status, pm.injury_body_part, pm.injury_start_date,
             irb.avg_weeks_out, irb.min_weeks, irb.max_weeks
  `);

  type Row = {
    player_id: string;
    full_name: string;
    position: string;
    team: string;
    injury_status: string;
    injury_body_part: string | null;
    injury_start_date: string | null;
    avg_weeks_out: number | null;
    min_weeks: number | null;
    max_weeks: number | null;
  };
  const rawRows = rows as unknown as Row[];
  if (rawRows.length === 0) return [];

  const playerIds = rawRows.map((r) => r.player_id);
  const compMap = await getCompositeValues(playerIds, "sf");

  // Get pre-injury snapshots
  const snapshotRows = await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id, edge_score
    FROM player_value_snapshots
    WHERE player_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY player_id, snapshot_date DESC
  `);
  const preInjuryMap = new Map<string, number>();
  for (const r of snapshotRows as unknown as { player_id: string; edge_score: number | null }[]) {
    if (r.edge_score != null) preInjuryMap.set(r.player_id, r.edge_score);
  }

  // Find which leagues/owners have each player (for targeting)
  const ownerRows = await db.execute(sql`
    SELECT rp.player_id, rp.league_id, l.name AS league_name,
           COALESCE(lu.display_name, rp.owner_id) AS owner_display_name
    FROM roster_players rp
    JOIN leagues l ON rp.league_id = l.league_id
    LEFT JOIN league_users lu ON lu.league_id = rp.league_id AND lu.user_id = rp.owner_id
    WHERE rp.player_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
      AND rp.league_id IN (${leagueInClause})
      AND rp.owner_id != ${userId}
  `);
  type OwnerRow = { player_id: string; league_id: string; league_name: string; owner_display_name: string };
  const targetMap = new Map<string, { league_id: string; league_name: string; owner_display_name: string }[]>();
  for (const r of ownerRows as unknown as OwnerRow[]) {
    const list = targetMap.get(r.player_id) ?? [];
    list.push({ league_id: r.league_id, league_name: r.league_name, owner_display_name: r.owner_display_name });
    targetMap.set(r.player_id, list);
  }

  const totalLeagues = dynastyLeagueIds.length;

  const windows: BuyingWindow[] = [];

  for (const r of rawRows) {
    const comp = compMap.get(r.player_id);
    const currentEdge = comp?.edge_score ?? 0;
    const preInjury = preInjuryMap.get(r.player_id) ?? null;
    const avgWeeks = r.avg_weeks_out ?? 4;

    const valueChangePct = preInjury && preInjury > 0
      ? Math.round(((currentEdge - preInjury) / preInjury) * 1000) / 10
      : null;

    // Filter: value dropped >10% AND estimated return within 8 weeks
    if (valueChangePct === null || valueChangePct >= -10) continue;

    const estReturnDate = estimateReturnDate(r.injury_start_date, avgWeeks);
    if (estReturnDate) {
      const weeksUntilReturn = (new Date(estReturnDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000);
      if (weeksUntilReturn > 8) continue; // too far out
    }

    // Score: bigger drop + sooner return = higher score
    const dropScore = Math.min(50, Math.abs(valueChangePct ?? 0) * 2);
    const returnScore = estReturnDate
      ? Math.max(0, 50 - ((new Date(estReturnDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)) * 6)
      : 25;
    const opportunityScore = Math.round(Math.min(100, dropScore + returnScore));

    const buyReasons: string[] = [];
    if (valueChangePct !== null) buyReasons.push(`Value dropped ${Math.abs(valueChangePct).toFixed(1)}% since injury`);
    if (estReturnDate) buyReasons.push(`Estimated return: ${estReturnDate}`);
    if (currentEdge >= 60) buyReasons.push(`Still a strong asset (edge score ${currentEdge})`);

    const riskFactors: string[] = [];
    if (r.injury_body_part) {
      const severe = ["acl", "achilles"];
      if (severe.includes(r.injury_body_part.toLowerCase())) {
        riskFactors.push("Season-ending injury type");
      }
    }
    if (r.max_weeks && r.max_weeks > 12) riskFactors.push(`Recovery could take up to ${r.max_weeks} weeks`);

    const player: InjuredPlayerView = {
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.team,
      injury_status: r.injury_status,
      injury_body_part: r.injury_body_part,
      injury_start_date: r.injury_start_date,
      estimated_return_week: estimateReturnWeek(r.injury_start_date, avgWeeks),
      estimated_return_date: estReturnDate,
      league_count: 0,
      total_leagues: totalLeagues,
      exposure_pct: 0,
      current_edge_score: currentEdge,
      pre_injury_edge_score: preInjury,
      value_change_pct: valueChangePct,
    };

    windows.push({
      player,
      opportunity_score: opportunityScore,
      buy_reasons: buyReasons,
      risk_factors: riskFactors,
      leagues_to_target: targetMap.get(r.player_id) ?? [],
    });
  }

  windows.sort((a, b) => b.opportunity_score - a.opportunity_score);
  return windows;
}
