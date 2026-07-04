import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  computeScoringDelta,
  estimateBaselineFPPG,
  parseLeagueScoring,
  scoringLabel,
  type LeagueScoringSettings,
} from "./scoring-adjustment.js";
import { computeLeagueScoring } from "./league-scoring.js";
import { MAX_MARKET_VALUE } from "./market-value.js";

export interface PlayerUsageProfile {
  receptions_pg: number;
  carries_pg: number;
  passing_tds_pg: number;
  rushing_tds_pg: number;
  receiving_tds_pg: number;
  passing_yds_pg: number;
  rushing_yds_pg: number;
  receiving_yds_pg: number;
}

export interface LeagueMarketContext {
  scoring: LeagueScoringSettings;
  rawScoringSettings: Record<string, number>;
  rosterPositions: string[];
  mode: "sf" | "1qb";
  requestedMode: "sf" | "1qb";
  isSuperflex: boolean;
  isTePremium: boolean;
  totalRosters: number;
  label: string;
  warnings: string[];
}

export interface LeagueMarketAdjustment {
  leagueMarketValue: number;
  scoringMultiplier: number | null;
  lineupScarcityMultiplier: number | null;
  scoringDeltaPpg: number | null;
  leagueAdjustedScore: number | null;
  reasons: string[];
  warnings: string[];
}

export interface LeagueProjectionProfile {
  projectedLeaguePpg: number;
  projectedKtcBaselinePpg: number;
  projectedLeaguePoints: number;
  projectedKtcBaselinePoints: number;
  recentLeaguePpg: number | null;
  recentKtcBaselinePpg: number | null;
  trajectoryLabel: "ascending" | "steady" | "declining";
  trajectoryScore: number;
  trajectoryMultiplier: number;
  projectionYears: number;
  projectedGames: number;
  availabilityRate: number;
  longevityMultiplier: number;
  source: string;
}

const BASELINE_REPLACEMENT_PPG: Record<string, number> = {
  QB: 17,
  RB: 10,
  WR: 11,
  TE: 8,
};

const KTC_BASELINE_REPLACEMENT_PPG: Record<string, number> = {
  QB: 17,
  RB: 8.5,
  WR: 9.5,
  TE: 6.5,
};

const SLEEPER_STANDARD_SCORING: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

const KTC_BASELINE_SCORING: Record<string, number> = {
  ...SLEEPER_STANDARD_SCORING,
  rec: 0.5,
};

const PROJECTION_WEEKS = Array.from({ length: 17 }, (_, index) => index + 1);
const PROJECTION_WINDOW_YEARS = 3;
const SLEEPER_PROJECTION_CACHE_MS = 10 * 60 * 1000;
const sleeperProjectionCache = new Map<string, {
  expiresAt: number;
  data: Record<string, Record<string, number>>;
}>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeScoringSettings(
  scoringSettings: Record<string, unknown> | null,
  defaults: Record<string, number>
): Record<string, number> {
  const out = { ...defaults };
  for (const [key, value] of Object.entries(scoringSettings ?? {})) {
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : null;
    if (parsed != null && Number.isFinite(parsed)) {
      out[key] = parsed;
    }
  }
  return out;
}

export function detectSuperflexFromRosterPositions(rosterPositions: string[]): boolean {
  const normalized = rosterPositions.map((slot) => slot.toUpperCase());
  const qbSlots = normalized.filter((slot) => slot === "QB").length;
  return normalized.some((slot) => slot === "SUPER_FLEX" || slot === "OP") || qbSlots >= 2;
}

export function detectTePremiumFromScoring(scoring: LeagueScoringSettings): boolean {
  return scoring.te_premium > 0;
}

