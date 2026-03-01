import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface DashboardStats {
  portfolio_value: number;
  league_count: number;
  unique_players: number;
  open_recs: number;
}

export interface DashboardRec {
  id: number;
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  current_value: number | null;
  rationale: string | null;
}

export interface ExposureAlert {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
}

export interface LeagueSummary {
  league_id: string;
  name: string;
  total_rosters: number | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
}

export interface DashboardData {
  stats: DashboardStats;
  top_recs: DashboardRec[];
  exposure_alerts: ExposureAlert[];
  leagues: LeagueSummary[];
}

/**
 * Combined dashboard payload — one call, all sections.
 */
export async function getDashboard(
  username: string
): Promise<DashboardData | null> {
  // Resolve user_id from username
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return null;

  // Run all queries in parallel
  const [statsRows, recRows, alertRows, leagueRows] = await Promise.all([
    // Stats: portfolio value + unique players from player_exposure, league count, open recs
    db.execute(sql`
      SELECT
        COALESCE(SUM(fc.dynasty_value * pe.league_count), 0)::int AS portfolio_value,
        COUNT(DISTINCT pe.player_name)::int AS unique_players,
        MAX(pe.total_leagues)::int AS league_count,
        (SELECT COUNT(*)::int FROM recommendations
         WHERE rec_date = (SELECT MAX(rec_date) FROM recommendations)) AS open_recs
      FROM player_exposure pe
      LEFT JOIN fantasycalc_daily fc
        ON LOWER(pe.player_name) = LOWER(fc.player_name)
        AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      WHERE LOWER(pe.username) = LOWER(${username})
    `),

    // Top 3 recommendations
    db.execute(sql`
      SELECT r.id, r.player_name, r.direction,
             COALESCE(r.position, fc.position) AS position,
             COALESCE(r.team, fc.team) AS team,
             r.fc_at_rec, fc.dynasty_value::int AS current_value, r.rationale
      FROM recommendations r
      LEFT JOIN fantasycalc_daily fc
        ON LOWER(r.player_name) = LOWER(fc.player_name)
        AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      WHERE r.rec_date = (SELECT MAX(rec_date) FROM recommendations)
      ORDER BY r.confidence DESC NULLS LAST
      LIMIT 3
    `),

    // Exposure alerts: players in 7+ leagues
    db.execute(sql`
      SELECT
        pe.player_name, pe.position, pe.team,
        pe.league_count::int AS league_count,
        pe.total_leagues::int AS total_leagues,
        pe.composite_tag,
        fc.dynasty_value::int AS dynasty_value
      FROM player_exposure pe
      LEFT JOIN fantasycalc_daily fc
        ON LOWER(pe.player_name) = LOWER(fc.player_name)
        AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      WHERE LOWER(pe.username) = LOWER(${username})
        AND pe.league_count >= 7
      ORDER BY pe.league_count DESC
      LIMIT 4
    `),

    // Leagues with roster record — most recent season per league name only
    db.execute(sql`
      SELECT DISTINCT ON (l.name)
        l.league_id, l.name, l.total_rosters,
        COALESCE(r.wins, 0)::int AS wins,
        COALESCE(r.losses, 0)::int AS losses,
        COALESCE(r.ties, 0)::int AS ties,
        COALESCE(r.fpts, 0)::real AS fpts
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      LEFT JOIN rosters r ON l.league_id = r.league_id AND r.owner_id = ${userId}
      WHERE ul.user_id = ${userId}
      ORDER BY l.name ASC, l.season DESC
    `),
  ]);

  const stats = (statsRows as unknown as DashboardStats[])[0] ?? {
    portfolio_value: 0,
    league_count: 0,
    unique_players: 0,
    open_recs: 0,
  };

  const leagues = leagueRows as unknown as LeagueSummary[];

  // Derive league_count from the deduplicated list so the stat card matches
  stats.league_count = leagues.length;

  return {
    stats,
    top_recs: recRows as unknown as DashboardRec[],
    exposure_alerts: alertRows as unknown as ExposureAlert[],
    leagues,
  };
}
