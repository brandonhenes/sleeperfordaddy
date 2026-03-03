import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getAgeCurveStatus } from "./age-curves.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

// ─── Types ───

export interface PortfolioPlayer {
  player_id: string;
  full_name: string;
  position: string;
  age: number | null;
  edge_score: number;
  fc_value: number | null;
  ktc_value: number | null;
  fp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  fp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  leagues_owned: number;
  total_leagues: number;
  pct: number;
  age_zone: string | null;
}

export interface PortfolioStats {
  total_players: number;
  total_leagues: number;
  avg_edge_score: number;
  high_exposure_count: number;
  position_counts: { position: string; count: number; avg_score: number }[];
}

export interface PortfolioData {
  players: PortfolioPlayer[];
  stats: PortfolioStats;
}

// ─── Main ───

export async function getPortfolio(username: string): Promise<PortfolioData | null> {
  // Resolve user_id
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return null;

  const leagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (leagueIds.length === 0) return null;
  const totalLeagues = leagueIds.length;

  // Get all players on user's rosters across all leagues
  const idFrags = leagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(idFrags, sql`, `);
  const rosterRows = await db.execute(sql`
    SELECT rp.player_id, pm.full_name, pm.position, pm.age, rp.league_id
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${inClause})
      AND rp.owner_id = ${userId}
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);
  type RR = { player_id: string; full_name: string; position: string; age: number | null; league_id: string };
  const rows = rosterRows as unknown as RR[];
  if (rows.length === 0) return null;

  // Count leagues per player
  const leagueCountMap = new Map<string, number>();
  const playerInfoMap = new Map<string, { full_name: string; position: string; age: number | null }>();
  for (const r of rows) {
    leagueCountMap.set(r.player_id, (leagueCountMap.get(r.player_id) ?? 0) + 1);
    if (!playerInfoMap.has(r.player_id)) {
      playerInfoMap.set(r.player_id, { full_name: r.full_name, position: r.position, age: r.age });
    }
  }

  // Get Edge Scores for all unique players (SF mode for universal)
  const playerIds = [...playerInfoMap.keys()];
  const compMap = await getCompositeValues(playerIds, "sf");

  // Build output
  const players: PortfolioPlayer[] = [];
  for (const [pid, info] of playerInfoMap) {
    const comp = compMap.get(pid);
    const leaguesOwned = leagueCountMap.get(pid) ?? 0;
    const ac = getAgeCurveStatus(info.position, info.age);
    players.push({
      player_id: pid,
      full_name: info.full_name,
      position: info.position,
      age: info.age,
      edge_score: comp?.edge_score ?? 0,
      fc_value: comp?.fc_value ?? null,
      ktc_value: comp?.ktc_value ?? null,
      fp_value: comp?.dp_value ?? null,
      fc_score: comp?.fc_score ?? null,
      ktc_score: comp?.ktc_score ?? null,
      fp_score: comp?.dp_score ?? null,
      sources_available: comp?.sources_available ?? 0,
      source_agreement: comp?.source_agreement ?? "high",
      leagues_owned: leaguesOwned,
      total_leagues: totalLeagues,
      pct: Math.round((leaguesOwned / totalLeagues) * 100),
      age_zone: ac.zone !== "Unknown" ? ac.zone : null,
    });
  }

  // Sort by leagues_owned desc, then edge_score desc
  players.sort((a, b) => b.leagues_owned - a.leagues_owned || b.edge_score - a.edge_score);

  // Stats
  const scored = players.filter((p) => p.edge_score > 0);
  const avgEdge = scored.length > 0
    ? Math.round((scored.reduce((s, p) => s + p.edge_score, 0) / scored.length) * 10) / 10
    : 0;
  const highExposure = players.filter((p) => p.pct > 25).length;

  // Position breakdown
  const posMap = new Map<string, { count: number; total: number }>();
  for (const p of players) {
    const entry = posMap.get(p.position) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += p.edge_score;
    posMap.set(p.position, entry);
  }
  const posOrder = ["QB", "RB", "WR", "TE"];
  const positionCounts = posOrder
    .filter((pos) => posMap.has(pos))
    .map((pos) => {
      const e = posMap.get(pos)!;
      return { position: pos, count: e.count, avg_score: Math.round((e.total / e.count) * 10) / 10 };
    });

  return {
    players,
    stats: {
      total_players: players.length,
      total_leagues: totalLeagues,
      avg_edge_score: avgEdge,
      high_exposure_count: highExposure,
      position_counts: positionCounts,
    },
  };
}