export function buildLeagueMarketContext(input: {
  scoringSettings: Record<string, unknown> | null;
  rosterPositions: string[] | null;
  totalRosters: number | null;
  fallbackMode: "sf" | "1qb";
}): LeagueMarketContext {
  const scoring = parseLeagueScoring(input.scoringSettings ?? null);
  const rosterPositions = input.rosterPositions ?? [];
  const hasRosterPositions = rosterPositions.length > 0;
  const isSuperflex = hasRosterPositions
    ? detectSuperflexFromRosterPositions(rosterPositions)
    : input.fallbackMode === "sf";
  const mode = isSuperflex ? "sf" : "1qb";
  const warnings: string[] = [];

  if (!hasRosterPositions) {
    warnings.push("League roster positions were missing; selected format was used as a fallback.");
  } else if (mode !== input.fallbackMode) {
    warnings.push(`League format resolved as ${mode.toUpperCase()} from roster positions, overriding selected ${input.fallbackMode.toUpperCase()} fallback.`);
  }

  return {
    scoring,
    rawScoringSettings: normalizeScoringSettings(input.scoringSettings ?? null, SLEEPER_STANDARD_SCORING),
    rosterPositions,
    mode,
    requestedMode: input.fallbackMode,
    isSuperflex,
    isTePremium: detectTePremiumFromScoring(scoring),
    totalRosters: input.totalRosters ?? 12,
    label: scoringLabel(scoring),
    warnings,
  };
}

export async function loadLeagueMarketContext(
  leagueId: string | undefined,
  mode: "sf" | "1qb"
): Promise<LeagueMarketContext | null> {
  if (!leagueId) return null;

  const rows = await db.execute(sql`
    SELECT scoring_settings, roster_positions, total_rosters
    FROM leagues
    WHERE league_id = ${leagueId}
    LIMIT 1
  `);
  const row = (rows as unknown as Array<{
    scoring_settings: Record<string, unknown> | null;
    roster_positions: string[] | null;
    total_rosters: number | null;
  }>)[0];
  if (!row) return null;

  return buildLeagueMarketContext({
    scoringSettings: row.scoring_settings ?? null,
    rosterPositions: row.roster_positions ?? null,
    totalRosters: row.total_rosters ?? 12,
    fallbackMode: mode,
  });
}

export function scoringMultiplier(params: {
  baselinePpg: number;
  leaguePpg: number;
  baselineReplacementPpg: number;
  leagueReplacementPpg: number;
}): number {
  const baselineVor = Math.max(
    0.5,
    params.baselinePpg - params.baselineReplacementPpg
  );
  const leagueVor = Math.max(
    0.5,
    params.leaguePpg - params.leagueReplacementPpg
  );
  const ratio = leagueVor / baselineVor;
  return roundTo(clamp(Math.pow(ratio, 0.45), 0.78, 1.35));
}

function estimateLeagueReplacementPpg(
  position: string,
  scoring: LeagueScoringSettings
): number {
  const baseline = BASELINE_REPLACEMENT_PPG[position] ?? 10;
  if (position === "QB") {
    return baseline + (scoring.pass_td - 4) * 1.2;
  }
  if (position === "TE") {
    return baseline + scoring.te_premium * 3;
  }
  if (position === "RB") {
    return baseline + scoring.carry_bonus * 10 + (scoring.ppr - 1) * 3;
  }
  if (position === "WR") {
    return baseline + (scoring.ppr - 1) * 4;
  }
  return baseline;
}

