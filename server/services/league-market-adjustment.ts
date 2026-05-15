import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  computeScoringDelta,
  estimateBaselineFPPG,
  parseLeagueScoring,
  scoringLabel,
  type LeagueScoringSettings,
} from "./scoring-adjustment.js";
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

const BASELINE_REPLACEMENT_PPG: Record<string, number> = {
  QB: 17,
  RB: 10,
  WR: 11,
  TE: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
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
  context: LeagueMarketContext | null
): number | null {
  if (!position || !context) return null;

  const slots = context.rosterPositions.map((slot) => slot.toUpperCase());
  const qbSlots = slots.filter((slot) => slot === "QB").length;
  const teSlots = slots.filter((slot) => slot === "TE").length;
  const flexSlots = slots.filter((slot) => slot === "FLEX").length;
  const leagueSizeBump = clamp((context.totalRosters - 12) * 0.015, -0.03, 0.06);

  let multiplier = 1;
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

export function applyLeagueMarketAdjustment(input: {
  baseMarketValue: number;
  edgeScore: number;
  position: string | null;
  usage?: PlayerUsageProfile | null;
  context?: LeagueMarketContext | null;
}): LeagueMarketAdjustment {
  const context = input.context ?? null;
  const scarcity = lineupScarcityMultiplier(input.position, context);
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

  if (context && input.usage && input.position) {
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
    warnings.push("Player usage profile was unavailable; scoring-specific adjustment was not applied.");
  }

  const scoringFactor = scoringMult ?? 1;
  const scarcityFactor = scarcity ?? 1;
  if (scarcity != null && scarcity !== 1) {
    reasons.push(`Lineup scarcity multiplier applied for ${input.position}: x${scarcity.toFixed(3)}.`);
  }
  const leagueMarketValue = Math.round(
    clamp(
      input.baseMarketValue * scoringFactor * scarcityFactor,
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
