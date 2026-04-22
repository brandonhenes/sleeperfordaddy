import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

interface SleeperStatRow {
  gp?: number;
  pass_yd?: number;
  pass_td?: number;
  pass_att?: number;
  rush_yd?: number;
  rush_td?: number;
  rush_att?: number;
  rec?: number;
  rec_yd?: number;
  rec_td?: number;
  rec_tgt?: number;
}

// Weeks 1-17 are the "meaningful" regular-season weeks. Week 18 is excluded
// because starters frequently rest with playoff seeding locked, which skews
// per-game averages for the players we care about in dynasty valuation.
const WEEKS_INCLUDED = Array.from({ length: 17 }, (_, i) => i + 1); // [1..17]

const STAT_KEYS = [
  "pass_yd", "pass_td", "pass_att",
  "rush_yd", "rush_td", "rush_att",
  "rec", "rec_yd", "rec_td", "rec_tgt",
] as const;
type StatKey = (typeof STAT_KEYS)[number];

// A player "played" a given week if they have ANY of these measurable activities.
// Using non-zero presence rather than a `gp` field because Sleeper's weekly
// response doesn't always include gp at the per-week level.
function didPlay(row: SleeperStatRow): boolean {
  for (const key of STAT_KEYS) {
    const v = Number(row[key] ?? 0);
    if (v !== 0) return true;
  }
  return false;
}