function lineupScarcityMultiplier(
  position: string | null,
  context: LeagueMarketContext | null,
  model: "composite" | "ktc_league" = "composite"
): number | null {
  if (!position || !context) return null;

  const slots = context.rosterPositions.map((slot) => slot.toUpperCase());
  const qbSlots = slots.filter((slot) => slot === "QB").length;
  const teSlots = slots.filter((slot) => slot === "TE").length;
  const flexSlots = slots.filter((slot) => slot === "FLEX" || slot === "WRRB_FLEX" || slot === "REC_FLEX").length;
  const teEligibleFlexSlots = slots.filter((slot) =>
    slot === "FLEX" ||
    slot === "REC_FLEX" ||
    slot === "TE_FLEX" ||
    slot === "WRTE_FLEX" ||
    slot === "RBTE_FLEX"
  ).length;
  const rbEligibleFlexSlots = slots.filter((slot) =>
    slot === "FLEX" ||
    slot === "WRRB_FLEX" ||
    slot === "RBTE_FLEX" ||
    slot === "SUPER_FLEX" ||
    slot === "OP"
  ).length;
  const wrEligibleFlexSlots = slots.filter((slot) =>
    slot === "FLEX" ||
    slot === "WRRB_FLEX" ||
    slot === "WRTE_FLEX" ||
    slot === "REC_FLEX" ||
    slot === "SUPER_FLEX" ||
    slot === "OP"
  ).length;
  const leagueSizeBump = clamp((context.totalRosters - 12) * 0.015, -0.03, 0.06);

  let multiplier = 1;
  if (model === "ktc_league") {
    if (position === "QB") {
      multiplier = context.isSuperflex || qbSlots >= 2 ? 1.13 : 0.86;
    } else if (position === "TE") {
      multiplier =
        1 +
        Math.max(0, teSlots - 1) * 0.08 +
        teEligibleFlexSlots * 0.035 +
        Math.min(context.scoring.te_premium * 0.035, 0.07);
    } else if (position === "RB") {
      multiplier = 1 + rbEligibleFlexSlots * 0.012;
    } else if (position === "WR") {
      multiplier = 1 + wrEligibleFlexSlots * 0.004;
    }
    return roundTo(clamp(multiplier + leagueSizeBump, 0.80, 1.28));
  }

  if (position === "QB") {
    multiplier = context.isSuperflex || qbSlots >= 2 ? 1.10 : 0.88;
  } else if (position === "TE") {
    multiplier = teSlots >= 2 ? 1.12 : 1.0;
  } else if (position === "RB") {
    multiplier = flexSlots >= 2 ? 1.02 : 1.0;
  } else if (position === "WR") {
    multiplier = flexSlots >= 2 ? 1.02 : 1.0;
  }

  return roundTo(clamp(multiplier + leagueSizeBump, 0.82, 1.22));
}

function projectedPointsMultiplier(params: {
  position: string | null;
  leaguePpg: number;
  ktcBaselinePpg: number;
  availabilityRate: number;
  longevityMultiplier: number;
  trajectoryMultiplier: number;
  context: LeagueMarketContext;
}): number {
  const baselineReplacement = KTC_BASELINE_REPLACEMENT_PPG[params.position ?? ""] ?? 8;
  const leagueReplacement = estimateLeagueReplacementPpg(
    params.position ?? "",
    params.context.scoring
  );
  const baselineVor = Math.max(0.5, params.ktcBaselinePpg - baselineReplacement);
  const leagueVor = Math.max(0.5, params.leaguePpg - leagueReplacement);
  const pointsRatio = leagueVor / baselineVor;
  const scoring = clamp(Math.pow(pointsRatio, 0.55), 0.76, 1.42);
  const availability = clamp(0.90 + params.availabilityRate * 0.14, 0.86, 1.04);
  return roundTo(clamp(scoring * availability * params.longevityMultiplier * params.trajectoryMultiplier, 0.70, 1.50));
}

function projectionSeason(): number {
  const now = new Date();
  return now.getUTCFullYear();
}

function projectionLongevityMultiplier(
  position: string | null,
  age: number | null,
  yearIndex: number
): number {
  if (yearIndex <= 0) return 1;
  if (!position || age == null || age <= 0) {
    return yearIndex === 1 ? 0.92 : 0.84;
  }

  const projectedAge = age + yearIndex;
  if (position === "QB") {
    if (projectedAge <= 32) return yearIndex === 1 ? 0.99 : 0.96;
    if (projectedAge <= 35) return yearIndex === 1 ? 0.94 : 0.86;
    return yearIndex === 1 ? 0.82 : 0.62;
  }
  if (position === "RB") {
    if (projectedAge <= 25) return yearIndex === 1 ? 0.93 : 0.82;
    if (projectedAge <= 27) return yearIndex === 1 ? 0.84 : 0.68;
    if (projectedAge <= 29) return yearIndex === 1 ? 0.70 : 0.48;
    return yearIndex === 1 ? 0.52 : 0.30;
  }
  if (position === "WR") {
    if (projectedAge <= 27) return yearIndex === 1 ? 0.95 : 0.86;
    if (projectedAge <= 30) return yearIndex === 1 ? 0.88 : 0.72;
    return yearIndex === 1 ? 0.68 : 0.46;
  }
  if (position === "TE") {
    if (projectedAge <= 28) return yearIndex === 1 ? 0.95 : 0.86;
    if (projectedAge <= 31) return yearIndex === 1 ? 0.88 : 0.72;
    return yearIndex === 1 ? 0.66 : 0.42;
  }

  return yearIndex === 1 ? 0.90 : 0.78;
}

