import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type { InjuredPlayerView, BuyingWindow } from "../../shared/types.js";

// ─── Helpers ───
const DEFAULT_AVG_WEEKS = 4;
const INJURY_AVG_WEEKS: Record<string, number> = {
  acl: 42,
  achilles: 44,
  mcl: 6,
  hamstring: 3,
  ankle: 6,
  shoulder: 3,
  concussion: 2,
  hand: 6,
  foot: 6,
  leg: 12,
  knee: 4,
  back: 3,
  hip: 4,
  ribs: 3,
  groin: 3,
  calf: 3,
  quad: 3,
  elbow: 4,
  wrist: 4,
  neck: 3,
  abdomen: 4,
  toe: 4,
  thumb: 4,
};

function avgWeeksFromBodyPart(bodyPart: string | null): number {
  if (!bodyPart) return DEFAULT_AVG_WEEKS;
  return INJURY_AVG_WEEKS[bodyPart.toLowerCase()] ?? DEFAULT_AVG_WEEKS;
}

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

async function resolveUserId(userIdOrUsername: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT user_id
    FROM users
    WHERE user_id = ${userIdOrUsername}
       OR LOWER(username) = LOWER(${userIdOrUsername})
    LIMIT 1
  `);
  return (rows as unknown as { user_id: string }[])[0]?.user_id ?? null;
}

async function ensureFcAtInjuryPopulated(): Promise<void> {
  await db.execute(sql`
    UPDATE injury_tracker it
    SET fc_at_injury = (
      SELECT fc.dynasty_value
      FROM fantasycalc_daily fc
      WHERE fc.player_name = it.player_name
        AND fc.snapshot_date <= it.injury_date
      ORDER BY fc.snapshot_date DESC
      LIMIT 1
    )
    WHERE fc_at_injury IS NULL
  `);
}

// ─── Main ───

export async function getInjuredPlayers(
  userIdOrUsername: string
): Promise<InjuredPlayerView[]> {
  const userId = await resolveUserId(userIdOrUsername);
  if (!userId) return [];
  const rows = await db.execute(sql`
    SELECT
      it.player_name AS full_name,
      it.position,
      COALESCE(pm.team, it.team, '') AS team,
      it.injury_type,
      it.injury_date::text AS injury_date,
      it.expected_return_weeks,
      it.notes,
      it.status,
      pm.player_id,
      pm.team AS current_team,
      COUNT(DISTINCT rp.league_id)::int AS league_count
    FROM injury_tracker it
    JOIN players_master pm
      ON LOWER(pm.full_name) = LOWER(it.player_name)
     AND pm.position = it.position
    JOIN roster_players rp ON rp.player_id = pm.player_id
    JOIN user_leagues ul
      ON ul.league_id = rp.league_id
     AND ul.user_id = ${userId}
    WHERE it.status = 'active'
    GROUP BY it.id, it.player_name, it.position, it.team, it.injury_type,
             it.injury_date, it.expected_return_weeks, it.notes, it.status,
             pm.player_id, pm.team
  `);

  type Row = {
    full_name: string;
    position: string;
    team: string;
    injury_type: string | null;
    injury_date: string | null;
    expected_return_weeks: number | null;
    notes: string | null;
    status: string;
    player_id: string;
    current_team: string | null;
    league_count: number;
  };
  const rawRows = rows as unknown as Row[];
  if (rawRows.length === 0) return [];

  const result: InjuredPlayerView[] = rawRows.map((r) => {
    return {
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.current_team ?? r.team,
      injury_type: r.injury_type,
      injury_date: r.injury_date,
      expected_return_weeks: r.expected_return_weeks,
      notes: r.notes,
      status: r.status,
      injury_status: r.status,
      injury_body_part: r.injury_type,
      injury_start_date: r.injury_date,
      estimated_return_week: r.expected_return_weeks,
      estimated_return_date: estimateReturnDate(r.injury_date, r.expected_return_weeks ?? DEFAULT_AVG_WEEKS),
      league_count: r.league_count,
      total_leagues: r.league_count,
      exposure_pct: 100,
      current_edge_score: 0,
      pre_injury_edge_score: null,
      value_change_pct: null,
    };
  });

  result.sort((a, b) => severityOrder(a.status ?? a.injury_status) - severityOrder(b.status ?? b.injury_status)
    || b.league_count - a.league_count);

  return result;
}

export async function getBuyingWindows(
  userIdOrUsername: string
): Promise<BuyingWindow[]> {
  const userId = await resolveUserId(userIdOrUsername);
  if (!userId) return [];
  await ensureFcAtInjuryPopulated();
  const rows = await db.execute(sql`
    SELECT
      it.player_name AS full_name,
      it.position,
      COALESCE(pm.team, it.team, '') AS team,
      it.injury_type,
      it.injury_date::text AS injury_date,
      it.expected_return_weeks,
      it.notes,
      it.status,
      pm.player_id,
      fc.dynasty_value::int AS fc_current,
      it.fc_at_injury::int AS fc_at_injury,
      CASE
        WHEN fc.dynasty_value IS NOT NULL
         AND it.fc_at_injury IS NOT NULL
         AND fc.dynasty_value < it.fc_at_injury * 0.7
        THEN true
        ELSE false
      END AS is_buying_window
    FROM injury_tracker it
    JOIN players_master pm
      ON LOWER(pm.full_name) = LOWER(it.player_name)
     AND pm.position = it.position
    LEFT JOIN fantasycalc_daily fc
      ON fc.player_name = it.player_name
     AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE it.status = 'active'
      AND it.expected_return_weeks IS NOT NULL
    ORDER BY it.expected_return_weeks ASC
  `);

  type Row = {
    full_name: string;
    position: string;
    team: string;
    injury_type: string | null;
    injury_date: string | null;
    expected_return_weeks: number | null;
    notes: string | null;
    status: string;
    player_id: string;
    fc_current: number | null;
    fc_at_injury: number | null;
    is_buying_window: boolean;
  };
  const rawRows = rows as unknown as Row[];
  if (rawRows.length === 0) return [];

  const windows: BuyingWindow[] = [];

  for (const r of rawRows) {
    const valueChangePct = r.fc_at_injury && r.fc_at_injury > 0 && r.fc_current != null
      ? Math.round(((r.fc_current - r.fc_at_injury) / r.fc_at_injury) * 1000) / 10
      : null;

    const buyReasons: string[] = [];
    if (r.fc_current != null) buyReasons.push(`Current FC value: ${r.fc_current}`);
    if (r.fc_at_injury != null) buyReasons.push(`FC at injury: ${r.fc_at_injury}`);
    if (valueChangePct != null) buyReasons.push(`Value moved ${valueChangePct.toFixed(1)}% since injury`);

    const riskFactors: string[] = [];
    if (r.notes) riskFactors.push(r.notes);

    const player: InjuredPlayerView = {
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.team,
      injury_type: r.injury_type,
      injury_date: r.injury_date,
      expected_return_weeks: r.expected_return_weeks,
      notes: r.notes,
      status: r.status,
      fc_current: r.fc_current,
      fc_at_injury: r.fc_at_injury,
      is_buying_window: r.is_buying_window,
      injury_status: r.status,
      injury_body_part: r.injury_type,
      injury_start_date: r.injury_date,
      estimated_return_week: r.expected_return_weeks,
      estimated_return_date: estimateReturnDate(r.injury_date, r.expected_return_weeks ?? DEFAULT_AVG_WEEKS),
      league_count: 0,
      total_leagues: 0,
      exposure_pct: 0,
      current_edge_score: 0,
      pre_injury_edge_score: null,
      value_change_pct: valueChangePct,
    };

    windows.push({
      player,
      opportunity_score: r.expected_return_weeks ?? 0,
      buy_reasons: buyReasons,
      risk_factors: riskFactors,
      leagues_to_target: [],
    });
  }

  return windows;
}
