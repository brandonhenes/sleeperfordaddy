import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface Recommendation {
  id: number;
  rec_date: string;
  player_name: string;
  direction: string;
  position: string | null;
  team: string | null;
  fc_at_rec: number | null;
  current_value: number | null;
  ktc_value: number | null;
  fp_value: number | null;
  rationale: string | null;
  confidence: number | null;
}

export interface ProspectComp {
  comp: string;
  date: string;
  source: string;
}

export interface Prospect {
  player_name: string;
  position: string | null;
  school: string | null;
  tier: string | null;
  fp_rank: number | null;
  fantasypros_rank: number | null;
  consensus_comp: string | null;
  all_comps: ProspectComp[] | null;
  key_strengths: string[] | null;
  key_concerns: string[] | null;
  scouting_notes: string | null;
  fp_scouting_notes: string | null;
  total_mentions: number | null;
  last_update_summary: string | null;
  age: number | null;
  notes: string | null;
  height: string | null;
  weight: string | null;
  draft_capital: string | null;
  landing_spot: string | null;
  current_adp: string | null;
  combine_40: string | null;
  combine_vertical: string | null;
  combine_shuttle: string | null;
  combine_bench: string | null;
}

export interface Mover {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number;
  delta: number;
  ktc_value: number | null;
  fp_value: number | null;
}

export interface MoversData {
  risers: Mover[];
  fallers: Mover[];
}

export interface Signal {
  player_name: string;
  position: string | null;
  team: string | null;
  add_count: number;
  drop_count: number;
  rank_adds: number | null;
  rank_drops: number | null;
  signal_date: string;
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
      p26.player_name,
      p26.position,
      p26.school,
      p26.tier,
      p26.fantasypros_rank AS fp_rank,
      p26.fantasypros_rank,
      p26.age,
      p26.notes,
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
      pp.combine_bench
    FROM prospects_2026 p26
    LEFT JOIN prospect_profiles pp
      ON LOWER(p26.player_name) = LOWER(pp.player_name)
    ORDER BY p26.fantasypros_rank ASC NULLS LAST
  `);
  return rows as unknown as Prospect[];
}

export async function getMovers(days: number = 7): Promise<MoversData> {
  const rows = await db.execute(sql`
    WITH today AS (
      SELECT player_name, position, team, dynasty_value
      FROM fantasycalc_daily
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        AND is_pick = false
    ),
    past AS (
      SELECT player_name, dynasty_value
      FROM fantasycalc_daily
      WHERE snapshot_date = (
        SELECT MAX(snapshot_date) FROM fantasycalc_daily
      ) - CAST(${days} AS int) * INTERVAL '1 day'
    )
    SELECT t.player_name, t.position, t.team,
           t.dynasty_value::int AS dynasty_value,
           (t.dynasty_value - p.dynasty_value)::int AS delta,
           ktc.value_sf::int AS ktc_value,
           dp.value_2qb::int AS fp_value
    FROM today t
    JOIN past p ON t.player_name = p.player_name
    LEFT JOIN ktc_values ktc ON LOWER(ktc.player_name) = LOWER(t.player_name)
    LEFT JOIN dynastyprocess_values dp ON LOWER(dp.player_name) = LOWER(t.player_name)
    WHERE ABS(t.dynasty_value - p.dynasty_value) > 50
    ORDER BY (t.dynasty_value - p.dynasty_value) DESC
  `);

  const all = rows as unknown as Mover[];
  return {
    risers: all.filter((r) => r.delta > 0),
    fallers: all.filter((r) => r.delta < 0).reverse(),
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