function ageTrajectorySignal(position: string | null, age: number | null): number {
  if (!position || age == null || age <= 0) return 0;

  if (position === "QB") {
    if (age <= 27) return 0.20;
    if (age <= 32) return 0.05;
    if (age <= 35) return -0.25;
    return -0.70;
  }
  if (position === "RB") {
    if (age <= 23) return 0.28;
    if (age <= 25) return 0.08;
    if (age <= 27) return -0.20;
    if (age <= 29) return -0.55;
    return -0.85;
  }
  if (position === "WR") {
    if (age <= 24) return 0.25;
    if (age <= 28) return 0.06;
    if (age <= 30) return -0.22;
    return -0.62;
  }
  if (position === "TE") {
    if (age <= 25) return 0.24;
    if (age <= 29) return 0.04;
    if (age <= 31) return -0.18;
    return -0.58;
  }
  return 0;
}

function trendSignal(next: number | null, previous: number | null): number {
  if (next == null || previous == null || previous <= 1) return 0;
  const pct = (next - previous) / previous;
  return clamp(pct * 3, -1, 1);
}

function trajectoryFromSignals(params: {
  projectedPpg: number;
  recentPpg: number | null;
  previousPpg: number | null;
  position: string | null;
  age: number | null;
}): {
  label: "ascending" | "steady" | "declining";
  score: number;
  multiplier: number;
} {
  const projectionSignal = trendSignal(params.projectedPpg, params.recentPpg);
  const recentSignal = trendSignal(params.recentPpg, params.previousPpg);
  const ageSignal = ageTrajectorySignal(params.position, params.age);
  const score = roundTo(
    clamp(projectionSignal * 0.55 + recentSignal * 0.25 + ageSignal * 0.20, -1, 1),
    3
  );
  const label = score >= 0.22 ? "ascending" : score <= -0.22 ? "declining" : "steady";
  return {
    label,
    score,
    multiplier: roundTo(clamp(1 + score * 0.12, 0.86, 1.14), 3),
  };
}

function scoreSeasonalUsagePpg(
  usage: PlayerUsageProfile,
  position: string | null,
  scoring: Record<string, number>
): number {
  const receptions = usage.receptions_pg ?? 0;
  const carries = usage.carries_pg ?? 0;
  const passTds = usage.passing_tds_pg ?? 0;
  const rushTds = usage.rushing_tds_pg ?? 0;
  const recTds = usage.receiving_tds_pg ?? 0;
  const passYds = usage.passing_yds_pg ?? 0;
  const rushYds = usage.rushing_yds_pg ?? 0;
  const recYds = usage.receiving_yds_pg ?? 0;

  let points =
    receptions * (scoring.rec ?? 0) +
    carries * (scoring.rush_att ?? 0) +
    passTds * (scoring.pass_td ?? 4) +
    rushTds * (scoring.rush_td ?? 6) +
    recTds * (scoring.rec_td ?? 6) +
    passYds * (scoring.pass_yd ?? 0.04) +
    rushYds * (scoring.rush_yd ?? 0.1) +
    recYds * (scoring.rec_yd ?? 0.1);

  if (position === "TE") points += receptions * (scoring.bonus_rec_te ?? 0);
  if (position === "RB") points += receptions * (scoring.bonus_rec_rb ?? 0);
  if (position === "WR") points += receptions * (scoring.bonus_rec_wr ?? 0);

  return roundTo(points, 2);
}

async function fetchSleeperProjectionWeek(
  season: number,
  week: number
): Promise<Record<string, Record<string, number>>> {
  const cacheKey = `${season}:${week}`;
  const cached = sleeperProjectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await fetch(
    `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`
  );
  if (!response.ok) {
    throw new Error(`Sleeper projections ${season} week ${week} returned ${response.status}`);
  }
  const data = await response.json() as Record<string, Record<string, number>>;
  sleeperProjectionCache.set(cacheKey, {
    expiresAt: Date.now() + SLEEPER_PROJECTION_CACHE_MS,
    data,
  });
  return data;
}

