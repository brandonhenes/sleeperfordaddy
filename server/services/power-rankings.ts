import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import { classifyTeam, percentileRank } from "./archetypes.js";
import { getCompositeValues } from "./composite-values.js";

// ─── Types ───

export interface CoreAsset {
  player_id: string;
  full_name: string;
  position: string;
  edge_score: number;
  age: number | null;
  age_curve: AgeCurveStatus;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
}

export interface RosterRanking {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  starters_value: number;
  avg_starter_score: number;
  power_pct: number;
  draft_value: number;
  draft_pct: number;
  window_core_raw: number;
  window_core_pct: number;
  window_total_raw: number;
  window_total_pct: number;
  window_core_coverage_pct: number;
  window_total_coverage_pct: number;
  archetype: string;
  reasons: string[];
  core_assets: CoreAsset[];
  avg_sources_available: number;
}

export interface LeaguePowerRanking {
  league_id: string;
  league_name: string;
  mode: "sf" | "1qb";
  draft_data_available: boolean;
  rosters: RosterRanking[];
}

// ─── Helpers ───

function countStarterSlots(rosterPositions: string[]): number {
  const bench = new Set(["BN", "IR", "TAXI"]);
  return rosterPositions.filter((p) => !bench.has(p)).length;
}

function detectSF(rosterPositions: string[]): boolean {
  if (rosterPositions.includes("SUPER_FLEX")) return true;
  return rosterPositions.filter((p) => p === "QB").length >= 2;
}

function computeWindowRaw(
  players: { value: number; age_score: number }[]
): number {
  const valid = players.filter((p) => p.value > 0);
  const denom = valid.reduce((s, p) => s + p.value, 0);
  if (denom === 0) return 0;
  return valid.reduce((s, p) => s + p.value * p.age_score, 0) / denom;
}

// ─── Main ───

