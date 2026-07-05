import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type {
  EvaluatedAsset,
  LeaguePlayerRating,
  LeaguePlayerRatingComponent,
  LeaguePlayerRatingGrade,
  TradeAssetInput,
  TradeEvaluation,
  TradeHealthWarning,
  TradeValuationAdjustmentReason,
  TradeValuationComparison,
  TradeValuationProfile,
  TradeValuationProfileSummary,
  TradeValuationWarning,
} from "../../shared/types.js";
import type { SourceWeights } from "./edge-score.js";
import {
  getCompositeValues,
  getGlobalScaleParams,
  type GlobalScaleParams,
} from "./composite-values.js";
import { computeEdgeScores } from "./edge-score.js";
import {
  calculateMarketValueFromSources,
  edgeEquivalentFromMarketValue,
  marketValueFromEdge,
  MAX_MARKET_VALUE,
} from "./market-value.js";
import {
  applyLeagueMarketAdjustment,
  buildLeagueMarketContext,
  loadLeagueMarketContext,
  loadSleeperProjectionProfiles,
  type LeagueProjectionProfile,
} from "./league-market-adjustment.js";
import { calculateKtcTradeContext, calculateTradeContext } from "./trade-context-value.js";
import { getAgeCurveStatus } from "./age-curves.js";
import { computeLeaguePPG } from "./league-ppg.js";
import type { ValueType } from "./composite-values.js";
import {
  getTradePickBreakdown,
  type ClassStrengthMap,
} from "./pick-values.js";
import {
  loadPlayerUsageStats,
} from "./scoring-adjustment.js";
import { tradeAssetKey, validateTradeAssets } from "./trade-asset-validation.js";
import { scoreAgreement } from "../lib/score-agreement.js";

const ROUND_NAMES: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
};