export async function loadSleeperProjectionProfiles(
  playerIds: string[],
  context: LeagueMarketContext,
  options: { season?: number; projectionYears?: number } = {}
): Promise<Map<string, LeagueProjectionProfile>> {
  if (playerIds.length === 0) return new Map();

  const season = options.season ?? projectionSeason();
  const projectionYears = clamp(
    Math.round(options.projectionYears ?? PROJECTION_WINDOW_YEARS),
    2,
    3
  );
  const projectionsByWeek = await Promise.all(
    PROJECTION_WEEKS.map((week) => fetchSleeperProjectionWeek(season, week))
  );

  const playerRows = await db.execute(sql`
    SELECT player_id, position, age
    FROM players_master
    WHERE player_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
  `);
  const meta = new Map((playerRows as unknown as Array<{
    player_id: string;
    position: string | null;
    age: number | null;
  }>).map((row) => [row.player_id, row]));

  const historySeasons = [season - 1, season - 2, season - 3];
  const historyRows = await db.execute(sql`
    SELECT sleeper_id, season, week, stats
    FROM player_weekly_stats
    WHERE sleeper_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
      AND season IN (${sql.join(historySeasons.map((historySeason) => sql`${historySeason}`), sql`, `)})
      AND week != 18
    ORDER BY sleeper_id, season DESC, week ASC
  `);

  const historyByPlayer = new Map<string, Map<number, Record<string, number>[]>>();
  for (const row of historyRows as unknown as Array<{
    sleeper_id: string;
    season: number;
    stats: Record<string, number>;
  }>) {
    const seasonsForPlayer = historyByPlayer.get(row.sleeper_id) ?? new Map<number, Record<string, number>[]>();
    const weeklyRows = seasonsForPlayer.get(row.season) ?? [];
    weeklyRows.push(row.stats);
    seasonsForPlayer.set(row.season, weeklyRows);
    historyByPlayer.set(row.sleeper_id, seasonsForPlayer);
  }

  const seasonalRows = await db.execute(sql`
    SELECT sleeper_id, season, receptions_pg, carries_pg,
           passing_tds_pg, rushing_tds_pg, receiving_tds_pg,
           passing_yds_pg, rushing_yds_pg, receiving_yds_pg
    FROM player_seasonal_stats
    WHERE sleeper_id IN (${sql.join(playerIds.map((id) => sql`${id}`), sql`, `)})
      AND season IN (${sql.join(historySeasons.map((historySeason) => sql`${historySeason}`), sql`, `)})
    ORDER BY sleeper_id, season DESC
  `);

  const seasonalByPlayer = new Map<string, Map<number, PlayerUsageProfile>>();
  for (const row of seasonalRows as unknown as Array<PlayerUsageProfile & {
    sleeper_id: string;
    season: number;
  }>) {
    const seasonsForPlayer = seasonalByPlayer.get(row.sleeper_id) ?? new Map<number, PlayerUsageProfile>();
    seasonsForPlayer.set(row.season, {
      receptions_pg: Number(row.receptions_pg ?? 0),
      carries_pg: Number(row.carries_pg ?? 0),
      passing_tds_pg: Number(row.passing_tds_pg ?? 0),
      rushing_tds_pg: Number(row.rushing_tds_pg ?? 0),
      receiving_tds_pg: Number(row.receiving_tds_pg ?? 0),
      passing_yds_pg: Number(row.passing_yds_pg ?? 0),
      rushing_yds_pg: Number(row.rushing_yds_pg ?? 0),
      receiving_yds_pg: Number(row.receiving_yds_pg ?? 0),
    });
    seasonalByPlayer.set(row.sleeper_id, seasonsForPlayer);
  }

  const out = new Map<string, LeagueProjectionProfile>();
  for (const playerId of playerIds) {
    const player = meta.get(playerId);
    const weeklyRows = projectionsByWeek
      .map((weekData) => weekData[playerId])
      .filter((row): row is Record<string, number> => !!row && Object.keys(row).length > 0);
    if (weeklyRows.length === 0) continue;

    const leagueProjection = computeLeagueScoring(
      weeklyRows,
      context.rawScoringSettings,
      player?.position ?? ""
    );
    const ktcBaselineProjection = computeLeagueScoring(
      weeklyRows,
      KTC_BASELINE_SCORING,
      player?.position ?? ""
    );
    let recentLeaguePpg: number | null = null;
    let recentKtcBaselinePpg: number | null = null;
    let previousLeaguePpg: number | null = null;
    const playerHistory = historyByPlayer.get(playerId);
    const playerSeasonalHistory = seasonalByPlayer.get(playerId);
    for (const historySeason of historySeasons) {
      const historicalRows = playerHistory?.get(historySeason) ?? [];
      const seasonalHistory = playerSeasonalHistory?.get(historySeason) ?? null;
      if (historicalRows.length === 0 && !seasonalHistory) continue;
      const leagueHistoryPpg = historicalRows.length > 0
        ? computeLeagueScoring(
            historicalRows,
            context.rawScoringSettings,
            player?.position ?? ""
          ).per_game_points
        : scoreSeasonalUsagePpg(
            seasonalHistory!,
            player?.position ?? null,
            context.rawScoringSettings
          );
      const ktcHistoryPpg = historicalRows.length > 0
        ? computeLeagueScoring(
            historicalRows,
            KTC_BASELINE_SCORING,
            player?.position ?? ""
          ).per_game_points
        : scoreSeasonalUsagePpg(
            seasonalHistory!,
            player?.position ?? null,
            KTC_BASELINE_SCORING
          );
      if (recentLeaguePpg == null) {
        recentLeaguePpg = leagueHistoryPpg;
        recentKtcBaselinePpg = ktcHistoryPpg;
      } else if (previousLeaguePpg == null) {
        previousLeaguePpg = leagueHistoryPpg;
      }
    }
    const longevityFactors = Array.from({ length: projectionYears }, (_, yearIndex) =>
      projectionLongevityMultiplier(player?.position ?? null, player?.age ?? null, yearIndex)
    );
    const longevityTotal = longevityFactors.reduce((total, factor) => total + factor, 0);
    const longevityAverage = longevityTotal / projectionYears;
    const trajectory = trajectoryFromSignals({
      projectedPpg: leagueProjection.per_game_points,
      recentPpg: recentLeaguePpg,
      previousPpg: previousLeaguePpg,
      position: player?.position ?? null,
      age: player?.age ?? null,
    });
    const projectedGames = leagueProjection.weeks_scored * longevityTotal;
    const availabilityRate = clamp(projectedGames / (17 * projectionYears), 0, 1);
    const expectedWindowMultiplier = longevityTotal * trajectory.multiplier;

    out.set(playerId, {
      projectedLeaguePpg: leagueProjection.per_game_points,
      projectedKtcBaselinePpg: ktcBaselineProjection.per_game_points,
      projectedLeaguePoints: roundTo(leagueProjection.total_points * expectedWindowMultiplier, 1),
      projectedKtcBaselinePoints: roundTo(ktcBaselineProjection.total_points * expectedWindowMultiplier, 1),
      recentLeaguePpg,
      recentKtcBaselinePpg,
      trajectoryLabel: trajectory.label,
      trajectoryScore: trajectory.score,
      trajectoryMultiplier: trajectory.multiplier,
      projectionYears,
      projectedGames: roundTo(projectedGames, 1),
      availabilityRate: roundTo(availabilityRate, 3),
      longevityMultiplier: roundTo(longevityAverage, 3),
      source: `Sleeper ${season} weekly projections`,
    });
  }

  return out;
}

