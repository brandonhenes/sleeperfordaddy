import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface SellCandidate {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  total_leagues: number;
  composite_tag: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
}

export interface BuyOpportunity {
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  rationale: string | null;
  confidence: number | null;
  owned_leagues: number;
  total_leagues: number;
}

// ─── Queries ───

/**
 * Sell candidates: players with TRENDING_DOWN / HIGH_EXPOSURE_RISK tags
 * or whose 30-day FC trend is < -200.
 */
export async function getSellCandidates(
  username: string
): Promise<SellCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      pe.player_name,
      pe.position,
      pe.team,
      pe.league_count::int AS league_count,
      pe.total_leagues::int AS total_leagues,
      pe.composite_tag,
      fc.dynasty_value::int AS dynasty_value,
      fc.trend_30day::int AS trend_30day
    FROM player_exposure pe
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pe.player_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE LOWER(pe.username) = LOWER(${username})
      AND (
        pe.composite_tag IN ('TRENDING_DOWN', 'HIGH_EXPOSURE_RISK')
        OR fc.trend_30day < -200
      )
    ORDER BY fc.trend_30day ASC NULLS LAST
  `);
  return rows as unknown as SellCandidate[];
}

/**
 * Buy opportunities: recommendations with direction = 'BUY', cross-referenced
 * with player_exposure to show how many leagues the user already owns them in.
 * Players owned in 0 or few leagues are the best opportunities.
 */
export async function getBuyOpportunities(
  username: string
): Promise<BuyOpportunity[]> {
  const rows = await db.execute(sql`
    SELECT
      r.player_name,
      r.direction,
      r.position,
      r.team,
      r.fc_at_rec,
      r.rationale,
      r.confidence,
      COALESCE(pe.league_count, 0)::int AS owned_leagues,
      COALESCE(pe.total_leagues,
        (SELECT MAX(total_leagues) FROM player_exposure
         WHERE LOWER(username) = LOWER(${username}))
      )::int AS total_leagues
    FROM recommendations r
    LEFT JOIN player_exposure pe
      ON LOWER(r.player_name) = LOWER(pe.player_name)
      AND LOWER(pe.username) = LOWER(${username})
    WHERE r.direction = 'BUY'
      AND r.rec_date = (SELECT MAX(rec_date) FROM recommendations)
    ORDER BY COALESCE(pe.league_count, 0) ASC, r.fc_at_rec DESC NULLS LAST
  `);
  return rows as unknown as BuyOpportunity[];
}
