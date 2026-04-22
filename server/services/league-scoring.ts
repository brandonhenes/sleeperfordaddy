import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

/**
 * Compute per-game fantasy points for a player in a specific league's scoring.
 *
 * Handles every offensive scoring key that appears in Sleeper league settings:
 *   Direct: pass_yd/td/int/2pt/cmp/inc/sack/att/fd, rush_yd/td/2pt/att/fd/40p/td_40p/td_50p,
 *           rec/rec_yd/rec_td/rec_2pt/rec_tgt/rec_fd/rec_40p/rec_td_40p/rec_td_50p,
 *           pass_cmp_40p, pass_td_40p, pass_td_50p, pass_int_td,
 *           fum, fum_lost, rec_0_4, rec_5_9, rec_10_19, rec_20_29, rec_30_39
 *   Position-specific: bonus_rec_te, bonus_rec_rb, bonus_rec_wr,
 *                      bonus_fd_qb, bonus_fd_rb, bonus_fd_wr, bonus_fd_te
 *   Per-game thresholds: bonus_pass_yd_300/400, bonus_pass_cmp_25,
 *                        bonus_rush_yd_100/200, bonus_rush_att_20,
 *                        bonus_rec_yd_100/200, bonus_rush_rec_yd_100/200
 *
 * Threshold bonuses REQUIRE per-week data (a 100-yard receiving bonus in one
 * week is not equivalent to 100+ yards across the season). That's why this
 * function operates on the weekly rows, not season aggregates.
 */

type ScoringSettings = Record<string, number>;
type WeeklyStatRow = Record<string, number>;

// Per-game threshold bonuses: (key → ({row, position}) → bool)
// If the predicate is true for a given week, the player earns the bonus that week.
const THRESHOLDS: Array<{
  key: string;
  test: (row: WeeklyStatRow) => boolean;
}> = [
  { key: "bonus_pass_yd_300", test: (r) => (r.pass_yd ?? 0) >= 300 },
  { key: "bonus_pass_yd_400", test: (r) => (r.pass_yd ?? 0) >= 400 },
  { key: "bonus_pass_cmp_25", test: (r) => (r.pass_cmp ?? 0) >= 25 },
  { key: "bonus_rush_yd_100", test: (r) => (r.rush_yd ?? 0) >= 100 },
  { key: "bonus_rush_yd_200", test: (r) => (r.rush_yd ?? 0) >= 200 },
  { key: "bonus_rush_att_20", test: (r) => (r.rush_att ?? 0) >= 20 },
  { key: "bonus_rec_yd_100", test: (r) => (r.rec_yd ?? 0) >= 100 },
  { key: "bonus_rec_yd_200", test: (r) => (r.rec_yd ?? 0) >= 200 },
  { key: "bonus_rush_rec_yd_100", test: (r) => ((r.rush_yd ?? 0) + (r.rec_yd ?? 0)) >= 100 },
  { key: "bonus_rush_rec_yd_200", test: (r) => ((r.rush_yd ?? 0) + (r.rec_yd ?? 0)) >= 200 },
];

// Scoring keys that map 1:1 to a stat field and multiply by volume.
// Every offensive-player key I've seen across 304 leagues is here.
const DIRECT_KEYS = [
  // Passing
  "pass_yd", "pass_td", "pass_int", "pass_2pt", "pass_cmp", "pass_inc",
  "pass_sack", "pass_att", "pass_fd", "pass_int_td",
  "pass_cmp_40p", "pass_td_40p", "pass_td_50p",
  // Rushing
  "rush_yd", "rush_td", "rush_2pt", "rush_att", "rush_fd",
  "rush_40p", "rush_td_40p", "rush_td_50p",
  // Receiving
  "rec", "rec_yd", "rec_td", "rec_2pt", "rec_tgt", "rec_fd",
  "rec_40p", "rec_td_40p", "rec_td_50p",
  // Distance buckets (receptions caught in N-yard range)
  "rec_0_4", "rec_5_9", "rec_10_19", "rec_20_29", "rec_30_39",
  // Turnovers (offensive side — can recover own fumble, incl. in endzone)
  "fum", "fum_lost", "fum_rec", "fum_rec_td", "fum_ret_yd",
  // Return yards/TDs (applicable to WR/RB return specialists)
  "kr_yd", "pr_yd", "kr_td", "pr_td",
] as const;

// Position-gated reception bonuses (bonus per reception for specific positions)
const POSITION_REC_BONUS: Record<string, string> = {
  QB: "", // no
  RB: "bonus_rec_rb",
  WR: "bonus_rec_wr",
  TE: "bonus_rec_te",
};

// Position-gated first-down bonuses (add to position's "own" first downs)
const POSITION_FD_BONUS_KEY: Record<string, string> = {
  QB: "bonus_fd_qb",
  RB: "bonus_fd_rb",
  WR: "bonus_fd_wr",
  TE: "bonus_fd_te",
};
const POSITION_FD_STAT_KEY: Record<string, string> = {
  QB: "pass_fd",
  RB: "rush_fd",
  WR: "rec_fd",
  TE: "rec_fd",
};

export interface LeagueScoringOutput {
  weeks_scored: number;        // count of weeks the player played
  total_points: number;        // summed over all weeks
  per_game_points: number;     // total / weeks_scored, or 0 if weeks_scored=0
  per_week_points: number[];   // points for each included week (in week order)
}

/**
 * Compute fantasy points for a player across an array of weekly stat rows.
 * Expects `weeklyRows` to be weeks you want to count (caller is responsible
 * for filtering — e.g., skip week 18, only include 2025, etc.).
 */
