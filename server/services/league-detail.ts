import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeagueById } from "../db/queries/leagues.js";

// ─── Types ───

export interface LeagueInfo {
  league_id: string;
  name: string;
  season: number;
  total_rosters: number | null;
  status: string;
}

export interface StandingsEntry {
  owner_id: string;
  display_name: string | null;
  team_name: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_against: number;
}

export interface RosterPlayer {
  player_name: string | null;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
}

export interface TradeEntry {
  transaction_id: string;
  created_at: number;
  sides: TradeSide[];
}

export interface TradeSide {
  roster_id: number;
  display_name: string | null;
  gave: string[];
  received: string[];
}

export interface LeagueDetailData {
  league: LeagueInfo;
  standings: StandingsEntry[];
  roster: RosterPlayer[];
  recent_trades: TradeEntry[];
}

const RECENT_TRADES_LIMIT = 5;

/**
 * Get league detail: standings, user's roster with values, and recent trades.
 */
export async function getLeagueDetail(
  leagueId: string,
  userId: string
): Promise<LeagueDetailData | null> {
  const league = await getLeagueById(leagueId);
  if (!league) return null;

  const [standingsRows, rosterRows, tradeAssetRows] = await Promise.all([
    // Standings: rosters joined with league_users for display names
    db.execute(sql`
      SELECT
        r.owner_id,
        lu.display_name,
        lu.team_name,
        COALESCE(r.wins, 0)::int AS wins,
        COALESCE(r.losses, 0)::int AS losses,
        COALESCE(r.ties, 0)::int AS ties,
        COALESCE(r.fpts, 0)::real AS fpts,
        COALESCE(r.fpts_against, 0)::real AS fpts_against
      FROM rosters r
      LEFT JOIN league_users lu ON r.league_id = lu.league_id AND r.owner_id = lu.user_id
      WHERE r.league_id = ${leagueId}
      ORDER BY r.wins DESC, r.fpts DESC
    `),

    // User's roster: players with dynasty values
    db.execute(sql`
      SELECT
        pm.full_name AS player_name,
        pm.position,
        pm.team,
        fc.dynasty_value::int AS dynasty_value
      FROM roster_players rp
      JOIN players_master pm ON rp.player_id = pm.player_id
      LEFT JOIN fantasycalc_daily fc
        ON fc.sleeper_id = pm.player_id
        AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
      WHERE rp.league_id = ${leagueId}
        AND rp.owner_id = ${userId}
      ORDER BY COALESCE(fc.dynasty_value, 0) DESC
    `),

    // Recent trades with asset details
    db.execute(sql`
      SELECT
        ta.trade_id AS transaction_id,
        ta.created_at_ms AS created_at,
        ta.roster_id,
        lu.display_name,
        ta.asset_name,
        ta.direction
      FROM trade_assets ta
      LEFT JOIN league_users lu ON ta.league_id = lu.league_id AND ta.roster_id::text = lu.user_id
      WHERE ta.league_id = ${leagueId}
        AND ta.trade_id IN (
          SELECT DISTINCT t.transaction_id FROM trades t
          WHERE t.league_id = ${leagueId}
          ORDER BY t.created_at DESC
          LIMIT ${RECENT_TRADES_LIMIT}
        )
      ORDER BY ta.created_at_ms DESC
    `),
  ]);

  // Group trade assets into trade entries with sides
  const tradeMap = new Map<string, TradeEntry>();
  for (const row of tradeAssetRows as unknown as {
    transaction_id: string;
    created_at: number;
    roster_id: number;
    display_name: string | null;
    asset_name: string | null;
    direction: string;
  }[]) {
    let trade = tradeMap.get(row.transaction_id);
    if (!trade) {
      trade = { transaction_id: row.transaction_id, created_at: row.created_at, sides: [] };
      tradeMap.set(row.transaction_id, trade);
    }
    let side = trade.sides.find((s) => s.roster_id === row.roster_id);
    if (!side) {
      side = { roster_id: row.roster_id, display_name: row.display_name, gave: [], received: [] };
      trade.sides.push(side);
    }
    const name = row.asset_name ?? row.transaction_id;
    if (row.direction === "gave") side.gave.push(name);
    else side.received.push(name);
  }

  return {
    league: {
      league_id: league.league_id,
      name: league.name,
      season: league.season,
      total_rosters: league.total_rosters,
      status: league.status,
    },
    standings: standingsRows as unknown as StandingsEntry[],
    roster: rosterRows as unknown as RosterPlayer[],
    recent_trades: Array.from(tradeMap.values()),
  };
}
