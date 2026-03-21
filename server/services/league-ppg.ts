import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { type LeagueScoringSettings } from "./scoring-adjustment.js";

export interface PlayerPPG {
  sleeper_id: string;
  ppg: number;
  games_played: number;
}

export async function computeLeaguePPG(
  playerIds: string[],
  scoring: LeagueScoringSettings
): Promise<Map<string, PlayerPPG>> {
  if (playerIds.length === 0) return new Map();

  const seasonRows = await db.execute(sql`
    SELECT MAX(season) AS latest FROM player_seasonal_stats
  `);
  const latestSeason = (seasonRows as unknown as { latest: number | null }[])[0]?.latest;
  if (!latestSeason) return new Map();

  const frags = playerIds.map((id) => sql`${id}`);
  const inClause = sql.join(frags, sql`, `);

  const rows = await db.execute(sql`
    SELECT s.sleeper_id, s.games_played,
           s.receptions_pg, s.carries_pg,
           s.passing_tds_pg, s.rushing_tds_pg, s.receiving_tds_pg,
           s.passing_yds_pg, s.rushing_yds_pg, s.receiving_yds_pg,
           pm.position
    FROM player_seasonal_stats s
    JOIN players_master pm ON pm.player_id = s.sleeper_id
    WHERE s.sleeper_id IN (${inClause}) AND s.season = ${latestSeason}
  `);

  type Row = {
    sleeper_id: string;
    games_played: number;
    receptions_pg: number;
    carries_pg: number;
    passing_tds_pg: number;
    rushing_tds_pg: number;
    receiving_tds_pg: number;
    passing_yds_pg: number;
    rushing_yds_pg: number;
    receiving_yds_pg: number;
    position: string;
  };

  const result = new Map<string, PlayerPPG>();
  for (const r of rows as unknown as Row[]) {
    const ppg =
      r.receptions_pg * scoring.ppr +
      (r.position === "TE" ? r.receptions_pg * scoring.te_premium : 0) +
      r.carries_pg * scoring.carry_bonus +
      r.passing_tds_pg * scoring.pass_td +
      r.rushing_tds_pg * 6 +
      r.receiving_tds_pg * 6 +
      r.passing_yds_pg * scoring.pass_yd +
      r.rushing_yds_pg * scoring.rush_yd +
      r.receiving_yds_pg * scoring.rec_yd;

    result.set(r.sleeper_id, {
      sleeper_id: r.sleeper_id,
      ppg: Math.round(ppg * 100) / 100,
      games_played: r.games_played,
    });
  }

  return result;
}
