import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

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
  current_value: number | null;
  rationale: string | null;
  confidence: number | null;
  owned_leagues: number;
  total_leagues: number;
}

interface ExposureRow {
  player_name: string;
  position: string | null;
  team: string | null;
  league_count: number;
  dynasty_value: number | null;
  trend_30day: number | null;
}

async function getUserExposure(username: string): Promise<{ totalLeagues: number; rows: ExposureRow[] }> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return { totalLeagues: 0, rows: [] };

  const leagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (leagueIds.length === 0) return { totalLeagues: 0, rows: [] };
  const leagueFrags = leagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(leagueFrags, sql`, `);

  const rows = await db.execute(sql`
    SELECT
      pm.full_name AS player_name,
      pm.position,
      pm.team,
      COUNT(DISTINCT rp.league_id)::int AS league_count,
      fc.dynasty_value::int AS dynasty_value,
      fc.trend_30day::int AS trend_30day
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pm.full_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE rp.owner_id = ${userId}
      AND rp.league_id IN (${inClause})
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
    GROUP BY pm.full_name, pm.position, pm.team, fc.dynasty_value, fc.trend_30day
  `);

  return {
    totalLeagues: leagueIds.length,
    rows: rows as unknown as ExposureRow[],
  };
}

// ─── Queries ───

/**
 * Sell candidates: players with TRENDING_DOWN / HIGH_EXPOSURE_RISK tags
 * or whose 30-day FC trend is < -200.
 */
export async function getSellCandidates(
  username: string
): Promise<SellCandidate[]> {
  const { totalLeagues, rows } = await getUserExposure(username);
  if (totalLeagues === 0) return [];

  return rows
    .map((r) => {
      const exposurePct = totalLeagues > 0 ? r.league_count / totalLeagues : 0;
      let compositeTag: string | null = null;
      if ((r.trend_30day ?? 0) < -200 && exposurePct > 0.33) compositeTag = "HIGH_EXPOSURE_RISK";
      else if ((r.trend_30day ?? 0) < -200) compositeTag = "TRENDING_DOWN";
      else if (exposurePct > 0.33) compositeTag = "HIGH_EXPOSURE_RISK";
      return {
        player_name: r.player_name,
        position: r.position,
        team: r.team,
        league_count: r.league_count,
        total_leagues: totalLeagues,
        composite_tag: compositeTag,
        dynasty_value: r.dynasty_value,
        trend_30day: r.trend_30day,
      };
    })
    .filter((r) => r.composite_tag != null || (r.trend_30day ?? 0) < -200)
    .sort((a, b) => (a.trend_30day ?? 0) - (b.trend_30day ?? 0));
}

/**
 * Buy opportunities: recommendations with direction = 'BUY', cross-referenced
 * with player_exposure to show how many leagues the user already owns them in.
 * Players owned in 0 or few leagues are the best opportunities.
 */
export async function getBuyOpportunities(
  username: string
): Promise<BuyOpportunity[]> {
  const { totalLeagues, rows: exposureRows } = await getUserExposure(username);
  const ownedMap = new Map(
    exposureRows.map((r) => [r.player_name.toLowerCase(), r.league_count])
  );

  const rows = await db.execute(sql`
    SELECT
      r.player_name,
      r.direction,
      COALESCE(r.position, fc.position) AS position,
      COALESCE(r.team, fc.team) AS team,
      r.fc_at_rec,
      fc.dynasty_value::int AS current_value,
      r.rationale,
      r.confidence
    FROM recommendations r
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(r.player_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE r.direction = 'BUY'
      AND r.rec_date = (SELECT MAX(rec_date) FROM recommendations)
    ORDER BY r.fc_at_rec DESC NULLS LAST
  `);

  return (rows as unknown as Omit<BuyOpportunity, "owned_leagues" | "total_leagues">[])
    .map((r) => ({
      ...r,
      owned_leagues: ownedMap.get(r.player_name.toLowerCase()) ?? 0,
      total_leagues: totalLeagues,
    }))
    .sort((a, b) => a.owned_leagues - b.owned_leagues || (b.fc_at_rec ?? 0) - (a.fc_at_rec ?? 0));
}