async function fetchWeek(season: number, week: number): Promise<Record<string, SleeperStatRow>> {
  const resp = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`);
  if (!resp.ok) {
    console.warn(`[sleeper-stats] week ${week} fetch failed: ${resp.status}`);
    return {};
  }
  return (await resp.json()) as Record<string, SleeperStatRow>;
}

export async function syncSleeperStats(
  season = 2025
): Promise<{ season: number; players_synced: number; weekly_rows_written: number; weeks_included: number[] }> {
  // Pull each week in parallel. Failures per-week are logged and skipped.
  const weeklyPayloads = await Promise.all(
    WEEKS_INCLUDED.map((week) => fetchWeek(season, week))
  );

  const players = await db.execute(sql`
    SELECT player_id
    FROM players_master
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
  `);
  const validPlayers = new Set(
    (players as unknown as { player_id: string }[]).map((r) => r.player_id)
  );

  // Step 1: persist raw weekly stats as jsonb so every Sleeper stat key is
  // captured (first downs, 2pt, threshold bonuses, distance buckets, etc.)
  // without needing schema changes.
  let weeklyRowsWritten = 0;
  const WEEKLY_BATCH = 500;
  for (let weekIdx = 0; weekIdx < weeklyPayloads.length; weekIdx++) {
    const week = WEEKS_INCLUDED[weekIdx];
    const payload = weeklyPayloads[weekIdx];
    const weeklyRows: { sleeper_id: string; week: number; stats: SleeperStatRow }[] = [];
    for (const [sleeperId, row] of Object.entries(payload)) {
      if (!validPlayers.has(sleeperId)) continue;
      if (!didPlay(row)) continue;
      weeklyRows.push({ sleeper_id: sleeperId, week, stats: row });
    }
    for (let i = 0; i < weeklyRows.length; i += WEEKLY_BATCH) {
      const chunk = weeklyRows.slice(i, i + WEEKLY_BATCH);
      const frags = chunk.map(
        (r) => sql`(${r.sleeper_id}, ${season}, ${r.week}, ${JSON.stringify(r.stats)}::jsonb)`
      );
      await db.execute(sql`
        INSERT INTO player_weekly_stats (sleeper_id, season, week, stats)
        VALUES ${sql.join(frags, sql`, `)}
        ON CONFLICT (sleeper_id, season, week) DO UPDATE SET
          stats = EXCLUDED.stats,
          updated_at = NOW()
      `);
      weeklyRowsWritten += chunk.length;
    }
  }

  // Per-player aggregate, only counting weeks where they actually played.
  interface Agg {
    gp: number;
    pass_yd: number; pass_td: number; pass_att: number;
    rush_yd: number; rush_td: number; rush_att: number;
    rec: number; rec_yd: number; rec_td: number; rec_tgt: number;
  }
  const emptyAgg = (): Agg => ({
    gp: 0,
    pass_yd: 0, pass_td: 0, pass_att: 0,
    rush_yd: 0, rush_td: 0, rush_att: 0,
    rec: 0, rec_yd: 0, rec_td: 0, rec_tgt: 0,
  });

  const aggs = new Map<string, Agg>();

  for (const weekly of weeklyPayloads) {
    for (const [sleeperId, row] of Object.entries(weekly)) {
      if (!validPlayers.has(sleeperId)) continue;
      if (!didPlay(row)) continue;

      let a = aggs.get(sleeperId);
      if (!a) {
        a = emptyAgg();
        aggs.set(sleeperId, a);
      }
      a.gp += 1;
      a.pass_yd += Number(row.pass_yd ?? 0);
      a.pass_td += Number(row.pass_td ?? 0);
      a.pass_att += Number(row.pass_att ?? 0);
      a.rush_yd += Number(row.rush_yd ?? 0);
      a.rush_td += Number(row.rush_td ?? 0);
      a.rush_att += Number(row.rush_att ?? 0);
      a.rec += Number(row.rec ?? 0);
      a.rec_yd += Number(row.rec_yd ?? 0);
      a.rec_td += Number(row.rec_td ?? 0);
      a.rec_tgt += Number(row.rec_tgt ?? 0);
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;

  const values = [...aggs.entries()].map(([sleeperId, a]) => ({
    sleeper_id: sleeperId,
    season,
    games_played: a.gp,
    receptions_pg: round(a.rec / a.gp),
    targets_pg: round(a.rec_tgt / a.gp),
    carries_pg: round(a.rush_att / a.gp),
    passing_tds_pg: round(a.pass_td / a.gp),
    rushing_tds_pg: round(a.rush_td / a.gp),
    receiving_tds_pg: round(a.rec_td / a.gp),
    passing_yds_pg: round(a.pass_yd / a.gp),
    rushing_yds_pg: round(a.rush_yd / a.gp),
    receiving_yds_pg: round(a.rec_yd / a.gp),
    passing_attempts_pg: round(a.pass_att / a.gp),
    total_receptions: a.rec,
    total_carries: a.rush_att,
    total_passing_tds: a.pass_td,
    total_rushing_tds: a.rush_td,
    total_receiving_tds: a.rec_td,
  }));

  const BATCH_SIZE = 500;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const chunk = values.slice(i, i + BATCH_SIZE);
    const frags = chunk.map(
      (v) => sql`(
        ${v.sleeper_id}, ${v.season}, ${v.games_played},
        ${v.receptions_pg}, ${v.targets_pg}, ${v.carries_pg},
        ${v.passing_tds_pg}, ${v.rushing_tds_pg}, ${v.receiving_tds_pg},
        ${v.passing_yds_pg}, ${v.rushing_yds_pg}, ${v.receiving_yds_pg},
        ${v.passing_attempts_pg},
        ${v.total_receptions}, ${v.total_carries},
        ${v.total_passing_tds}, ${v.total_rushing_tds}, ${v.total_receiving_tds}
      )`
    );
    await db.execute(sql`
      INSERT INTO player_seasonal_stats (
        sleeper_id, season, games_played,
        receptions_pg, targets_pg, carries_pg,
        passing_tds_pg, rushing_tds_pg, receiving_tds_pg,
        passing_yds_pg, rushing_yds_pg, receiving_yds_pg,
        passing_attempts_pg,
        total_receptions, total_carries,
        total_passing_tds, total_rushing_tds, total_receiving_tds
      ) VALUES ${sql.join(frags, sql`, `)}
      ON CONFLICT (sleeper_id, season) DO UPDATE SET
        games_played = EXCLUDED.games_played,
        receptions_pg = EXCLUDED.receptions_pg,
        targets_pg = EXCLUDED.targets_pg,
        carries_pg = EXCLUDED.carries_pg,
        passing_tds_pg = EXCLUDED.passing_tds_pg,
        rushing_tds_pg = EXCLUDED.rushing_tds_pg,
        receiving_tds_pg = EXCLUDED.receiving_tds_pg,
        passing_yds_pg = EXCLUDED.passing_yds_pg,
        rushing_yds_pg = EXCLUDED.rushing_yds_pg,
        receiving_yds_pg = EXCLUDED.receiving_yds_pg,
        passing_attempts_pg = EXCLUDED.passing_attempts_pg,
        total_receptions = EXCLUDED.total_receptions,
        total_carries = EXCLUDED.total_carries,
        total_passing_tds = EXCLUDED.total_passing_tds,
        total_rushing_tds = EXCLUDED.total_rushing_tds,
        total_receiving_tds = EXCLUDED.total_receiving_tds
    `);
  }

  return {
    season,
    players_synced: values.length,
    weekly_rows_written: weeklyRowsWritten,
    weeks_included: WEEKS_INCLUDED,
  };
}