export interface TradeSearchAsset {
  type: "player";
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

function normalizePick(asset: TradeAssetInput): { season: string; round: number; tier: "early" | "mid" | "late" } {
  const year = String(new Date().getFullYear());
  const season = asset.pick_season ?? year;
  const round = Number(asset.pick_round ?? 1);
  const tier = (asset.pick_tier ?? "mid");
  return { season, round, tier };
}

async function loadPickValueMaps(mode: "sf" | "1qb"): Promise<{
  ktcMap: Map<string, number>;
  dpMap: Map<string, number>;
}> {
  const [ktcRows, dpRows] = await Promise.all([
    db.execute(sql`
      SELECT pick_season, pick_round, pick_tier, value_1qb, value_sf
      FROM ktc_values
      WHERE is_pick = true
    `),
    db.execute(sql`
      SELECT player_name, value_1qb, value_2qb
      FROM dynastyprocess_values
      WHERE is_pick = true
    `),
  ]);

  type KtcPickRow = {
    pick_season: number | null;
    pick_round: number | null;
    pick_tier: string | null;
    value_1qb: number | null;
    value_sf: number | null;
  };
  type DpPickRow = {
    player_name: string;
    value_1qb: number | null;
    value_2qb: number | null;
  };

  const ktcMap = new Map<string, number>();
  for (const r of ktcRows as unknown as KtcPickRow[]) {
    if (r.pick_season == null || r.pick_round == null) continue;
    const val = mode === "sf" ? r.value_sf : r.value_1qb;
    if (val == null || val <= 0) continue;
    const tier = (r.pick_tier ?? "").toLowerCase();
    ktcMap.set(`${r.pick_season}|${tier}|${r.pick_round}`, val);
    const generic = `${r.pick_season}||${r.pick_round}`;
    if (!ktcMap.has(generic)) ktcMap.set(generic, val);
  }

  const dpMap = new Map<string, number>();
  for (const r of dpRows as unknown as DpPickRow[]) {
    const val = mode === "sf" ? r.value_2qb : r.value_1qb;
    if (val == null || val <= 0) continue;
    dpMap.set(r.player_name.toLowerCase().trim(), val);
  }

  return { ktcMap, dpMap };
}

function interpolatePickValue(
  slot: number,
  round: number,
  season: string,
  pickMaps: { ktcMap: Map<string, number>; dpMap: Map<string, number> },
  leagueSize = 12
): { ktcValue: number | null; dpValue: number | null; label: string } {
  const tierBoundary1 = Math.ceil(leagueSize / 3);
  const tierBoundary2 = Math.ceil((leagueSize * 2) / 3);

  let primaryTier: "early" | "mid" | "late";
  let secondaryTier: "early" | "mid" | "late" | null = null;
  let blendFactor = 0;

  if (slot <= tierBoundary1) {
    primaryTier = "early";
    if (slot > 1) {
      secondaryTier = "mid";
      blendFactor = (slot - 1) / tierBoundary1;
    }
  } else if (slot <= tierBoundary2) {
    primaryTier = "mid";
    const midStart = tierBoundary1 + 1;
    const midEnd = tierBoundary2;
    const midRange = Math.max(1, midEnd - midStart);
    const midPos = slot - midStart;
    if (midPos < midRange / 2) {
      secondaryTier = "early";
      blendFactor = 0.15;
    } else {
      secondaryTier = "late";
      blendFactor = 0.15;
    }
  } else {
    primaryTier = "late";
    secondaryTier = "mid";
    const denominator = Math.max(1, leagueSize - tierBoundary2);
    blendFactor = Math.max(0, 1 - (slot - tierBoundary2) / denominator) * 0.3;
  }

  const roundName = ROUND_NAMES[round] ?? `R${round}`;
  const label = `${season} ${round}.${String(slot).padStart(2, "0")}`;
  const primaryKtc = pickMaps.ktcMap.get(`${season}|${primaryTier}|${round}`) ?? null;
  const secondaryKtc = secondaryTier
    ? pickMaps.ktcMap.get(`${season}|${secondaryTier}|${round}`) ?? null
    : null;

  let ktcValue: number | null = null;
  if (primaryKtc != null) {
    if (secondaryKtc != null && blendFactor > 0) {
      ktcValue = Math.round(primaryKtc * (1 - blendFactor) + secondaryKtc * blendFactor);
    } else {
      ktcValue = primaryKtc;
    }
  }

  const tierLabel = primaryTier.charAt(0).toUpperCase() + primaryTier.slice(1);
  const dpValue =
    pickMaps.dpMap.get(`${season} ${tierLabel} ${roundName}`.toLowerCase()) ??
    pickMaps.dpMap.get(`${season} ${roundName}`.toLowerCase()) ??
    null;

  return { ktcValue, dpValue, label };
}

export type RawEval = {
  asset_id: string | null;
  asset_key: string;
  asset_name: string;
  asset_type: "player" | "pick";
  player_id: string | null;
  position: string | null;
  label: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  direct_edge_score?: number | null;
  pick_breakdown?: EvaluatedAsset["pick_breakdown"];
  fallback_warnings?: string[];
};

export interface EvaluateTradeOptions {
  valuationProfile?: TradeValuationProfile;
  includeComparison?: boolean;
}

const DEFAULT_VALUATION_PROFILE: TradeValuationProfile = "ktc_league";
const TRADE_FAIR_PERCENT_GAP = 8;
const TRADE_SLIGHT_EDGE_PERCENT_GAP = 18;

function normalizeValuationProfile(value: unknown): TradeValuationProfile {
  if (value === "ktc" || value === "ktc_league" || value === "composite") {
    return value;
  }
  return DEFAULT_VALUATION_PROFILE;
}

function clampMarketValue(value: number): number {
  return Math.max(0, Math.min(MAX_MARKET_VALUE, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function fairnessFromGap(percentGap: number): TradeEvaluation["fairness"] {
  if (percentGap <= TRADE_FAIR_PERCENT_GAP) return "fair";
  if (percentGap <= TRADE_SLIGHT_EDGE_PERCENT_GAP) return "slight_edge";
  return "lopsided";
}

function summaryFromTotals(
  profile: TradeValuationProfileSummary["profile"],
  sideA: number,
  sideB: number,
  valueAdjustment = 0
): TradeValuationProfileSummary {
  const roundedA = Math.round(sideA * 10) / 10;
  const roundedB = Math.round(sideB * 10) / 10;
  const delta = Math.round((roundedA - roundedB) * 10) / 10;
  const maxTotal = Math.max(roundedA, roundedB, 1);
  const percentGap = Math.round((Math.abs(delta) / maxTotal) * 1000) / 10;
  const fairness = fairnessFromGap(percentGap);
  const winner: TradeEvaluation["winner"] =
    fairness === "fair" ? "even" : delta > 0 ? "sideA" : "sideB";

  return {
    profile,
    sideA_total: roundedA,
    sideB_total: roundedB,
    delta,
    fairness,
    winner,
    percent_gap: percentGap,
    value_adjustment: Math.round(valueAdjustment * 10) / 10,
  };
}

function ktcMarketValue(raw: RawEval): number {
  return clampMarketValue(raw.ktc_value ?? 0);
}

type TradeContextCalculation = ReturnType<typeof calculateTradeContext>;

export function buildValuationComparison(params: {
  profile: TradeValuationProfile;
  evalA: EvaluatedAsset[];
  evalB: EvaluatedAsset[];
  rawKtcValuesA: number[];
  rawKtcValuesB: number[];
  context: TradeContextCalculation;
}): TradeValuationComparison {
  const baseA = params.evalA.reduce((sum, asset) => sum + (asset.base_market_value ?? 0), 0);
  const baseB = params.evalB.reduce((sum, asset) => sum + (asset.base_market_value ?? 0), 0);
  const leagueA = params.evalA.reduce((sum, asset) => sum + (asset.league_market_value ?? asset.base_market_value ?? 0), 0);
  const leagueB = params.evalB.reduce((sum, asset) => sum + (asset.league_market_value ?? asset.base_market_value ?? 0), 0);
  const rawKtcA = params.rawKtcValuesA.reduce((sum, value) => sum + value, 0);
  const rawKtcB = params.rawKtcValuesB.reduce((sum, value) => sum + value, 0);

  return {
    current: summaryFromTotals(
      params.profile,
      params.context.sideA.finalTotal,
      params.context.sideB.finalTotal,
      params.context.valueAdjustment
    ),
    raw_ktc: summaryFromTotals("raw_ktc", rawKtcA, rawKtcB, 0),
    league_adjustment: {
      sideA_delta: Math.round((leagueA - baseA) * 10) / 10,
      sideB_delta: Math.round((leagueB - baseB) * 10) / 10,
    },
    package_context_adjustment: {
      sideA_delta: Math.round((params.context.sideA.finalTotal - leagueA) * 10) / 10,
      sideB_delta: Math.round((params.context.sideB.finalTotal - leagueB) * 10) / 10,
    },
  };
}

export interface TradeHealthAssetInput {
  player_id?: string | null;
  position: string | null;
  label: string;
  edge_score: number;
}

export interface TradeHealthPlayerInfo {
  player_id: string;
  full_name: string | null;
  position: string | null;
  age: number | null;
  trend_30day: number | null;
  current_fc_value: number | null;
  historical_peak_fc_value: number | null;
  edge_score: number | null;
}

function formatPlayerName(asset: TradeHealthAssetInput, info?: TradeHealthPlayerInfo | null): string {
  const label = info?.full_name || asset.label || "This player";
  return label.replace(/\s+\([A-Z]{1,3}\)$/, "");
}

function tradeDirectionForPlayer(info: TradeHealthPlayerInfo): "increasing" | "stable" | "decreasing" {
  const zone = getAgeCurveStatus(info.position ?? "", info.age).zone;
  const trend = info.trend_30day ?? 0;
  if (zone === "Ascent" && trend > 0) return "increasing";
  if ((zone === "Decline" || zone === "Cliff") && trend <= 0) return "decreasing";
  return "stable";
}

export async function loadTradeHealthPlayerInfo(
  playerIds: string[],
  edgeScoreByPlayerId: Map<string, number> = new Map()
): Promise<Map<string, TradeHealthPlayerInfo>> {
  const uniqueIds = [...new Set(playerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const [playerRows, latestFantasycalcRows, historicalRows] = await Promise.all([
    db.execute(sql`
      SELECT player_id, full_name, position, age
      FROM players_master
      WHERE player_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
    `),
    db.execute(sql`
      SELECT sleeper_id AS player_id, dynasty_value::float AS dynasty_value, trend_30day::float AS trend_30day
      FROM fantasycalc_daily
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        AND sleeper_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
    `),
    db.execute(sql`
      SELECT player_id, MAX(fc_value)::float AS peak_fc_value
      FROM player_value_snapshots
      WHERE player_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY player_id
    `),
  ]);

  const latestMap = new Map<string, { dynasty_value: number | null; trend_30day: number | null }>();
  for (const row of latestFantasycalcRows as unknown as Array<{
    player_id: string;
    dynasty_value: number | null;
    trend_30day: number | null;
  }>) {
    latestMap.set(row.player_id, {
      dynasty_value: row.dynasty_value ?? null,
      trend_30day: row.trend_30day ?? null,
    });
  }

  const historicalMap = new Map<string, number | null>();
  for (const row of historicalRows as unknown as Array<{
    player_id: string;
    peak_fc_value: number | null;
  }>) {
    historicalMap.set(row.player_id, row.peak_fc_value ?? null);
  }

  const infoMap = new Map<string, TradeHealthPlayerInfo>();
  for (const row of playerRows as unknown as Array<{
    player_id: string;
    full_name: string | null;
    position: string | null;
    age: number | null;
  }>) {
    const latest = latestMap.get(row.player_id);
    infoMap.set(row.player_id, {
      player_id: row.player_id,
      full_name: row.full_name ?? null,
      position: row.position ?? null,
      age: row.age ?? null,
      trend_30day: latest?.trend_30day ?? null,
      current_fc_value: latest?.dynasty_value ?? null,
      historical_peak_fc_value: historicalMap.get(row.player_id) ?? null,
      edge_score: edgeScoreByPlayerId.get(row.player_id) ?? null,
    });
  }

  return infoMap;
}

export function tradeHealthCheck(
  sideA: TradeHealthAssetInput[],
  sideB: TradeHealthAssetInput[],
  playersData: Map<string, TradeHealthPlayerInfo>,
  fairness?: TradeEvaluation["fairness"]
): TradeHealthWarning[] {
  const warnings: TradeHealthWarning[] = [];
  const seen = new Set<string>();

  const sideAPlayers = sideA
    .map((asset) => {
      const info = asset.player_id ? playersData.get(asset.player_id) : null;
      return info ? { asset, info } : null;
    })
    .filter((entry): entry is { asset: TradeHealthAssetInput; info: TradeHealthPlayerInfo } => !!entry);
  const sideBPlayers = sideB
    .map((asset) => {
      const info = asset.player_id ? playersData.get(asset.player_id) : null;
      return info ? { asset, info } : null;
    })
    .filter((entry): entry is { asset: TradeHealthAssetInput; info: TradeHealthPlayerInfo } => !!entry);

  const pushWarning = (warning: TradeHealthWarning) => {
    const key = `${warning.type}:${warning.rule}:${warning.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(warning);
  };

  const ascendingAssets = sideAPlayers.filter(({ info }) => getAgeCurveStatus(info.position ?? "", info.age).zone === "Ascent");
  const sideBDecliningOnly =
    sideBPlayers.length > 0 &&
    sideBPlayers.every(({ info }) => {
      const zone = getAgeCurveStatus(info.position ?? "", info.age).zone;
      return zone === "Decline" || zone === "Cliff";
    });
  if (ascendingAssets.length > 0 && sideBDecliningOnly) {
    const ascending = ascendingAssets[0];
    const veteran = sideBPlayers[0];
    pushWarning({
      type: "block",
      rule: "ascending_for_declining",
      message: `${formatPlayerName(ascending.asset, ascending.info)} is ${ascending.info.age ?? "young"} and ascending. ${formatPlayerName(veteran.asset, veteran.info)} is ${veteran.info.age ?? "older"} and declining. Do not trade ascending youth for declining veterans.`,
    });
  }

  for (const { asset, info } of sideBPlayers) {
    const currentValue = info.current_fc_value ?? null;
    const peakValue = info.historical_peak_fc_value ?? null;
    if (
      (info.age ?? 0) >= 27 &&
      currentValue != null &&
      peakValue != null &&
      peakValue > 0 &&
      currentValue >= peakValue * 0.9
    ) {
      pushWarning({
        type: "warning",
        rule: "career_year_sell_signal",
        message: `${formatPlayerName(asset, info)} is ${info.age} and at peak value. This is a sell window for them, not a buy signal for you.`,
      });
    }
  }

  const sideAIncreasingValue = sideAPlayers.reduce((sum, { asset, info }) => {
    return tradeDirectionForPlayer(info) === "increasing"
      ? sum + (asset.edge_score || info.edge_score || 0)
      : sum;
  }, 0);
  const sideBIncreasingValue = sideBPlayers.reduce((sum, { asset, info }) => {
    return tradeDirectionForPlayer(info) === "increasing"
      ? sum + (asset.edge_score || info.edge_score || 0)
      : sum;
  }, 0);
  if (sideAIncreasingValue > sideBIncreasingValue && sideAIncreasingValue > 0) {
    pushWarning({
      type: "warning",
      rule: "value_direction",
      message: "You are giving up more appreciating assets than you are acquiring.",
    });
  }

  for (const { asset, info } of sideAPlayers) {
    const position = (info.position ?? asset.position ?? "").toUpperCase();
    const age = info.age ?? null;
    const edgeScore = asset.edge_score || info.edge_score || 0;
    const protectedYoungCore =
      (position === "WR" && age != null && age < 24 && edgeScore >= 65) ||
      (position === "QB" && age != null && age < 26 && edgeScore >= 65) ||
      (age != null && age < 23 && edgeScore >= 55);
    if (!protectedYoungCore) continue;
    pushWarning({
      type: "warning",
      rule: "young_core_protection",
      message: `${formatPlayerName(asset, info)} is part of your young core. Only move them for an overwhelming return.`,
    });
  }

  const hasDynastyWarnings = warnings.some((warning) => warning.type === "warning");
  if (hasDynastyWarnings && (fairness === "fair" || fairness === "slight_edge")) {
    pushWarning({
      type: "warning",
      rule: "roster_fit_trap",
      message: "This trade looks fair by current value but has dynasty direction concerns.",
    });
  }

  return warnings;
}

async function evaluateAssets(
  assets: TradeAssetInput[],
  mode: "sf" | "1qb",
  valueType: ValueType,
  leagueId?: string,
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights
): Promise<RawEval[]> {
  if (assets.length === 0) return [];

  const playerIds = assets
    .filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id)
    .map((a) => a.player_id);

  const uniquePlayerIds = [...new Set(playerIds)];
  const [compMap, nameRows, pickMaps] = await Promise.all([
    getCompositeValues(uniquePlayerIds, mode, valueType, weights),
    uniquePlayerIds.length > 0
      ? db.execute(sql`
          SELECT player_id, full_name, position
          FROM players_master
          WHERE player_id IN (${sql.join(uniquePlayerIds.map((id) => sql`${id}`), sql`, `)})
        `)
      : Promise.resolve([]),
    loadPickValueMaps(mode),
  ]);

  let leagueSize = 12;
  if (leagueId) {
    const leagueRows = await db.execute(sql`
      SELECT total_rosters FROM leagues WHERE league_id = ${leagueId} LIMIT 1
    `);
    const totalRosters = (leagueRows as unknown as Array<{ total_rosters: number | null }>)[0]?.total_rosters;
    if (totalRosters && totalRosters > 0) leagueSize = totalRosters;
  }

  const names = new Map<string, { full_name: string; position: string }>();
  for (const r of nameRows as unknown as { player_id: string; full_name: string; position: string }[]) {
    names.set(r.player_id, { full_name: r.full_name, position: r.position });
  }

  return Promise.all(assets.map(async (asset) => {
    if (asset.type === "player" && asset.player_id) {
      const comp = compMap.get(asset.player_id);
      const meta = names.get(asset.player_id);
      const assetName = meta?.full_name ?? `Player ${asset.player_id}`;
      return {
        asset_id: asset.player_id,
        asset_key: tradeAssetKey(asset),
        asset_name: assetName,
        asset_type: "player" as const,
        player_id: asset.player_id,
        position: meta?.position ?? null,
        label: meta ? `${meta.full_name} (${meta.position})` : assetName,
        fc_value: comp?.fc_value ?? null,
        ktc_value: comp?.ktc_value ?? null,
        dp_value: comp?.dp_value ?? null,
        fallback_warnings: comp ? [] : [`No player market row was found for ${assetName}; Edge fallback may be used.`],
      };
    }

    const pick = normalizePick(asset);
    const pickBreakdown = await getTradePickBreakdown(
      {
        pick_season: pick.season,
        pick_round: pick.round,
        pick_tier: pick.tier,
        pick_slot: asset.pick_slot,
        pick_label: asset.pick_label,
        pick_original_owner_id: asset.pick_original_owner_id,
      },
      {
        leagueSize,
        format: mode,
        classStrengths,
      }
    );
    if (asset.pick_slot != null && asset.pick_slot > 0) {
      const interpolated = interpolatePickValue(
        asset.pick_slot,
        pick.round,
        pick.season,
        pickMaps,
        leagueSize
      );
      const label = pickBreakdown.pickLabel ?? asset.pick_label ?? interpolated.label;
      return {
        asset_id: tradeAssetKey(asset),
        asset_key: tradeAssetKey(asset),
        asset_name: label,
        asset_type: "pick" as const,
        player_id: null,
        position: null,
        label,
        fc_value: null,
        ktc_value: interpolated.ktcValue,
        dp_value: interpolated.dpValue,
        direct_edge_score: pickBreakdown.finalValue,
        pick_breakdown: pickBreakdown,
        fallback_warnings: interpolated.ktcValue == null && interpolated.dpValue == null
          ? [`No KTC or DynastyProcess exact-slot source was found for ${label}; pick curve fallback was used.`]
          : [],
      };
    }

    const roundName = ROUND_NAMES[pick.round] ?? `R${pick.round}`;
    const tierLabel = pick.tier.charAt(0).toUpperCase() + pick.tier.slice(1);
    const label = asset.pick_label ?? `${pick.season} ${tierLabel} ${roundName}`;

    const ktcValue =
      pickMaps.ktcMap.get(`${pick.season}|${pick.tier}|${pick.round}`) ??
      pickMaps.ktcMap.get(`${pick.season}||${pick.round}`) ??
      null;
    const dpValue =
      pickMaps.dpMap.get(`${pick.season} ${tierLabel} ${roundName}`.toLowerCase()) ??
      pickMaps.dpMap.get(`${pick.season} ${roundName}`.toLowerCase()) ??
      null;

    return {
      asset_id: tradeAssetKey(asset),
      asset_key: tradeAssetKey(asset),
      asset_name: pickBreakdown.pickLabel ?? label,
      asset_type: "pick" as const,
      player_id: null,
      position: null,
      label: pickBreakdown.pickLabel ?? label,
      fc_value: null,
      ktc_value: ktcValue,
      dp_value: dpValue,
      direct_edge_score: pickBreakdown.finalValue,
      pick_breakdown: pickBreakdown,
      fallback_warnings: ktcValue == null && dpValue == null
        ? [`No KTC or DynastyProcess tier source was found for ${pickBreakdown.pickLabel ?? label}; pick curve fallback was used.`]
        : [],
    };
  }));
}

function toEvaluatedAsset(
  raw: RawEval,
  edge: { score: number; fc_score: number | null; ktc_score: number | null; dp_score: number | null },
  globalScale: GlobalScaleParams,
  weights?: SourceWeights
): EvaluatedAsset {
  const edgeScore = raw.direct_edge_score ?? edge.score;
  const marketValue = calculateMarketValueFromSources(
    {
      edgeScore,
      fcValue: raw.fc_value,
      ktcValue: raw.ktc_value,
      dpValue: raw.dp_value,
    },
    globalScale,
    weights
  );
  const fallbackWarnings = [
    ...(raw.fallback_warnings ?? []),
    ...marketValue.fallbackWarnings,
  ];
  const adjustmentReasons: TradeValuationAdjustmentReason[] =
    marketValue.calculationReasons.map((reason) => ({
      stage: "base_market_value",
      label: "Base market value",
      reason,
      amount: marketValue.marketValue,
    }));

  return {
    asset_id: raw.asset_id,
    asset_key: raw.asset_key,
    asset_name: raw.asset_name,
    asset_type: raw.asset_type,
    player_id: raw.player_id,
    position: raw.position,
    label: raw.label,
    edge_score: edgeScore,
    base_market_value: marketValue.marketValue,
    league_market_value: marketValue.marketValue,
    context_trade_value: marketValue.marketValue,
    market_value_source: marketValue.marketValueSource,
    source_market_values: marketValue.sourceMarketValues,
    adjustment_reasons: adjustmentReasons,
    fallback_warnings: fallbackWarnings,
    trade_power: marketValue.marketValue,
    fc_score: edge.fc_score,
    ktc_score: edge.ktc_score,
    dp_score: edge.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    scoring_multiplier: null,
    lineup_scarcity_multiplier: null,
    ppg: null,
    source_agreement: scoreAgreement([edge.fc_score, edge.ktc_score, edge.dp_score]),
    pick_breakdown: raw.pick_breakdown ?? null,
  };
}

export function toKtcEvaluatedAsset(raw: RawEval): EvaluatedAsset {
  const marketValue = ktcMarketValue(raw);
  const edgeScore = marketValue > 0 ? edgeEquivalentFromMarketValue(marketValue) : 0;
  const fallbackWarnings = [...(raw.fallback_warnings ?? [])];
  if (raw.ktc_value == null || raw.ktc_value <= 0) {
    fallbackWarnings.push(`${raw.asset_name ?? raw.label} has no usable KeepTradeCut value for this format.`);
  }
  const adjustmentReasons: TradeValuationAdjustmentReason[] = [{
    stage: "base_market_value",
    label: "KTC base value",
    reason: "KTC valuation mode used only the KeepTradeCut market value for this asset.",
    amount: marketValue,
  }];

  return {
    asset_id: raw.asset_id,
    asset_key: raw.asset_key,
    asset_name: raw.asset_name,
    asset_type: raw.asset_type,
    player_id: raw.player_id,
    position: raw.position,
    label: raw.label,
    edge_score: edgeScore,
    base_market_value: marketValue,
    league_market_value: marketValue,
    context_trade_value: marketValue,
    market_value_source: "raw_sources",
    source_market_values: {
      fc: null,
      ktc: raw.ktc_value ?? null,
      dp: null,
      edge_fallback: marketValueFromEdge(edgeScore),
    },
    adjustment_reasons: adjustmentReasons,
    fallback_warnings: fallbackWarnings,
    trade_power: marketValue,
    fc_score: null,
    ktc_score: edgeScore > 0 ? edgeScore : null,
    dp_score: null,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    scoring_multiplier: null,
    lineup_scarcity_multiplier: null,
    ppg: null,
    source_agreement: raw.ktc_value != null && raw.ktc_value > 0 ? "high" : "low",
    pick_breakdown: raw.pick_breakdown ?? null,
  };
}

function gradeFromScore(score: number): LeaguePlayerRatingGrade {
  if (score >= 97) return "A+";
  if (score >= 92) return "A";
  if (score >= 88) return "A-";
  if (score >= 84) return "B+";
  if (score >= 78) return "B";
  if (score >= 72) return "B-";
  if (score >= 66) return "C+";
  if (score >= 60) return "C";
  if (score >= 52) return "C-";
  return "D";
}

function directionFromScore(score: number): LeaguePlayerRatingComponent["direction"] {
  if (score >= 70) return "boost";
  if (score <= 46) return "drag";
  return "neutral";
}

function ratingComponent(score: number, reason: string): LeaguePlayerRatingComponent {
  const rounded = Math.round(clamp(score, 0, 100));
  return {
    score: rounded,
    grade: gradeFromScore(rounded),
    direction: directionFromScore(rounded),
    reason,
  };
}

function scoreFromMultiplier(multiplier: number | null | undefined, scale: number): number {
  if (multiplier == null || !Number.isFinite(multiplier)) return 58;
  return clamp(58 + (multiplier - 1) * scale, 20, 100);
}

function signedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${roundTo(value, 1)}%`;
}

export function buildLeaguePlayerRating(
  asset: EvaluatedAsset,
  projection: LeagueProjectionProfile | null = null
): LeaguePlayerRating | null {
  if (asset.asset_type === "pick" || !asset.player_id) return null;

  const rawValue = Math.max(0, Math.round(asset.base_market_value ?? 0));
  const leagueValue = Math.max(0, Math.round(asset.league_market_value ?? rawValue));
  const contextValue = asset.context_trade_value ?? asset.trade_power ?? leagueValue;
  const delta = leagueValue - rawValue;
  const deltaPct = rawValue > 0 ? (delta / rawValue) * 100 : 0;

  const scoringMultiplier = asset.scoring_multiplier ?? 1;
  const scoringScore = scoreFromMultiplier(scoringMultiplier, 185);
  const scoringDelta = asset.scoring_delta_ppg;
  const scoringFit = ratingComponent(
    scoringScore,
    scoringDelta != null
      ? `${asset.position ?? "Player"} scoring fit is ${signedPct((scoringMultiplier - 1) * 100)} with ${scoringDelta >= 0 ? "+" : ""}${roundTo(scoringDelta, 1)} projected PPG versus the KTC baseline.`
      : `${asset.position ?? "Player"} scoring fit is ${signedPct((scoringMultiplier - 1) * 100)} versus the base market profile.`
  );

  const scarcityMultiplier = asset.lineup_scarcity_multiplier ?? 1;
  const lineupScarcity = ratingComponent(
    scoreFromMultiplier(scarcityMultiplier, 230),
    `${asset.position ?? "Player"} lineup scarcity is ${signedPct((scarcityMultiplier - 1) * 100)} from this league's starting slots and flex eligibility.`
  );

  const valueRating = edgeEquivalentFromMarketValue(leagueValue);
  const projectedPpg = projection?.projectedLeaguePpg ?? asset.ppg ?? null;
  const projectionScore = projection
    ? clamp(valueRating + (projection.projectedLeaguePpg - projection.projectedKtcBaselinePpg) * 1.4 + (projection.availabilityRate - 0.85) * 24, 20, 100)
    : clamp(valueRating - 5, 25, 95);
  const projectionValue = ratingComponent(
    projectionScore,
    projection
      ? `${roundTo(projection.projectedLeaguePpg, 1)} projected league PPG over a ${projection.projectionYears}-year window; ${roundTo(projection.projectedKtcBaselinePpg, 1)} PPG in the KTC baseline.`
      : projectedPpg != null
        ? `${roundTo(projectedPpg, 1)} league PPG is available, but no forward projection profile was attached.`
        : "No forward projection profile was attached; projection value is neutral."
  );

  const trajectoryScore = projection?.trajectoryScore ?? 0;
  const ageWindow = ratingComponent(
    projection
      ? clamp(74 + trajectoryScore * 38, 25, 100)
      : 62,
    projection
      ? `Age window is ${projection.trajectoryLabel}; trajectory score ${trajectoryScore >= 0 ? "+" : ""}${roundTo(trajectoryScore, 2)} over the 2-3 year window.`
      : "Age window is neutral because no forward trajectory profile was attached."
  );

  const liquidityBase = edgeEquivalentFromMarketValue(rawValue);
  const agreementBoost = asset.source_agreement === "high" ? 4 : asset.source_agreement === "medium" ? 0 : -6;
  const liquidity = ratingComponent(
    clamp(liquidityBase + agreementBoost, 20, 100),
    `Liquidity starts from raw market value ${rawValue.toLocaleString()} with ${asset.source_agreement} source agreement.`
  );

  const riskScore = projection
    ? clamp(80 + (projection.availabilityRate - 0.85) * 34 + trajectoryScore * 12, 20, 100)
    : asset.source_agreement === "low"
      ? 55
      : 68;
  const risk = ratingComponent(
    riskScore,
    projection
      ? `Projected availability is ${Math.round(projection.availabilityRate * 100)}% with ${projection.trajectoryLabel} value trajectory.`
      : "Risk is neutral because projection availability was unavailable."
  );

  const componentAverage =
    scoringFit.score * 0.17 +
    lineupScarcity.score * 0.15 +
    projectionValue.score * 0.23 +
    ageWindow.score * 0.13 +
    liquidity.score * 0.20 +
    risk.score * 0.12;
  const rating = Math.round(clamp(valueRating * 0.68 + componentAverage * 0.32, 0, 99));

  const tags: string[] = [];
  if (rating >= 96 || leagueValue >= 10_000) tags.push("League Anchor");
  if (scoringFit.score >= 75) tags.push("Scoring Winner");
  if (scoringFit.score <= 45) tags.push("Scoring Drag");
  if (lineupScarcity.score >= 74) tags.push("Hard To Replace");
  if (projectionValue.score >= 88) tags.push("Projection Edge");
  if (ageWindow.score >= 84) tags.push("Ascending Window");
  if (ageWindow.score <= 50) tags.push("Declining Window");
  if (liquidity.score >= 88) tags.push("Liquid Asset");
  if (risk.score <= 55) tags.push("Risk Flag");
  if (deltaPct >= 12) tags.push("Underpriced Here");
  if (deltaPct <= -10) tags.push("Overpriced Here");

  const strongest = [
    { label: "scoring", component: scoringFit },
    { label: "scarcity", component: lineupScarcity },
    { label: "projection", component: projectionValue },
    { label: "age", component: ageWindow },
    { label: "liquidity", component: liquidity },
  ]
    .sort((a, b) => b.component.score - a.component.score)
    .slice(0, 2)
    .map(({ label, component }) => `${label} ${component.grade}`)
    .join(", ");

  return {
    rating,
    grade: gradeFromScore(rating),
    raw_market_value: rawValue,
    league_market_value: leagueValue,
    context_trade_value: contextValue,
    league_value_delta: delta,
    league_value_delta_pct: roundTo(deltaPct, 1),
    scoring_fit: scoringFit,
    lineup_scarcity: lineupScarcity,
    projection_value: projectionValue,
    age_window: ageWindow,
    liquidity,
    risk,
    tags,
    summary: `${gradeFromScore(rating)} league rating; ${signedPct(deltaPct)} vs raw market. Strongest signals: ${strongest}.`,
  };
}

function valuationWarningsForAsset(
  asset: EvaluatedAsset,
  side: "sideA" | "sideB"
): TradeValuationWarning[] {
  const warnings: TradeValuationWarning[] = [];
  if (asset.market_value_source === "edge_fallback") {
    warnings.push({
      type: "missing_data",
      severity: "warning",
      side,
      asset_key: asset.asset_key ?? asset.player_id ?? asset.label,
      message: `${asset.asset_name ?? asset.label} used Edge fallback because usable market source values were missing.`,
    });
  }
  for (const message of asset.fallback_warnings ?? []) {
    warnings.push({
      type: "fallback",
      severity: "info",
      side,
      asset_key: asset.asset_key ?? asset.player_id ?? asset.label,
      message: `${asset.asset_name ?? asset.label}: ${message}`,
    });
  }
  return warnings;
}

function dedupeWarnings(warnings: TradeValuationWarning[]): TradeValuationWarning[] {
  const seen = new Set<string>();
  const out: TradeValuationWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.type}:${warning.severity}:${warning.side ?? ""}:${warning.asset_key ?? ""}:${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(warning);
  }
  return out;
}

export async function evaluateTrade(
  sideA: TradeAssetInput[],
  sideB: TradeAssetInput[],
  mode: "sf" | "1qb",
  valueType: ValueType = "dynasty",
  weights?: SourceWeights,
  leagueId?: string,
  classStrengths?: ClassStrengthMap,
  options: EvaluateTradeOptions = {}
): Promise<TradeEvaluation> {
  const valuationProfile = normalizeValuationProfile(options.valuationProfile);
  const validationWarnings = validateTradeAssets(sideA, sideB);
  const [rawA, rawB, globalScale] = await Promise.all([
    evaluateAssets(sideA, mode, valueType, leagueId, classStrengths, weights),
    evaluateAssets(sideB, mode, valueType, leagueId, classStrengths, weights),
    getGlobalScaleParams(mode, valueType),
  ]);

  const allRaw = [...rawA, ...rawB];
  const rawKtcValuesA = rawA.map(ktcMarketValue);
  const rawKtcValuesB = rawB.map(ktcMarketValue);
  const inputs = allRaw.map((a, i) => ({
    sleeper_id: String(i),
    fc_value: a.fc_value,
    ktc_value: a.ktc_value,
    dp_value: a.dp_value,
  }));

  const edgeMap = computeEdgeScores(inputs, globalScale, weights);

  const evalA: EvaluatedAsset[] = rawA.map((a, i) =>
    valuationProfile === "composite"
      ? toEvaluatedAsset(
          a,
          edgeMap.get(String(i)) ?? { score: 0, fc_score: null, ktc_score: null, dp_score: null },
          globalScale,
          weights
        )
      : toKtcEvaluatedAsset(a)
  );
  const evalB: EvaluatedAsset[] = rawB.map((a, i) =>
    valuationProfile === "composite"
      ? toEvaluatedAsset(
          a,
          edgeMap.get(String(rawA.length + i)) ?? { score: 0, fc_score: null, ktc_score: null, dp_score: null },
          globalScale,
          weights
        )
      : toKtcEvaluatedAsset(a)
  );

  const loadedLeagueContext = leagueId ? await loadLeagueMarketContext(leagueId, mode) : null;
  const leagueContext = loadedLeagueContext ?? buildLeagueMarketContext({
    scoringSettings: null,
    rosterPositions: null,
    totalRosters: null,
    fallbackMode: mode,
  });
  const allPlayerIds = [...new Set([...evalA, ...evalB].map((a) => a.player_id).filter((id): id is string => !!id))];
  const shouldApplyLeagueAdjustment = valuationProfile !== "ktc";
  const shouldUseKtcLeagueProjection = valuationProfile === "ktc_league" && shouldApplyLeagueAdjustment && leagueContext;
  let ktcLeagueProjectionWarning: string | null = null;
  const [usageMap, projectionMap] = await Promise.all([
    shouldApplyLeagueAdjustment && !shouldUseKtcLeagueProjection
      ? loadPlayerUsageStats(allPlayerIds)
      : Promise.resolve(new Map()),
    shouldUseKtcLeagueProjection
      ? loadSleeperProjectionProfiles(allPlayerIds, leagueContext).catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : "unknown error";
          ktcLeagueProjectionWarning = `Sleeper projection data was unavailable (${detail}); KTC League used league structure only.`;
          return new Map();
        })
      : Promise.resolve(new Map()),
  ]);
  const ppgMap = shouldApplyLeagueAdjustment && leagueContext && valueType === "redraft"
    ? await computeLeaguePPG(allPlayerIds, leagueContext.scoring)
    : new Map<string, { ppg: number }>();

  for (const asset of [...evalA, ...evalB]) {
    if (!shouldApplyLeagueAdjustment) {
      continue;
    }
    const usage = asset.player_id ? usageMap.get(asset.player_id) ?? null : null;
    const projection = asset.player_id ? projectionMap.get(asset.player_id) ?? null : null;
    const adjustment = applyLeagueMarketAdjustment({
      baseMarketValue: asset.base_market_value ?? 0,
      edgeScore: asset.edge_score,
      position: asset.position,
      usage,
      projection,
      context: leagueContext,
      model: valuationProfile === "ktc_league" ? "ktc_league" : "composite",
    });
    asset.league_market_value = adjustment.leagueMarketValue;
    asset.scoring_multiplier = adjustment.scoringMultiplier;
    asset.lineup_scarcity_multiplier = adjustment.lineupScarcityMultiplier;
    asset.scoring_delta_ppg = adjustment.scoringDeltaPpg;
    asset.league_adjusted_score = adjustment.leagueAdjustedScore;
    asset.ppg = projection?.projectedLeaguePpg ?? (asset.player_id ? ppgMap.get(asset.player_id)?.ppg ?? null : null);
    asset.adjustment_reasons = [
      ...(asset.adjustment_reasons ?? []),
      ...adjustment.reasons.map((reason) => ({
        stage: "league_market_value" as const,
        label: "League market adjustment",
        reason,
        amount: adjustment.leagueMarketValue,
      })),
    ];
    asset.fallback_warnings = [
      ...(asset.fallback_warnings ?? []),
      ...adjustment.warnings,
    ];
  }

  const leagueValuesA = evalA.map((a) => a.league_market_value ?? a.base_market_value ?? 0);
  const leagueValuesB = evalB.map((a) => a.league_market_value ?? a.base_market_value ?? 0);
  const tvResult = valuationProfile === "composite"
    ? calculateTradeContext(leagueValuesA, leagueValuesB)
    : calculateKtcTradeContext(
        leagueValuesA,
        leagueValuesB,
        valuationProfile === "ktc_league" ? { adjustmentMode: "league" } : undefined
      );

  for (let i = 0; i < evalA.length; i++) {
    const contextValue = tvResult.sideA.contextValues[i] ?? leagueValuesA[i] ?? 0;
    evalA[i].context_trade_value = contextValue;
    evalA[i].trade_power = contextValue;
    evalA[i].adjustment_reasons = [
      ...(evalA[i].adjustment_reasons ?? []),
      {
        stage: "context_trade_value",
        label: "Trade context adjustment",
        reason: contextValue !== leagueValuesA[i]
          ? `Context trade value adjusted from league market value by ${Math.round((contextValue - (leagueValuesA[i] ?? 0)) * 10) / 10}.`
          : "Context trade value equals league market value for this asset.",
        amount: contextValue,
      },
    ];
  }
  for (let i = 0; i < evalB.length; i++) {
    const contextValue = tvResult.sideB.contextValues[i] ?? leagueValuesB[i] ?? 0;
    evalB[i].context_trade_value = contextValue;
    evalB[i].trade_power = contextValue;
    evalB[i].adjustment_reasons = [
      ...(evalB[i].adjustment_reasons ?? []),
      {
        stage: "context_trade_value",
        label: "Trade context adjustment",
        reason: contextValue !== leagueValuesB[i]
          ? `Context trade value adjusted from league market value by ${Math.round((contextValue - (leagueValuesB[i] ?? 0)) * 10) / 10}.`
          : "Context trade value equals league market value for this asset.",
        amount: contextValue,
      },
    ];
  }

  if (shouldApplyLeagueAdjustment) {
    for (const asset of [...evalA, ...evalB]) {
      const projection = asset.player_id ? projectionMap.get(asset.player_id) ?? null : null;
      asset.league_rating = buildLeaguePlayerRating(asset, projection);
    }
  }

  const totalEdgeA = Math.round(evalA.reduce((s, a) => s + a.edge_score, 0) * 10) / 10;
  const totalEdgeB = Math.round(evalB.reduce((s, a) => s + a.edge_score, 0) * 10) / 10;
  const totalBaseA = Math.round(evalA.reduce((s, a) => s + (a.base_market_value ?? 0), 0));
  const totalBaseB = Math.round(evalB.reduce((s, a) => s + (a.base_market_value ?? 0), 0));
  const allMarketAssets = [
    ...evalA.map((asset) => ({ side: "sideA" as const, asset })),
    ...evalB.map((asset) => ({ side: "sideB" as const, asset })),
  ];
  const bestMarketAsset = allMarketAssets
    .filter(({ asset }) => (asset.league_market_value ?? 0) > 0)
    .sort((a, b) => (b.asset.league_market_value ?? 0) - (a.asset.league_market_value ?? 0))[0];
  const healthScoreMap = new Map<string, number>();
  for (const asset of [...evalA, ...evalB]) {
    if (asset.player_id) healthScoreMap.set(asset.player_id, asset.edge_score);
  }
  const tradeHealth = await loadTradeHealthPlayerInfo(
    [...healthScoreMap.keys()],
    healthScoreMap
  );
  const healthCheck = tradeHealthCheck(evalA, evalB, tradeHealth, tvResult.fairness);
  const leagueWarnings: TradeValuationWarning[] = shouldApplyLeagueAdjustment
    ? [
        ...leagueContext.warnings.map((message) => ({
          type: "league_settings" as const,
          severity: "info" as const,
          side: null,
          message,
        })),
        ...(leagueId && !loadedLeagueContext
          ? [{
              type: "league_settings" as const,
              severity: "warning" as const,
              side: null,
              message: `League settings were not found for ${leagueId}; selected format fallback was used.`,
            }]
          : []),
        ...(ktcLeagueProjectionWarning
          ? [{
              type: "league_settings" as const,
              severity: "warning" as const,
              side: null,
              message: ktcLeagueProjectionWarning,
            }]
          : []),
      ]
    : [];
  const assetWarnings = [
    ...evalA.flatMap((asset) => valuationWarningsForAsset(asset, "sideA")),
    ...evalB.flatMap((asset) => valuationWarningsForAsset(asset, "sideB")),
  ];
  const warnings = dedupeWarnings([
    ...validationWarnings,
    ...leagueWarnings,
    ...assetWarnings,
  ]);
  const missingDataWarnings = warnings.filter((warning) => warning.type === "missing_data");
  const duplicateAssetWarnings = warnings.filter((warning) => warning.type === "duplicate_asset");
  const emptySideWarnings = warnings.filter((warning) => warning.type === "empty_side");
  const profileExplanation =
    valuationProfile === "ktc"
      ? "KTC valuation profile: base_market_value uses only raw KeepTradeCut values; league scoring adjustments are disabled; context_trade_value applies the package/context layer."
      : valuationProfile === "ktc_league"
        ? "KTC League valuation profile: base_market_value uses raw KeepTradeCut values, then league_market_value applies this league's scoring and scarcity context before package/context adjustment."
        : "Trade Calculator pipeline: base_market_value -> league_market_value -> context_trade_value.";
  const valuationExplanations = [
    profileExplanation,
    ...tvResult.explanations,
  ];

  return {
    sideA: {
      assets: evalA,
      total_edge: totalEdgeA,
      total_base_market_value: totalBaseA,
      total_league_market_value: tvResult.sideA.baseTotal,
      total_context_trade_value: tvResult.sideA.finalTotal,
      total_adjusted_trade_value: tvResult.sideA.finalTotal,
      total_trade_power: tvResult.sideA.finalTotal,
      package_penalty_pct: tvResult.sideA.packagePenaltyPct,
      asset_count: evalA.length,
      adjustment_explanation: tvResult.sideA.adjustmentExplanation,
    },
    sideB: {
      assets: evalB,
      total_edge: totalEdgeB,
      total_base_market_value: totalBaseB,
      total_league_market_value: tvResult.sideB.baseTotal,
      total_context_trade_value: tvResult.sideB.finalTotal,
      total_adjusted_trade_value: tvResult.sideB.finalTotal,
      total_trade_power: tvResult.sideB.finalTotal,
      package_penalty_pct: tvResult.sideB.packagePenaltyPct,
      asset_count: evalB.length,
      adjustment_explanation: tvResult.sideB.adjustmentExplanation,
    },
    delta: tvResult.delta,
    delta_edge: Math.round((totalEdgeA - totalEdgeB) * 10) / 10,
    fairness: tvResult.fairness,
    winner: tvResult.winner,
    value_adjustment_side: tvResult.valueAdjustmentSide,
    value_adjustment: tvResult.valueAdjustment,
    percent_gap: tvResult.percentGap,
    best_asset_side: tvResult.bestAssetSide,
    best_asset_edge: bestMarketAsset?.asset.edge_score ?? 0,
    best_asset_market_value: tvResult.bestAssetMarketValue,
    consolidation_warning: tvResult.consolidationWarning,
    needed_to_even: {
      side: tvResult.neededToEven.side,
      tradePowerGap: tvResult.neededToEven.tradePowerGap,
      suggestedEdgeScore: tvResult.neededToEven.suggestedEdgeScore,
      marketValue: tvResult.neededToEven.marketValue,
      edgeEquivalent: tvResult.neededToEven.edgeEquivalent,
      label: tvResult.neededToEven.label,
    },
    scoring_context_label: shouldApplyLeagueAdjustment ? leagueContext.label || null : null,
    healthCheck,
    valuation_profile: valuationProfile,
    valuation_comparison: options.includeComparison
      ? buildValuationComparison({
          profile: valuationProfile,
          evalA,
          evalB,
          rawKtcValuesA,
          rawKtcValuesB,
          context: tvResult,
        })
      : undefined,
    valuation_explanations: valuationExplanations,
    warnings,
    missing_data_warnings: missingDataWarnings,
    duplicate_asset_warnings: duplicateAssetWarnings,
    empty_side_warnings: emptySideWarnings,
  };
}

export async function searchTradeAssets(query: string, limit = 20): Promise<TradeSearchAsset[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.execute(sql`
    SELECT player_id, full_name, position, team
    FROM players_master
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
      AND full_name ILIKE ${`%${q}%`}
    ORDER BY
      CASE
        WHEN LOWER(full_name) = LOWER(${q}) THEN 0
        WHEN LOWER(full_name) LIKE LOWER(${`${q}%`}) THEN 1
        ELSE 2
      END,
      full_name ASC
    LIMIT ${Math.max(1, Math.min(limit, 50))}
  `);

  return (rows as unknown as {
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
  }[]).map((r) => ({
    type: "player",
    player_id: r.player_id,
    label: `${r.full_name} (${r.position}${r.team ? ` - ${r.team}` : ""})`,
    position: r.position,
    team: r.team,
  }));
}
