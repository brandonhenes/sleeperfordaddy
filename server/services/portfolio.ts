import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export type PortfolioPlayer = {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
  [key: string]: unknown;
};

export interface PortfolioStats {
  weighted_value: number;
  avg_value_per_league: number;
  high_exposure_count: number;
  total_leagues: number;
}

export interface PortfolioData {
  players: PortfolioPlayer[];
  stats: PortfolioStats;
}

/**
 * Get portfolio data: player exposure joined with FantasyCalc values.
 * Computes weighted portfolio value and high-exposure count.
 */
export async function getPortfolio(
  username: string
): Promise<PortfolioData | null> {
  const rows = await db.execute<PortfolioPlayer>(sql`
    SELECT
      pe.player_name,
      pe.position,
      pe.team,
      pe.league_count::int AS league_count,
      pe.total_leagues::int AS total_leagues,
      pe.composite_tag,
      fc.dynasty_value::int AS dynasty_value,
      fc.trend_30day::int AS trend_30day,
      fc.overall_rank::int AS overall_rank
    FROM player_exposure pe
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pe.player_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE LOWER(pe.username) = LOWER(${username})
    ORDER BY pe.league_count DESC
  `);

  if (rows.length === 0) return null;

  const players = rows as PortfolioPlayer[];

  // Compute aggregate stats
  let weightedValue = 0;
  let highExposureCount = 0;
  let totalLeagues = 0;

  for (const p of players) {
    const val = p.dynasty_value ?? 0;
    weightedValue += val * p.league_count;

    if (p.total_leagues > 0 && p.league_count / p.total_leagues > 0.25) {
      highExposureCount++;
    }

    if (p.total_leagues > totalLeagues) {
      totalLeagues = p.total_leagues;
    }
  }

  const avgPerLeague = totalLeagues > 0
    ? Math.round(weightedValue / totalLeagues)
    : 0;

  return {
    players,
    stats: {
      weighted_value: weightedValue,
      avg_value_per_league: avgPerLeague,
      high_exposure_count: highExposureCount,
      total_leagues: totalLeagues,
    },
  };
}