export function computeLeagueScoring(
  weeklyRows: WeeklyStatRow[],
  scoringSettings: ScoringSettings,
  position: string
): LeagueScoringOutput {
  if (weeklyRows.length === 0) {
    return { weeks_scored: 0, total_points: 0, per_game_points: 0, per_week_points: [] };
  }

  const perWeek: number[] = [];

  for (const row of weeklyRows) {
    let weekPts = 0;

    // Direct stat × coefficient
    for (const key of DIRECT_KEYS) {
      const coef = scoringSettings[key];
      if (!coef) continue;
      const value = Number(row[key] ?? 0);
      if (value === 0) continue;
      weekPts += value * coef;
    }

    // Position-gated reception bonus (e.g., TEP: bonus_rec_te × receptions if TE)
    const posBonusKey = POSITION_REC_BONUS[position];
    if (posBonusKey) {
      const coef = scoringSettings[posBonusKey];
      if (coef) {
        const receptions = Number(row.rec ?? 0);
        weekPts += receptions * coef;
      }
    }

    // Position-gated first-down bonus (bonus_fd_* × own first downs)
    const fdBonusKey = POSITION_FD_BONUS_KEY[position];
    const fdStatKey = POSITION_FD_STAT_KEY[position];
    if (fdBonusKey && fdStatKey) {
      const coef = scoringSettings[fdBonusKey];
      if (coef) {
        const fds = Number(row[fdStatKey] ?? 0);
        weekPts += fds * coef;
      }
    }

    // Per-game threshold bonuses
    for (const { key, test } of THRESHOLDS) {
      const coef = scoringSettings[key];
      if (!coef) continue;
      if (test(row)) weekPts += coef;
    }

    perWeek.push(Math.round(weekPts * 100) / 100);
  }

  const total = perWeek.reduce((s, p) => s + p, 0);
  return {
    weeks_scored: perWeek.length,
    total_points: Math.round(total * 100) / 100,
    per_game_points: perWeek.length > 0
      ? Math.round((total / perWeek.length) * 100) / 100
      : 0,
    per_week_points: perWeek,
  };
}

/**
 * Load weekly stat rows for a player's season from the DB and return the
 * raw stat rows ordered by week. Excludes week 18 by default.
 */
export async function loadPlayerWeeklyStats(
  sleeperId: string,
  season: number,
  options: { includeWeek18?: boolean } = {}
): Promise<WeeklyStatRow[]> {
  const rows = await db.execute(sql`
    SELECT week, stats FROM player_weekly_stats
    WHERE sleeper_id = ${sleeperId}
      AND season = ${season}
      ${options.includeWeek18 ? sql`` : sql`AND week != 18`}
    ORDER BY week ASC
  `);
  return (rows as unknown as { week: number; stats: WeeklyStatRow }[]).map((r) => r.stats);
}

/**
 * Batch version — loads weekly stats for many players at once.
 * Returns a Map<sleeper_id, weekly rows ordered by week>.
 */
export async function loadWeeklyStatsBatch(
  sleeperIds: string[],
  season: number,
  options: { includeWeek18?: boolean } = {}
): Promise<Map<string, WeeklyStatRow[]>> {
  if (sleeperIds.length === 0) return new Map();
  const idList = sql.join(sleeperIds.map((id) => sql`${id}`), sql`, `);
  const rows = await db.execute(sql`
    SELECT sleeper_id, week, stats FROM player_weekly_stats
    WHERE sleeper_id IN (${idList})
      AND season = ${season}
      ${options.includeWeek18 ? sql`` : sql`AND week != 18`}
    ORDER BY sleeper_id, week ASC
  `);
  const out = new Map<string, WeeklyStatRow[]>();
  for (const r of rows as unknown as { sleeper_id: string; week: number; stats: WeeklyStatRow }[]) {
    const existing = out.get(r.sleeper_id) ?? [];
    existing.push(r.stats);
    out.set(r.sleeper_id, existing);
  }
  return out;
}

/**
 * Convenience: compute points for a player in a specific league's scoring
 * for a specific season, pulling weekly stats + settings from the DB.
 */
export async function scorePlayerForLeague(
  sleeperId: string,
  position: string,
  leagueId: string,
  season: number
): Promise<LeagueScoringOutput | null> {
  const leagueRows = await db.execute(sql`
    SELECT scoring_settings FROM leagues WHERE league_id = ${leagueId} LIMIT 1
  `);
  const settings = (leagueRows as unknown as { scoring_settings: ScoringSettings }[])[0]?.scoring_settings;
  if (!settings) return null;

  const weekly = await loadPlayerWeeklyStats(sleeperId, season);
  return computeLeagueScoring(weekly, settings, position);
}

/**
 * Batch helper: score many players for one league in one pass.
 * Used by Power Rankings / Trade Calc to show raw season points on every row.
 * Returns Map<sleeper_id, { total_points, per_game_points, weeks_scored }>.
 */
export async function scorePlayersForLeague(
  players: { sleeper_id: string; position: string }[],
  scoringSettings: ScoringSettings,
  season: number,
  options: { includeWeek18?: boolean } = {}
): Promise<Map<string, { total_points: number; per_game_points: number; weeks_scored: number }>> {
  if (players.length === 0) return new Map();

  const ids = players.map((p) => p.sleeper_id);
  const weeklyMap = await loadWeeklyStatsBatch(ids, season, options);

  const out = new Map<string, { total_points: number; per_game_points: number; weeks_scored: number }>();
  for (const p of players) {
    const weekly = weeklyMap.get(p.sleeper_id) ?? [];
    const scored = computeLeagueScoring(weekly, scoringSettings, p.position);
    out.set(p.sleeper_id, {
      total_points: scored.total_points,
      per_game_points: scored.per_game_points,
      weeks_scored: scored.weeks_scored,
    });
  }
  return out;
}
