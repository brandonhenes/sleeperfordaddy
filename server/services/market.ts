import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type { Prospect, Recommendation, Signal } from "../../shared/types.js";

// ─── Types ───

export interface Mover {
  player_id: string;
  player_name: string;
  position: string | null;
  team: string | null;
  edge_score: number;
  previous_edge: number;
  edge_delta: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  prev_fc_score: number | null;
  prev_ktc_score: number | null;
  prev_dp_score: number | null;
}

export interface MoversData {
  risers: Mover[];
  fallers: Mover[];
}

// ─── Queries ───

export async function getRecommendations(): Promise<Recommendation[]> {
  const rows = await db.execute(sql`
    SELECT r.id, r.rec_date, r.player_name, r.direction,
           COALESCE(r.position, fc.position) AS position,
           COALESCE(r.team, fc.team) AS team,
           r.fc_at_rec, fc.dynasty_value::int AS current_value,
           ktc.value_sf::int AS ktc_value,
           dp.value_2qb::int AS fp_value,
           r.rationale, r.confidence
    FROM recommendations r
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(r.player_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    LEFT JOIN ktc_values ktc ON LOWER(ktc.player_name) = LOWER(r.player_name)
    LEFT JOIN dynastyprocess_values dp ON LOWER(dp.player_name) = LOWER(r.player_name)
    ORDER BY r.rec_date DESC, r.confidence DESC NULLS LAST
  `);
  return rows as unknown as Recommendation[];
}

export async function getProspects(): Promise<Prospect[]> {
  const rows = await db.execute(sql`
    SELECT
      pp.player_name,
      pp.position,
      pp.school,
      UPPER(pp.tier) AS tier,
      ROW_NUMBER() OVER (
        ORDER BY
          pp.consensus_adp_rank ASC NULLS LAST,
          pp.pff_rank ASC NULLS LAST,
          pp.player_name ASC
      )::int AS fp_rank,
      ROW_NUMBER() OVER (
        ORDER BY
          pp.consensus_adp_rank ASC NULLS LAST,
          pp.pff_rank ASC NULLS LAST,
          pp.player_name ASC
      )::int AS fantasypros_rank,
      pp.age,
      pp.notes,
      pp.consensus_comp,
      pp.all_comps,
      pp.key_strengths,
      pp.key_concerns,
      pp.scouting_notes,
      pp.fp_scouting_notes,
      pp.total_mentions,
      pp.last_update_summary,
      pp.height,
      pp.weight,
      pp.draft_capital,
      pp.landing_spot,
      pp.current_adp,
      pp.combine_40,
      pp.combine_vertical,
      pp.combine_shuttle,
      pp.combine_bench,
      pp.pff_rank,
      pp.pff_grade_2025,
      pp.pff_grade_2024,
      pp.pff_waa_2025,
      pp.dolittle_score,
      pp.dolittle_games,
      pp.dolittle_confidence,
      pp.consensus_adp,
      pp.consensus_adp_rank,
      pp.nfl_team,
      pp.nfl_pick,
      pp.status,
      pp.last_updated::text AS last_updated,
      pp.zone_route_pff::text AS zone_route_pff,
      pp.man_route_pff::text AS man_route_pff,
      pp.slot_rate::text AS slot_rate,
      pp.outside_rate::text AS outside_rate,
      pp.disagreement_flag
    FROM prospect_profiles pp
    ORDER BY
      pp.consensus_adp_rank ASC NULLS LAST,
      pp.pff_rank ASC NULLS LAST,
      pp.player_name ASC
  `);
  return rows as unknown as Prospect[];
}

export async function getMovers(days: number = 7): Promise<MoversData> {
  void days;

  const dateRows = await db.execute(sql`
    SELECT DISTINCT snapshot_date
    FROM edge_score_history
    ORDER BY snapshot_date DESC
    LIMIT 2
  `);
  const dates = (dateRows as unknown as { snapshot_date: string }[]).map(
    (r) => r.snapshot_date
  );
  if (dates.length < 2) return { risers: [], fallers: [] };

  const [currentDate, previousDate] = dates;

  const rows = await db.execute(sql`
    SELECT
      h1.player_id,
      pm.full_name AS player_name,
      pm.position,
      pm.team,
      ROUND(h1.edge_score::numeric, 1)::real AS edge_score,
      ROUND(h2.edge_score::numeric, 1)::real AS previous_edge,
      ROUND((h1.edge_score - h2.edge_score)::numeric, 1)::real AS edge_delta,
      ROUND(h1.fc_score::numeric, 1)::real AS fc_score,
      ROUND(h1.ktc_score::numeric, 1)::real AS ktc_score,
      ROUND(h1.fp_score::numeric, 1)::real AS dp_score,
      ROUND(h2.fc_score::numeric, 1)::real AS prev_fc_score,
      ROUND(h2.ktc_score::numeric, 1)::real AS prev_ktc_score,
      ROUND(h2.fp_score::numeric, 1)::real AS prev_dp_score
    FROM edge_score_history h1
    JOIN edge_score_history h2
      ON h1.player_id = h2.player_id
      AND h2.snapshot_date = ${previousDate}
    JOIN players_master pm ON h1.player_id = pm.player_id
    WHERE h1.snapshot_date = ${currentDate}
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND ABS(h1.edge_score - h2.edge_score) >= 1
    ORDER BY (h1.edge_score - h2.edge_score) DESC
  `);

  const all = rows as unknown as Mover[];
  return {
    risers: all.filter((r) => r.edge_delta > 0).slice(0, 25),
    fallers: all
      .filter((r) => r.edge_delta < 0)
      .sort((a, b) => a.edge_delta - b.edge_delta)
      .slice(0, 25),
  };
}

export async function getSignals(): Promise<Signal[]> {
  const rows = await db.execute(sql`
    SELECT player_name, position, team,
           add_count::int, drop_count::int,
           rank_adds::int, rank_drops::int,
           signal_date
    FROM daily_signals
    WHERE signal_date = (SELECT MAX(signal_date) FROM daily_signals)
    ORDER BY add_count DESC NULLS LAST
  `);
  return rows as unknown as Signal[];
}
