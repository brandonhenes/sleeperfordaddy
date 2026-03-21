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

export async function syncSleeperStats(
  season = 2025
): Promise<{ season: number; players_synced: number }> {
  const resp = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}`);
  if (!resp.ok) throw new Error(`Sleeper stats fetch failed: ${resp.status}`);
  const payload = (await resp.json()) as Record<string, SleeperStatRow>;

  const players = await db.execute(sql`
    SELECT player_id, position
    FROM players_master
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
  `);
  const validPlayers = new Set(
    (players as unknown as { player_id: string }[]).map((r) => r.player_id)
  );

  const values: {
    sleeper_id: string;
    season: number;
    games_played: number;
    receptions_pg: number;
    targets_pg: number;
    carries_pg: number;
    passing_tds_pg: number;
    rushing_tds_pg: number;
    receiving_tds_pg: number;
    passing_yds_pg: number;
    rushing_yds_pg: number;
    receiving_yds_pg: number;
    passing_attempts_pg: number;
    total_receptions: number;
    total_carries: number;
    total_passing_tds: number;
    total_rushing_tds: number;
    total_receiving_tds: number;
  }[] = [];

  const round = (value: number) => Math.round(value * 100) / 100;

  for (const [sleeperId, stats] of Object.entries(payload)) {
    const gp = Number(stats.gp ?? 0);
    if (gp < 1 || !validPlayers.has(sleeperId)) continue;

    const rec = Number(stats.rec ?? 0);
    const recTgt = Number(stats.rec_tgt ?? 0);
    const rushAtt = Number(stats.rush_att ?? 0);
    const passTd = Number(stats.pass_td ?? 0);
    const rushTd = Number(stats.rush_td ?? 0);
    const recTd = Number(stats.rec_td ?? 0);
    const passYd = Number(stats.pass_yd ?? 0);
    const rushYd = Number(stats.rush_yd ?? 0);
    const recYd = Number(stats.rec_yd ?? 0);
    const passAtt = Number(stats.pass_att ?? 0);

    values.push({
      sleeper_id: sleeperId,
      season,
      games_played: gp,
      receptions_pg: round(rec / gp),
      targets_pg: round(recTgt / gp),
      carries_pg: round(rushAtt / gp),
      passing_tds_pg: round(passTd / gp),
      rushing_tds_pg: round(rushTd / gp),
      receiving_tds_pg: round(recTd / gp),
      passing_yds_pg: round(passYd / gp),
      rushing_yds_pg: round(rushYd / gp),
      receiving_yds_pg: round(recYd / gp),
      passing_attempts_pg: round(passAtt / gp),
      total_receptions: rec,
      total_carries: rushAtt,
      total_passing_tds: passTd,
      total_rushing_tds: rushTd,
      total_receiving_tds: recTd,
    });
  }

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

  return { season, players_synced: values.length };
}
