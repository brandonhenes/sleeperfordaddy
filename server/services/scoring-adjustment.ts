import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface LeagueScoringSettings {
  ppr: number;
  te_premium: number;
  carry_bonus: number;
  pass_td: number;
  pass_yd: number;
  rush_yd: number;
  rec_yd: number;
}

export interface ScoringAdjustment {
  adjustment_pct: number;
  delta_ppg: number;
  breakdown: AdjustmentBreakdown;
  league_label: string;
}

export interface AdjustmentBreakdown {
  ppr_delta: number;
  tep_delta: number;
  carry_delta: number;
  pass_td_delta: number;
  pass_yd_delta: number;
  rush_yd_delta: number;
  rec_yd_delta: number;
}

interface PlayerUsage {
  receptions_pg: number;
  carries_pg: number;
  passing_tds_pg: number;
  rushing_tds_pg: number;
  receiving_tds_pg: number;
  passing_yds_pg: number;
  rushing_yds_pg: number;
  receiving_yds_pg: number;
}

const BASELINE: LeagueScoringSettings = {
  ppr: 1,
  te_premium: 0,
  carry_bonus: 0,
  pass_td: 4,
  pass_yd: 0.04,
  rush_yd: 0.1,
  rec_yd: 0.1,
};

const SENSITIVITY = 0.5;

export function parseLeagueScoring(
  scoringSettings: Record<string, unknown> | null
): LeagueScoringSettings {
  if (!scoringSettings) return { ...BASELINE };

  return {
    ppr: toNum(scoringSettings["rec"]) ?? 1,
    te_premium: toNum(scoringSettings["bonus_rec_te"]) ?? 0,
    carry_bonus: toNum(scoringSettings["rush_att"]) ?? 0,
    pass_td: toNum(scoringSettings["pass_td"]) ?? 4,
    pass_yd: toNum(scoringSettings["pass_yd"]) ?? 0.04,
    rush_yd: toNum(scoringSettings["rush_yd"]) ?? 0.1,
    rec_yd: toNum(scoringSettings["rec_yd"]) ?? 0.1,
  };
}

function toNum(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function isNonStandardScoring(settings: LeagueScoringSettings): boolean {
  return (
    settings.te_premium > 0 ||
    settings.carry_bonus > 0 ||
    settings.pass_td !== 4 ||
    Math.abs(settings.ppr - 1) > 0.01 ||
    Math.abs(settings.pass_yd - 0.04) > 0.001 ||
    Math.abs(settings.rush_yd - 0.1) > 0.001 ||
    Math.abs(settings.rec_yd - 0.1) > 0.001
  );
}

export function scoringLabel(s: LeagueScoringSettings): string {
  const tags: string[] = [];

  if (Math.abs(s.ppr - 1) > 0.01) {
    tags.push(s.ppr === 0 ? "Standard" : `${s.ppr} PPR`);
  }
  if (s.te_premium > 0) {
    tags.push(`TEP ${s.te_premium}`);
  }
  if (s.carry_bonus > 0) {
    tags.push(`${s.carry_bonus} PPC`);
  }
  if (s.pass_td !== 4) {
    tags.push(`${s.pass_td}pt Pass TD`);
  }
  if (Math.abs(s.pass_yd - 0.04) > 0.001) {
    tags.push(`${s.pass_yd} Pass Yd`);
  }

  return tags.length > 0 ? tags.join(" | ") : "";
}

export function computeScoringDelta(
  usage: PlayerUsage,
  position: string,
  settings: LeagueScoringSettings
): { delta_ppg: number; breakdown: AdjustmentBreakdown } {
  const breakdown: AdjustmentBreakdown = {
    ppr_delta: usage.receptions_pg * (settings.ppr - BASELINE.ppr),
    tep_delta: position === "TE" ? usage.receptions_pg * settings.te_premium : 0,
    carry_delta: usage.carries_pg * settings.carry_bonus,
    pass_td_delta: usage.passing_tds_pg * (settings.pass_td - BASELINE.pass_td),
    pass_yd_delta: usage.passing_yds_pg * (settings.pass_yd - BASELINE.pass_yd),
    rush_yd_delta: usage.rushing_yds_pg * (settings.rush_yd - BASELINE.rush_yd),
    rec_yd_delta: usage.receiving_yds_pg * (settings.rec_yd - BASELINE.rec_yd),
  };

  const delta_ppg =
    breakdown.ppr_delta +
    breakdown.tep_delta +
    breakdown.carry_delta +
    breakdown.pass_td_delta +
    breakdown.pass_yd_delta +
    breakdown.rush_yd_delta +
    breakdown.rec_yd_delta;

  return {
    delta_ppg: Math.round(delta_ppg * 100) / 100,
    breakdown,
  };
}

export function computeAdjustedEdgeScore(
  baseEdgeScore: number,
  deltaPPG: number,
  baselineFPPG: number
): number {
  if (baselineFPPG <= 0 || baseEdgeScore <= 0) return baseEdgeScore;

  const adjustmentPct = (deltaPPG / baselineFPPG) * SENSITIVITY;
  const adjusted = baseEdgeScore * (1 + adjustmentPct);

  return Math.round(Math.max(39, Math.min(99, adjusted)) * 10) / 10;
}

export async function loadPlayerUsageStats(
  playerIds: string[]
): Promise<Map<string, PlayerUsage>> {
  if (playerIds.length === 0) return new Map();

  const seasonRows = await db.execute(sql`
    SELECT MAX(season) AS latest FROM player_seasonal_stats
  `);
  const latestSeason = (seasonRows as unknown as { latest: number | null }[])[0]?.latest;
  if (!latestSeason) return new Map();

  const frags = playerIds.map((id) => sql`${id}`);
  const inClause = sql.join(frags, sql`, `);

  const rows = await db.execute(sql`
    SELECT sleeper_id, receptions_pg, carries_pg,
           passing_tds_pg, rushing_tds_pg, receiving_tds_pg,
           passing_yds_pg, rushing_yds_pg, receiving_yds_pg
    FROM player_seasonal_stats
    WHERE sleeper_id IN (${inClause}) AND season = ${latestSeason}
  `);

  type Row = {
    sleeper_id: string;
    receptions_pg: number;
    carries_pg: number;
    passing_tds_pg: number;
    rushing_tds_pg: number;
    receiving_tds_pg: number;
    passing_yds_pg: number;
    rushing_yds_pg: number;
    receiving_yds_pg: number;
  };

  const result = new Map<string, PlayerUsage>();
  for (const r of rows as unknown as Row[]) {
    result.set(r.sleeper_id, {
      receptions_pg: r.receptions_pg,
      carries_pg: r.carries_pg,
      passing_tds_pg: r.passing_tds_pg,
      rushing_tds_pg: r.rushing_tds_pg,
      receiving_tds_pg: r.receiving_tds_pg,
      passing_yds_pg: r.passing_yds_pg,
      rushing_yds_pg: r.rushing_yds_pg,
      receiving_yds_pg: r.receiving_yds_pg,
    });
  }

  return result;
}

export function estimateBaselineFPPG(usage: PlayerUsage, _position: string): number {
  return (
    usage.receptions_pg * BASELINE.ppr +
    usage.passing_yds_pg * BASELINE.pass_yd +
    usage.rushing_yds_pg * BASELINE.rush_yd +
    usage.receiving_yds_pg * BASELINE.rec_yd +
    usage.passing_tds_pg * BASELINE.pass_td +
    usage.rushing_tds_pg * 6 +
    usage.receiving_tds_pg * 6
  );
}
