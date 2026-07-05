import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type { HitRateData, HitRateRow } from "../../shared/types.js";

export async function getDraftHitRates(): Promise<HitRateData> {
  const rows = await db.execute(sql`
    WITH hits AS (
      SELECT *,
        CASE
          WHEN position = 'QB' AND games_played >= 30 AND pass_yards >= 3000 THEN true
          WHEN position = 'RB' AND games_played >= 20 AND rush_yards >= 1500 THEN true
          WHEN position = 'WR' AND games_played >= 30 AND rec_yards >= 2000 THEN true
          WHEN position = 'TE' AND games_played >= 25 AND rec_yards >= 1000 THEN true
          ELSE false
        END AS is_hit,
        CASE
          WHEN pick <= 6 THEN '1-6'
          WHEN pick <= 12 THEN '7-12'
          WHEN pick <= 20 THEN '13-20'
          WHEN pick <= 32 THEN '21-32'
          WHEN pick <= 64 THEN 'Rd 2'
          WHEN pick <= 100 THEN 'Rd 3'
          ELSE 'Rd 4+'
        END AS slot_range
      FROM nfl_draft_picks
      WHERE season <= 2023
        AND season >= 2015
    )
    SELECT
      position,
      round,
      slot_range,
      COUNT(*)::int AS total_drafted,
      COUNT(*) FILTER (WHERE is_hit)::int AS hits,
      ROUND(100.0 * COUNT(*) FILTER (WHERE is_hit) / NULLIF(COUNT(*), 0), 1) AS hit_rate_pct,
      ROUND(AVG(games_played), 0) AS avg_games,
      ROUND(AVG(career_av), 0) AS avg_career_av,
      ARRAY_AGG(DISTINCT player_name) FILTER (WHERE is_hit AND career_av >= 30) AS notable_hits,
      ARRAY_AGG(DISTINCT player_name) FILTER (WHERE NOT is_hit AND round = 1 AND career_av < 10) AS notable_busts
    FROM hits
    GROUP BY position, round, slot_range
    ORDER BY position, round, slot_range
  `);

  type Row = {
    position: string;
    round: number;
    slot_range: string;
    total_drafted: number;
    hits: number;
    hit_rate_pct: number;
    avg_games: number;
    avg_career_av: number;
    notable_hits: string[] | null;
    notable_busts: string[] | null;
  };
  const rawRows = rows as unknown as Row[];

  const byPosRound: HitRateRow[] = [];
  const posRoundMap = new Map<string, Row[]>();
  for (const r of rawRows) {
    const key = `${r.position}|${r.round}`;
    const arr = posRoundMap.get(key) ?? [];
    arr.push(r);
    posRoundMap.set(key, arr);
  }
  for (const [key, group] of posRoundMap) {
    const [pos, round] = key.split("|");
    const total = group.reduce((s, r) => s + Number(r.total_drafted), 0);
    const hits = group.reduce((s, r) => s + Number(r.hits), 0);
    const avgGames = Math.round(
      group.reduce((s, r) => s + Number(r.avg_games) * Number(r.total_drafted), 0) / total,
    );
    const avgAV = Math.round(
      group.reduce((s, r) => s + Number(r.avg_career_av) * Number(r.total_drafted), 0) / total,
    );

    byPosRound.push({
      position: pos,
      round: Number(round),
      pick_range: `Round ${round}`,
      total_drafted: total,
      hits,
      hit_rate_pct: total > 0 ? Math.round((hits / total) * 1000) / 10 : 0,
      avg_games: avgGames,
      avg_career_av: avgAV,
      notable_hits: group.flatMap((r) => r.notable_hits ?? []).slice(0, 5),
      notable_busts: group.flatMap((r) => r.notable_busts ?? []).slice(0, 3),
    });
  }

  const bySlot: HitRateRow[] = rawRows.map((r) => ({
    position: r.position,
    round: r.round,
    pick_range: r.slot_range,
    total_drafted: Number(r.total_drafted),
    hits: Number(r.hits),
    hit_rate_pct: Number(r.hit_rate_pct),
    avg_games: Number(r.avg_games),
    avg_career_av: Number(r.avg_career_av),
    notable_hits: (r.notable_hits ?? []).slice(0, 5),
    notable_busts: (r.notable_busts ?? []).slice(0, 3),
  }));

  const roundMap = new Map<number, { hits: number; total: number }>();
  for (const r of rawRows) {
    const cur = roundMap.get(r.round) ?? { hits: 0, total: 0 };
    cur.hits += Number(r.hits);
    cur.total += Number(r.total_drafted);
    roundMap.set(r.round, cur);
  }
  const overallByRound = [...roundMap.entries()]
    .map(([round, data]) => ({
      round,
      hit_rate: data.total > 0 ? Math.round((data.hits / data.total) * 1000) / 10 : 0,
      total: data.total,
    }))
    .sort((a, b) => a.round - b.round);

  return {
    by_position_round: byPosRound,
    by_slot_range: bySlot,
    overall_by_round: overallByRound,
  };
}
