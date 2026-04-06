import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";

const router = Router();

interface UserRow {
  user_id: string;
}

function joinValues(values: Array<string | number>) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

async function getUserId(username: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT user_id
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `);

  return (rows as unknown as UserRow[])[0]?.user_id ?? null;
}

async function getAssetsForTrades(
  tradeIds: string[],
  leagueIds: string[]
) {
  if (tradeIds.length === 0 || leagueIds.length === 0) {
    return [];
  }

  const tradeIdSql = joinValues(tradeIds);
  const leagueIdSql = joinValues(leagueIds);

  const rows = await db.execute(sql`
    SELECT
      ta.trade_id,
      ta.league_id,
      ta.roster_id::int AS roster_id,
      ta.direction,
      ta.asset_type,
      ta.asset_key,
      ta.asset_name,
      pm.full_name AS player_name,
      pm.position,
      pm.team,
      ldr.player_name AS drafted_player_name,
      ldr.position AS drafted_position
    FROM trade_assets ta
    LEFT JOIN players_master pm
      ON pm.player_id = ta.asset_key
     AND ta.asset_type = 'player'
    LEFT JOIN LATERAL (
      SELECT dr.player_name, dr.position
      FROM league_draft_results dr
      JOIN league_chain lc_trade ON lc_trade.league_id = ta.league_id
      JOIN league_chain lc_draft ON lc_draft.root_id = lc_trade.root_id AND lc_draft.league_id = dr.league_id
      LEFT JOIN draft_traded_picks dtp ON dtp.league_id = dr.league_id
        AND dtp.season = split_part(ta.asset_key, '_', 1)
        AND dtp.round = split_part(ta.asset_key, '_', 2)::int
        AND dtp.original_owner_id = split_part(ta.asset_key, '_', 3)::int
      WHERE dr.season = split_part(ta.asset_key, '_', 1)
        AND dr.round = split_part(ta.asset_key, '_', 2)::int
        AND dr.roster_id = COALESCE(dtp.current_owner_id, split_part(ta.asset_key, '_', 3)::int)
      LIMIT 1
    ) ldr ON ta.asset_type = 'pick'
    WHERE ta.trade_id IN (${tradeIdSql})
      AND ta.league_id IN (${leagueIdSql})
      AND ta.asset_type IN ('player', 'pick')
    ORDER BY ta.trade_id DESC, ta.roster_id ASC, ta.direction ASC, ta.asset_name ASC NULLS LAST
  `);

  return rows;
}

async function getRosterDisplayRows(leagueIds: string[]) {
  if (leagueIds.length === 0) {
    return [];
  }

  const leagueIdSql = joinValues(leagueIds);
  const rows = await db.execute(sql`
    SELECT
      r.league_id,
      r.roster_id::int AS roster_id,
      r.owner_id,
      COALESCE(
        NULLIF(BTRIM(lu.team_name), ''),
        NULLIF(BTRIM(lu.display_name), ''),
        NULLIF(BTRIM(u.display_name), ''),
        NULLIF(BTRIM(u.username), ''),
        r.owner_id,
        'Roster ' || r.roster_id::text
      ) AS display_name
    FROM rosters r
    LEFT JOIN league_users lu
      ON lu.league_id = r.league_id
     AND lu.user_id = r.owner_id
    LEFT JOIN users u
      ON u.user_id = r.owner_id
    WHERE r.league_id IN (${leagueIdSql})
    ORDER BY r.league_id ASC, r.roster_id ASC
  `);

  return rows;
}

router.get("/user/:username", async (req, res) => {
  try {
    const username = req.params.username?.trim();
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const userId = await getUserId(username);
    if (!userId) {
      return res.json({ outcomes: [], assets: [], rosters: [] });
    }

    const outcomeRows = await db.execute(sql`
      SELECT
        t.id::int AS id,
        t.trade_id,
        t.league_id,
        l.name AS league_name,
        t.roster_id::int AS roster_id,
        t.counterparty_roster_id::int AS counterparty_roster_id,
        t.value_gave_at_trade::real AS value_gave_at_trade,
        t.value_received_at_trade::real AS value_received_at_trade,
        t.value_gave_current::real AS value_gave_current,
        t.value_received_current::real AS value_received_current,
        t.value_delta_pct::real AS value_delta_pct,
        t.value_verdict,
        t.wins_with_trade::real AS wins_with_trade,
        t.wins_without_trade::real AS wins_without_trade,
        t.win_impact::real AS win_impact,
        t.median_weeks_with::real AS median_weeks_with,
        t.median_weeks_without::real AS median_weeks_without,
        t.median_impact::real AS median_impact,
        t.points_received_assets::real AS points_received_assets,
        t.points_gave_assets::real AS points_gave_assets,
        t.starter_rate_pct::real AS starter_rate_pct,
        t.trade_date::text AS trade_date,
        t.seasons_graded::int AS seasons_graded,
        t.is_final,
        t.graded_through_date::text AS graded_through_date,
        t.value_source,
        t.scoring_adjusted
      FROM trade_outcomes t
      JOIN leagues l
        ON l.league_id = t.league_id
      JOIN rosters r
        ON r.league_id = t.league_id
       AND r.roster_id = t.roster_id
      WHERE r.owner_id = ${userId}
      ORDER BY t.trade_date DESC, t.trade_id DESC, t.roster_id ASC, t.counterparty_roster_id ASC
    `);

    const outcomes = outcomeRows as unknown as Array<{ trade_id: string; league_id: string }>;
    if (outcomes.length === 0) {
      return res.json({ outcomes: [], assets: [], rosters: [] });
    }

    const tradeIds = [...new Set(outcomes.map((row) => row.trade_id))];
    const leagueIds = [...new Set(outcomes.map((row) => row.league_id))];

    const [assets, rosters] = await Promise.all([
      getAssetsForTrades(tradeIds, leagueIds),
      getRosterDisplayRows(leagueIds),
    ]);

    res.json({
      outcomes: outcomeRows,
      assets,
      rosters,
    });
  } catch (error) {
    console.error("[trade-intelligence/user] Error:", error);
    res.status(500).json({ message: "Failed to fetch user trade intelligence" });
  }
});

router.get("/:leagueId/trade/:tradeId", async (req, res) => {
  try {
    const { leagueId, tradeId } = req.params;
    if (!leagueId || !tradeId) {
      return res.status(400).json({ message: "leagueId and tradeId are required" });
    }

    const outcomeRows = await db.execute(sql`
      SELECT
        t.id::int AS id,
        t.trade_id,
        t.league_id,
        l.name AS league_name,
        t.roster_id::int AS roster_id,
        t.counterparty_roster_id::int AS counterparty_roster_id,
        t.value_gave_at_trade::real AS value_gave_at_trade,
        t.value_received_at_trade::real AS value_received_at_trade,
        t.value_gave_current::real AS value_gave_current,
        t.value_received_current::real AS value_received_current,
        t.value_delta_pct::real AS value_delta_pct,
        t.value_verdict,
        t.wins_with_trade::real AS wins_with_trade,
        t.wins_without_trade::real AS wins_without_trade,
        t.win_impact::real AS win_impact,
        t.median_weeks_with::real AS median_weeks_with,
        t.median_weeks_without::real AS median_weeks_without,
        t.median_impact::real AS median_impact,
        t.points_received_assets::real AS points_received_assets,
        t.points_gave_assets::real AS points_gave_assets,
        t.starter_rate_pct::real AS starter_rate_pct,
        t.trade_date::text AS trade_date,
        t.seasons_graded::int AS seasons_graded,
        t.is_final,
        t.graded_through_date::text AS graded_through_date,
        t.value_source,
        t.scoring_adjusted
      FROM trade_outcomes t
      JOIN leagues l
        ON l.league_id = t.league_id
      WHERE t.league_id = ${leagueId}
        AND t.trade_id = ${tradeId}
      ORDER BY t.roster_id ASC, t.counterparty_roster_id ASC
    `);

    const outcomes = outcomeRows as unknown as Array<{ id: number }>;
    const outcomeIds = outcomes.map((row) => row.id);

    let seasons: unknown[] = [];
    if (outcomeIds.length > 0) {
      const outcomeIdSql = joinValues(outcomeIds);
      seasons = await db.execute(sql`
        SELECT
          trade_outcome_id::int AS trade_outcome_id,
          season_number::int AS season_number,
          season_year::int AS season_year,
          wins_with::real AS wins_with,
          wins_without::real AS wins_without,
          win_impact::real AS win_impact,
          median_with::real AS median_with,
          median_without::real AS median_without,
          points_received::real AS points_received,
          points_gave::real AS points_gave,
          value_delta_pct::real AS value_delta_pct,
          COALESCE(key_assets_received, '[]'::jsonb) AS key_assets_received,
          COALESCE(key_assets_gave, '[]'::jsonb) AS key_assets_gave
        FROM trade_outcome_seasons
        WHERE trade_outcome_id IN (${outcomeIdSql})
        ORDER BY season_year ASC, season_number ASC
      `);
    }

    const assets = await getAssetsForTrades([tradeId], [leagueId]);

    res.json({
      outcomes: outcomeRows,
      seasons,
      assets,
    });
  } catch (error) {
    console.error("[trade-intelligence/trade] Error:", error);
    res.status(500).json({ message: "Failed to fetch trade detail" });
  }
});

router.get("/:leagueId/leaderboard", async (req, res) => {
  try {
    const { leagueId } = req.params;
    if (!leagueId) {
      return res.status(400).json({ message: "leagueId is required" });
    }

    const profiles = await db.execute(sql`
      SELECT
        league_id,
        roster_id::int AS roster_id,
        owner_id,
        display_name,
        total_trades::int AS total_trades,
        trade_win_rate_value::real AS trade_win_rate_value,
        trade_win_rate_impact::real AS trade_win_rate_impact,
        cumulative_win_impact::real AS cumulative_win_impact,
        cumulative_value_delta::real AS cumulative_value_delta,
        avg_acquired_age::real AS avg_acquired_age,
        youth_vet_bias,
        top_positions_acquired,
        trades_per_season::real AS trades_per_season,
        most_common_partner_roster_id::int AS most_common_partner_roster_id,
        soft_target_score::real AS soft_target_score,
        best_trade_id,
        best_trade_summary,
        worst_trade_id,
        worst_trade_summary
      FROM owner_tendency_profiles
      WHERE league_id = ${leagueId}
      ORDER BY trade_win_rate_impact DESC, cumulative_win_impact DESC, total_trades DESC
    `);

    res.json({ profiles });
  } catch (error) {
    console.error("[trade-intelligence/leaderboard] Error:", error);
    res.status(500).json({ message: "Failed to fetch trade leaderboard" });
  }
});

router.get("/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    if (!leagueId) {
      return res.status(400).json({ message: "leagueId is required" });
    }

    const outcomeRows = await db.execute(sql`
      SELECT
        t.id::int AS id,
        t.trade_id,
        t.league_id,
        l.name AS league_name,
        t.roster_id::int AS roster_id,
        t.counterparty_roster_id::int AS counterparty_roster_id,
        t.value_gave_at_trade::real AS value_gave_at_trade,
        t.value_received_at_trade::real AS value_received_at_trade,
        t.value_gave_current::real AS value_gave_current,
        t.value_received_current::real AS value_received_current,
        t.value_delta_pct::real AS value_delta_pct,
        t.value_verdict,
        t.wins_with_trade::real AS wins_with_trade,
        t.wins_without_trade::real AS wins_without_trade,
        t.win_impact::real AS win_impact,
        t.median_weeks_with::real AS median_weeks_with,
        t.median_weeks_without::real AS median_weeks_without,
        t.median_impact::real AS median_impact,
        t.points_received_assets::real AS points_received_assets,
        t.points_gave_assets::real AS points_gave_assets,
        t.starter_rate_pct::real AS starter_rate_pct,
        t.trade_date::text AS trade_date,
        t.seasons_graded::int AS seasons_graded,
        t.is_final,
        t.graded_through_date::text AS graded_through_date,
        t.value_source,
        t.scoring_adjusted
      FROM trade_outcomes t
      JOIN leagues l
        ON l.league_id = t.league_id
      WHERE t.league_id = ${leagueId}
      ORDER BY t.trade_date DESC, t.trade_id DESC, t.roster_id ASC, t.counterparty_roster_id ASC
    `);

    const outcomes = outcomeRows as unknown as Array<{ trade_id: string; league_id: string }>;
    if (outcomes.length === 0) {
      return res.json({ outcomes: [], assets: [], rosters: [] });
    }

    const tradeIds = [...new Set(outcomes.map((row) => row.trade_id))];
    const [assets, rosters] = await Promise.all([
      getAssetsForTrades(tradeIds, [leagueId]),
      getRosterDisplayRows([leagueId]),
    ]);

    res.json({
      outcomes: outcomeRows,
      assets,
      rosters,
    });
  } catch (error) {
    console.error("[trade-intelligence/league] Error:", error);
    res.status(500).json({ message: "Failed to fetch league trade intelligence" });
  }
});

export default router;
