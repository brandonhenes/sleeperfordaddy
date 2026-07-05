import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getAgeCurveStatus } from "./age-curves.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";
import { sourceWeightsKey, type SourceWeights } from "./edge-score.js";
import {
  getPlayerAvailability,
  contributesToPortfolioValue,
} from "../../shared/player-availability.js";
import type { PortfolioData, PortfolioPlayer } from "../../shared/types.js";

const PORTFOLIO_TTL_MS = 30_000;
const portfolioCache = new Map<string, { data: PortfolioData | null; expires: number }>();
const portfolioInFlight = new Map<string, Promise<PortfolioData | null>>();

export function clearPortfolioCache(username?: string) {
  if (username) {
    const prefix = `${username.toLowerCase()}:`;
    for (const key of portfolioCache.keys()) {
      if (key.startsWith(prefix)) portfolioCache.delete(key);
    }
    for (const key of portfolioInFlight.keys()) {
      if (key.startsWith(prefix)) portfolioInFlight.delete(key);
    }
    return;
  }
  portfolioCache.clear();
  portfolioInFlight.clear();
}

export async function getPortfolio(
  username: string,
  weights?: SourceWeights
): Promise<PortfolioData | null> {
  const cacheKey = `${username.toLowerCase()}:${sourceWeightsKey(weights)}`;
  const now = Date.now();
  const hit = portfolioCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.data;

  const pending = portfolioInFlight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
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
    SELECT rp.player_id, pm.full_name, pm.position, pm.age, pm.team, pm.status, rp.league_id,
      EXISTS (
        SELECT 1 FROM fantasycalc_daily fc
        WHERE fc.sleeper_id = rp.player_id
          AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
          AND fc.is_pick = false
          AND UPPER(fc.team) IN ('FA', 'FREE AGENT')
      ) OR EXISTS (
        SELECT 1 FROM dynastyprocess_values dp
        WHERE dp.sleeper_id = rp.player_id
          AND dp.is_pick = false
          AND UPPER(dp.team) IN ('FA', 'FREE AGENT')
      ) AS external_flags_fa
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${inClause})
      AND rp.owner_id = ${userId}
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);
  type RR = {
    player_id: string;
    full_name: string;
    position: string;
    age: number | null;
    team: string | null;
    status: string | null;
    league_id: string;
    external_flags_fa: boolean;
  };
  const rows = rosterRows as unknown as RR[];
  if (rows.length === 0) return null;

  // Count leagues per player
  const leagueCountMap = new Map<string, number>();
  const playerInfoMap = new Map<
    string,
    {
      full_name: string;
      position: string;
      age: number | null;
      team: string | null;
      status: string | null;
      external_flags_fa: boolean;
    }
  >();
  for (const r of rows) {
    leagueCountMap.set(r.player_id, (leagueCountMap.get(r.player_id) ?? 0) + 1);
    if (!playerInfoMap.has(r.player_id)) {
      playerInfoMap.set(r.player_id, {
        full_name: r.full_name,
        position: r.position,
        age: r.age,
        team: r.team,
        status: r.status,
        external_flags_fa: r.external_flags_fa,
      });
    }
  }

  // Get Edge Scores for all unique players (SF mode for universal)
  const playerIds = [...playerInfoMap.keys()];
  const compMap = await getCompositeValues(playerIds, "sf", weights);

  // Build output
  const players: PortfolioPlayer[] = [];
  for (const [pid, info] of playerInfoMap) {
    const comp = compMap.get(pid);
    const leaguesOwned = leagueCountMap.get(pid) ?? 0;
    const ac = getAgeCurveStatus(info.position, info.age);
    const availability = getPlayerAvailability({
      status: info.status,
      team: info.team,
      sources_available: comp?.sources_available ?? 0,
      external_flags_fa: info.external_flags_fa,
    });
    const expertScores = [comp?.fc_score, comp?.dp_score].filter(
      (s): s is number => s != null,
    );
    const ktcScore = comp?.ktc_score ?? null;
    let ktcVsExperts: number | null = null;
    let disagreementDirection: "sell_signal" | "buy_signal" | "neutral" | null = null;

    if (ktcScore != null && expertScores.length > 0) {
      const expertAvg = expertScores.reduce((a, b) => a + b, 0) / expertScores.length;
      ktcVsExperts = ktcScore - expertAvg;
      if (ktcVsExperts >= 6) disagreementDirection = "sell_signal";
      else if (ktcVsExperts <= -6) disagreementDirection = "buy_signal";
      else disagreementDirection = "neutral";
    }

    const portfolioValue = contributesToPortfolioValue(availability)
      ? (comp?.edge_score ?? 0) * leaguesOwned
      : 0;
    let actionNeeded: { type: "risk" | "dead_weight"; reason: string } | null = null;

    const ageZone = ac.zone;
    const isAging = ageZone === "Cliff" || ageZone === "Decline";
    const isCrowdOvervalues = ktcVsExperts != null && ktcVsExperts >= 6;
    const isExpertsStillHigh = (comp?.edge_score ?? 0) >= 75;
    const isLowAgreement = (comp?.source_agreement ?? "high") === "low";
    const isHighExposure = Math.round((leaguesOwned / totalLeagues) * 100) > 25;
    const isDeadWeight = (comp?.edge_score ?? 0) < 50 && leaguesOwned >= 2;

    if (isAging && isCrowdOvervalues && !isExpertsStillHigh) {
      actionNeeded = {
        type: "risk",
        reason: `${ageZone} age curve, crowd overvalues by ${Math.round(ktcVsExperts!)}pts`,
      };
    } else if (isLowAgreement && isCrowdOvervalues && isHighExposure) {
      actionNeeded = {
        type: "risk",
        reason: `Sources disagree, crowd overvalues, ${Math.round((leaguesOwned / totalLeagues) * 100)}% exposure`,
      };
    } else if (isDeadWeight) {
      actionNeeded = {
        type: "dead_weight",
        reason: `Edge ${comp?.edge_score ?? 0} across ${leaguesOwned} leagues`,
      };
    }

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
      ktc_vs_experts: ktcVsExperts,
      disagreement_direction: disagreementDirection,
      action_needed: actionNeeded,
      portfolio_value: portfolioValue,
      availability,
      team: info.team,
      status: info.status,
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

  const portfolioValueTotal = players.reduce((s, p) => s + p.portfolio_value, 0);
  const ageWeightedSum = players.reduce((s, p) => {
    if (p.age == null || p.portfolio_value === 0) return s;
    return s + p.age * p.portfolio_value;
  }, 0);
  const ageWeightTotal = players.reduce((s, p) => {
    if (p.age == null || p.portfolio_value === 0) return s;
    return s + p.portfolio_value;
  }, 0);
  const weightedAvgAge = ageWeightTotal > 0
    ? Math.round((ageWeightedSum / ageWeightTotal) * 10) / 10
    : 0;

  const fullCoverage = players.filter((p) => p.sources_available >= 3).length;
  const sourceCoveragePct = players.length > 0
    ? Math.round((fullCoverage / players.length) * 100)
    : 0;

  return {
    players,
    stats: {
      total_players: players.length,
      total_leagues: totalLeagues,
      avg_edge_score: avgEdge,
      high_exposure_count: highExposure,
      position_counts: positionCounts,
      portfolio_value_total: portfolioValueTotal,
      weighted_avg_age: weightedAvgAge,
      source_coverage_pct: sourceCoveragePct,
    },
  };
  })();

  portfolioInFlight.set(cacheKey, work);
  try {
    const data = await work;
    portfolioCache.set(cacheKey, { data, expires: Date.now() + PORTFOLIO_TTL_MS });
    return data;
  } finally {
    portfolioInFlight.delete(cacheKey);
  }
}
