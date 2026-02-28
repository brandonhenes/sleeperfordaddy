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
  rationale: string | null;
  confidence: number | null;
}

export interface Prospect {
  player_name: string;
  position: string | null;
  school: string | null;
  tier: string | null;
  fantasypros_rank: number | null;
  consensus_comp: string | null;
  key_strengths: string[] | null;
  total_mentions: number | null;
  last_update_summary: string | null;
  age: number | null;
  notes: string | null;
}

export interface Mover {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number;
  delta: number;
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
    SELECT id, rec_date, player_name, direction, position, team,
           fc_at_rec, rationale, confidence
    FROM recommendations
    ORDER BY rec_date DESC, confidence DESC NULLS LAST
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
      p26.fantasypros_rank,
      p26.age,
      p26.notes,
      pp.consensus_comp,
      pp.key_strengths,
      pp.total_mentions,
      pp.last_update_summary
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
           (t.dynasty_value - p.dynasty_value)::int AS delta
    FROM today t
    JOIN past p ON t.player_name = p.player_name
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
