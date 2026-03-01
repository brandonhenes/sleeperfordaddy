import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import { classifyTeam, percentileRank } from "./archetypes.js";

// ─── Types ───

export interface CoreAsset {
  player_id: string;
  full_name: string;
  position: string;
  value: number;
  age: number | null;
  age_curve: AgeCurveStatus;
}

export interface RosterRanking {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  starters_value: number;
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
  // Resolve user_id
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  // Get user's current-season leagues (deduplicated by name)
  const leagueRows = await db.execute(sql`
    SELECT DISTINCT ON (l.name)
      l.league_id, l.name AS league_name, l.total_rosters
    FROM user_leagues ul
    JOIN leagues l ON ul.league_id = l.league_id
    WHERE ul.user_id = ${userId}
    ORDER BY l.name ASC, l.season DESC
  `);
  const leagues = leagueRows as unknown as {
    league_id: string;
    league_name: string;
    total_rosters: number;
  }[];

  if (leagues.length === 0) return [];

  // Build league_id IN clause
  const leagueIdFragments = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(leagueIdFragments, sql`, `);

  // Get ALL roster players for these leagues with values + ages
  const rosterRows = await db.execute(sql`
    SELECT
      rp.league_id,
      rp.owner_id,
      rp.player_id,
      pm.full_name,
      pm.position,
      pm.age,
      COALESCE(fc.dynasty_value, 0)::int AS dynasty_value
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pm.full_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE rp.league_id IN (${inClause})
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);

  type RosterRow = {
    league_id: string;
    owner_id: string;
    player_id: string;
    full_name: string;
    position: string;
    age: number | null;
    dynasty_value: number;
  };
  const rows = rosterRows as unknown as RosterRow[];

  // Get rosters table for roster_id mapping
  const rosterIdRows = await db.execute(sql`
    SELECT league_id, owner_id, roster_id
    FROM rosters
    WHERE league_id IN (${inClause})
  `);
  type RosterIdRow = { league_id: string; owner_id: string; roster_id: number };
  const rosterIdMap = new Map<string, number>();
  for (const r of rosterIdRows as unknown as RosterIdRow[]) {
    rosterIdMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  }

  // Get display names
  const nameRows = await db.execute(sql`
    SELECT league_id, user_id, display_name
    FROM league_users
    WHERE league_id IN (${inClause})
  `);
  type NameRow = { league_id: string; user_id: string; display_name: string | null };
  const nameMap = new Map<string, string>();
  for (const r of nameRows as unknown as NameRow[]) {
    nameMap.set(`${r.league_id}:${r.user_id}`, r.display_name ?? r.user_id);
  }

  // Group: league -> owner -> players[]
  const nested: Record<string, Record<string, RosterRow[]>> = {};
  for (const r of rows) {
    nested[r.league_id] ??= {};
    nested[r.league_id][r.owner_id] ??= [];
    nested[r.league_id][r.owner_id].push(r);
  }

  // Fetch roster_positions from Sleeper for SF detection + starter count
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
      } catch {
        // fallback handled below
      }
    })
  );

  // Process each league
  const results: LeaguePowerRanking[] = [];

  for (const league of leagues) {
    const lid = league.league_id;
    const leagueTeams = nested[lid] ?? {};
    const settings = leagueSettingsMap.get(lid) ?? { sf: false, starterSlots: 9 };

    const rosterData = Object.entries(leagueTeams).map(([ownerId, players]) => {
      const sorted = [...players].sort((a, b) => b.dynasty_value - a.dynasty_value);

      // Starters value: top N by value
      const startersValue = sorted
        .slice(0, settings.starterSlots)
        .reduce((s, p) => s + p.dynasty_value, 0);

      // Age curve for each player
      const withCurve = sorted.map((p) => ({
        ...p,
        age_curve: getAgeCurveStatus(p.position, p.age),
      }));

      // Window core: top min(12, starterSlots + 3)
      const coreSize = Math.min(12, settings.starterSlots + 3);
      const corePlayers = withCurve.slice(0, coreSize);
      const allPlayers = withCurve;

      const windowCoreRaw = computeWindowRaw(
        corePlayers.map((p) => ({ value: p.dynasty_value, age_score: p.age_curve.score }))
      );
      const windowTotalRaw = computeWindowRaw(
        allPlayers.map((p) => ({ value: p.dynasty_value, age_score: p.age_curve.score }))
      );

      const coreCoverage = corePlayers.length > 0
        ? (corePlayers.filter((p) => p.dynasty_value > 0).length / coreSize) * 100
        : 0;
      const totalCoverage = allPlayers.length > 0
        ? (allPlayers.filter((p) => p.dynasty_value > 0).length / allPlayers.length) * 100
        : 0;

      // Core assets: top 12
      const coreAssets: CoreAsset[] = withCurve.slice(0, 12).map((p) => ({
        player_id: p.player_id,
        full_name: p.full_name,
        position: p.position,
        value: p.dynasty_value,
        age: p.age,
        age_curve: p.age_curve,
      }));

      return {
        ownerId,
        startersValue,
        windowCoreRaw,
        windowTotalRaw,
        coreCoverage,
        totalCoverage,
        coreAssets,
      };
    });

    // Compute percentiles across all rosters in this league
    const allStartersValues = rosterData.map((r) => r.startersValue);
    const allWindowCoreRaws = rosterData.map((r) => r.windowCoreRaw);
    const allWindowTotalRaws = rosterData.map((r) => r.windowTotalRaw);

    const rosters: RosterRanking[] = rosterData.map((r) => {
      const powerPct = percentileRank(allStartersValues, r.startersValue);
      const windowCorePct = percentileRank(allWindowCoreRaws, r.windowCoreRaw);
      const windowTotalPct = percentileRank(allWindowTotalRaws, r.windowTotalRaw);
      const draftPct = 50; // placeholder

      const { archetype, reasons } = classifyTeam(powerPct, draftPct, windowCorePct);

      return {
        roster_id: rosterIdMap.get(`${lid}:${r.ownerId}`) ?? 0,
        owner_id: r.ownerId,
        display_name: nameMap.get(`${lid}:${r.ownerId}`) ?? r.ownerId,
        is_user: r.ownerId === userId,
        starters_value: r.startersValue,
        power_pct: Math.round(powerPct * 10) / 10,
        draft_value: 0,
        draft_pct: draftPct,
        window_core_raw: Math.round(r.windowCoreRaw * 10) / 10,
        window_core_pct: Math.round(windowCorePct * 10) / 10,
        window_total_raw: Math.round(r.windowTotalRaw * 10) / 10,
        window_total_pct: Math.round(windowTotalPct * 10) / 10,
        window_core_coverage_pct: Math.round(r.coreCoverage),
        window_total_coverage_pct: Math.round(r.totalCoverage),
        archetype,
        reasons,
        core_assets: r.coreAssets,
      };
    });

    // Sort by power_pct descending
    rosters.sort((a, b) => b.power_pct - a.power_pct);

    results.push({
      league_id: lid,
      league_name: league.league_name,
      mode: settings.sf ? "sf" : "1qb",
      draft_data_available: false,
      rosters,
    });
  }

  // Sort leagues by name
  results.sort((a, b) => a.league_name.localeCompare(b.league_name));

  return results;
}