export function applyLeagueMarketAdjustment(input: {
  baseMarketValue: number;
  edgeScore: number;
  position: string | null;
  usage?: PlayerUsageProfile | null;
  projection?: LeagueProjectionProfile | null;
  context?: LeagueMarketContext | null;
  model?: "composite" | "ktc_league";
}): LeagueMarketAdjustment {
  const context = input.context ?? null;
  const model = input.model ?? "composite";
  const scarcity = lineupScarcityMultiplier(input.position, context, model);
  let scoringMult: number | null = null;
  let scoringDeltaPpg: number | null = null;
  let leagueAdjustedScore: number | null = null;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!context) {
    warnings.push("League settings were unavailable; league market value equals base market value.");
  } else {
    reasons.push(`League format resolved from roster positions as ${context.mode.toUpperCase()}.`);
    if (context.isTePremium) {
      reasons.push(`TE Premium detected from scoring settings at +${context.scoring.te_premium} per TE reception.`);
    }
  }

  if (context && input.projection && model === "ktc_league") {
    scoringMult = projectedPointsMultiplier({
      position: input.position,
      leaguePpg: input.projection.projectedLeaguePpg,
      ktcBaselinePpg: input.projection.projectedKtcBaselinePpg,
      availabilityRate: input.projection.availabilityRate,
      longevityMultiplier: input.projection.longevityMultiplier,
      trajectoryMultiplier: input.projection.trajectoryMultiplier,
      context,
    });
    scoringDeltaPpg = roundTo(
      input.projection.projectedLeaguePpg - input.projection.projectedKtcBaselinePpg,
      2
    );
    leagueAdjustedScore = roundTo(
      clamp(input.edgeScore * scoringMult, 0, 99),
      1
    );
    reasons.push(
      `Projected points model used ${input.projection.source}: ${input.projection.projectedLeaguePpg.toFixed(2)} league PPG vs ${input.projection.projectedKtcBaselinePpg.toFixed(2)} KTC-baseline PPG over ${input.projection.projectionYears} years.`
    );
    reasons.push(
      `Trajectory spectrum is ${input.projection.trajectoryLabel} (${input.projection.trajectoryScore >= 0 ? "+" : ""}${input.projection.trajectoryScore.toFixed(2)}), blending projected PPG, recent PPG${input.projection.recentLeaguePpg != null ? ` (${input.projection.recentLeaguePpg.toFixed(2)})` : ""}, and age curve; x${input.projection.trajectoryMultiplier.toFixed(3)}.`
    );
    reasons.push(
      `2-3 year expected-value window multiplier for ${input.position ?? "asset"}: x${input.projection.longevityMultiplier.toFixed(3)}; projected availability ${Math.round(input.projection.availabilityRate * 100)}%.`
    );
  } else if (context && input.usage && input.position) {
    const baselinePpg = estimateBaselineFPPG(input.usage, input.position);
    const { delta_ppg } = computeScoringDelta(
      input.usage,
      input.position,
      context.scoring
    );
    scoringDeltaPpg = delta_ppg;
    const leaguePpg = baselinePpg + delta_ppg;
    scoringMult = scoringMultiplier({
      baselinePpg,
      leaguePpg,
      baselineReplacementPpg: BASELINE_REPLACEMENT_PPG[input.position] ?? 10,
      leagueReplacementPpg: estimateLeagueReplacementPpg(
        input.position,
        context.scoring
      ),
    });
    leagueAdjustedScore = roundTo(
      clamp(input.edgeScore * scoringMult, 0, 99),
      1
    );
    if (scoringMult !== 1 || scoringDeltaPpg !== 0) {
      reasons.push(`Scoring adjustment applied from projected usage: ${scoringDeltaPpg >= 0 ? "+" : ""}${scoringDeltaPpg.toFixed(2)} PPG.`);
    }
  } else if (context && input.position && input.position !== "PICK" && !input.usage) {
    warnings.push(model === "ktc_league"
      ? "Projected points profile was unavailable; KTC League scoring adjustment fell back to structure only."
      : "Player usage profile was unavailable; scoring-specific adjustment was not applied.");
  }

  const scoringFactor = scoringMult ?? 1;
  const scarcityFactor = scarcity ?? 1;
  if (scarcity != null && scarcity !== 1) {
    reasons.push(`Lineup scarcity multiplier applied for ${input.position}: x${scarcity.toFixed(3)}.`);
  }
  const rawLeagueMarketValue = input.baseMarketValue * scoringFactor * scarcityFactor;
  const leagueMarketValue = model === "ktc_league"
    ? Math.max(0, Math.round(rawLeagueMarketValue))
    : Math.round(
        clamp(
          rawLeagueMarketValue,
          0,
          MAX_MARKET_VALUE
        )
      );

  return {
    leagueMarketValue,
    scoringMultiplier: scoringMult,
    lineupScarcityMultiplier: scarcity,
    scoringDeltaPpg,
    leagueAdjustedScore,
    reasons,
    warnings,
  };
}