export async function getPowerRankings(
  username: string
): Promise<LeaguePowerRanking[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const leagueRows = await db.execute(sql`
    SELECT DISTINCT ON (l.name)
      l.league_id, l.name AS league_name, l.total_rosters
    FROM user_leagues ul
    JOIN leagues l ON ul.league_id = l.league_id
    WHERE ul.user_id = ${userId}
    ORDER BY l.name ASC, l.season DESC
  `);
  const leagues = leagueRows as unknown as {
    league_id: string; league_name: string; total_rosters: number;
  }[];
  if (leagues.length === 0) return [];

  const leagueIdFragments = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(leagueIdFragments, sql`, `);

  const rosterRows = await db.execute(sql`
    SELECT rp.league_id, rp.owner_id, rp.player_id,
           pm.full_name, pm.position, pm.age
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${inClause})
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);
  type RosterRow = {
    league_id: string; owner_id: string; player_id: string;
    full_name: string; position: string; age: number | null;
  };
  const rows = rosterRows as unknown as RosterRow[];

  const [rosterIdRows, nameRows] = await Promise.all([
    db.execute(sql`SELECT league_id, owner_id, roster_id FROM rosters WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, user_id, display_name FROM league_users WHERE league_id IN (${inClause})`),
  ]);
  const rosterIdMap = new Map<string, number>();
  for (const r of rosterIdRows as unknown as { league_id: string; owner_id: string; roster_id: number }[]) {
    rosterIdMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  }
  const nameMap = new Map<string, string>();
  for (const r of nameRows as unknown as { league_id: string; user_id: string; display_name: string | null }[]) {
    nameMap.set(`${r.league_id}:${r.user_id}`, r.display_name ?? r.user_id);
  }

  const nested: Record<string, Record<string, RosterRow[]>> = {};
  for (const r of rows) {
    nested[r.league_id] ??= {};
    nested[r.league_id][r.owner_id] ??= [];
    nested[r.league_id][r.owner_id].push(r);
  }

  const leagueSettingsMap = new Map<string, { sf: boolean; starterSlots: number }>();
  await Promise.all(
    leagues.map(async (l) => {
      try {
        const detail = await getLeague(l.league_id);
        if (detail?.roster_positions) {
          leagueSettingsMap.set(l.league_id, {
            sf: detectSF(detail.roster_positions),
            starterSlots: countStarterSlots(detail.roster_positions),
          });
        }
      } catch { /* fallback below */ }
    })
  );

  const results: LeaguePowerRanking[] = [];

  for (const league of leagues) {
    const lid = league.league_id;
    const leagueTeams = nested[lid] ?? {};
    const settings = leagueSettingsMap.get(lid) ?? { sf: false, starterSlots: 9 };
    const mode = settings.sf ? "sf" : "1qb";

    const leaguePlayerIds = Object.values(leagueTeams).flat().map((p) => p.player_id);
    const compositeMap = await getCompositeValues([...new Set(leaguePlayerIds)], mode);

    const rosterData = Object.entries(leagueTeams).map(([ownerId, players]) => {
      const withValue = players.map((p) => ({
        ...p,
        edgeScore: compositeMap.get(p.player_id)?.edge_score ?? 0,
        cv: compositeMap.get(p.player_id),
      }));
      const sorted = [...withValue].sort((a, b) => b.edgeScore - a.edgeScore);

      const starters = sorted.slice(0, settings.starterSlots);
      const startersValue = starters.reduce((s, p) => s + p.edgeScore, 0);
      const avgStarterScore = starters.length > 0
        ? Math.round((startersValue / starters.length) * 10) / 10 : 0;

      const withCurve = sorted.map((p) => ({
        ...p,
        age_curve: getAgeCurveStatus(p.position, p.age),
      }));

      const coreSize = Math.min(12, settings.starterSlots + 3);
      const corePlayers = withCurve.slice(0, coreSize);

      const windowCoreRaw = computeWindowRaw(
        corePlayers.map((p) => ({ value: p.edgeScore, age_score: p.age_curve.score }))
      );
      const windowTotalRaw = computeWindowRaw(
        withCurve.map((p) => ({ value: p.edgeScore, age_score: p.age_curve.score }))
      );
      const coreCoverage = corePlayers.length > 0
        ? (corePlayers.filter((p) => p.edgeScore > 0).length / coreSize) * 100 : 0;
      const totalCoverage = withCurve.length > 0
        ? (withCurve.filter((p) => p.edgeScore > 0).length / withCurve.length) * 100 : 0;

      const coreAssets: CoreAsset[] = withCurve.slice(0, 12).map((p) => ({
        player_id: p.player_id,
        full_name: p.full_name,
        position: p.position,
        edge_score: p.edgeScore,
        age: p.age,
        age_curve: p.age_curve,
        fc_value: p.cv?.fc_value ?? null,
        ktc_value: p.cv?.ktc_value ?? null,
        dp_value: p.cv?.dp_value ?? null,
        fc_score: p.cv?.fc_score ?? null,
        ktc_score: p.cv?.ktc_score ?? null,
        dp_score: p.cv?.dp_score ?? null,
        sources_available: p.cv?.sources_available ?? 0,
        source_agreement: p.cv?.source_agreement ?? "high",
      }));

      const srcCounts = withCurve.map((p) => p.cv?.sources_available ?? 0);
      const avgSources = srcCounts.length > 0
        ? Math.round((srcCounts.reduce((s, v) => s + v, 0) / srcCounts.length) * 10) / 10 : 0;

      return { ownerId, startersValue, avgStarterScore, windowCoreRaw, windowTotalRaw,
        coreCoverage, totalCoverage, coreAssets, avgSources };
    });

    const allStarters = rosterData.map((r) => r.startersValue);
    const allCoreRaws = rosterData.map((r) => r.windowCoreRaw);
    const allTotalRaws = rosterData.map((r) => r.windowTotalRaw);

    const rosters: RosterRanking[] = rosterData.map((r) => {
      const powerPct = percentileRank(allStarters, r.startersValue);
      const windowCorePct = percentileRank(allCoreRaws, r.windowCoreRaw);
      const windowTotalPct = percentileRank(allTotalRaws, r.windowTotalRaw);
      const draftPct = 50;
      const { archetype, reasons } = classifyTeam(powerPct, draftPct, windowCorePct);

      return {
        roster_id: rosterIdMap.get(`${lid}:${r.ownerId}`) ?? 0,
        owner_id: r.ownerId,
        display_name: nameMap.get(`${lid}:${r.ownerId}`) ?? r.ownerId,
        is_user: r.ownerId === userId,
        starters_value: r.startersValue,
        avg_starter_score: r.avgStarterScore,
        power_pct: Math.round(powerPct * 10) / 10,
        draft_value: 0, draft_pct: draftPct,
        window_core_raw: Math.round(r.windowCoreRaw * 10) / 10,
        window_core_pct: Math.round(windowCorePct * 10) / 10,
        window_total_raw: Math.round(r.windowTotalRaw * 10) / 10,
        window_total_pct: Math.round(windowTotalPct * 10) / 10,
        window_core_coverage_pct: Math.round(r.coreCoverage),
        window_total_coverage_pct: Math.round(r.totalCoverage),
        archetype, reasons,
        core_assets: r.coreAssets,
        avg_sources_available: r.avgSources,
      };
    });

    rosters.sort((a, b) => b.power_pct - a.power_pct);
    results.push({
      league_id: lid, league_name: league.league_name,
      mode, draft_data_available: false, rosters,
    });
  }

  results.sort((a, b) => a.league_name.localeCompare(b.league_name));
  return results;
}
